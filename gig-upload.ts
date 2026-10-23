import { getBearerToken } from "@/lib/auth/client";
import { nextUploadPercent, overSampleLimit, readContainerSeconds, SAMPLE_MAX_BYTES, SAMPLE_MAX_SECONDS } from "@/lib/shola/sample-limit";
import { FIT_BITS, fitFrame } from "@/lib/shola/fit-frame";

export const GIG_CHUNK = 1_500_000;
const ONE_SHOT = 2_500_000;
const PHOTO_CAP = 160_000;
const THUMB_CAP = 80_000;

function draw(bmp: ImageBitmap, edge: number, quality: number) {
  const scale = Math.min(1, edge / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("GIG_PHOTO");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

function squeeze(bmp: ImageBitmap, edge: number, cap: number) {
  let size = edge;
  let quality = 0.84;
  let data = draw(bmp, size, quality);
  let guard = 0;
  while (data.length > cap && guard < 24) {
    guard += 1;
    if (quality > 0.46) quality -= 0.08;
    else size = Math.max(240, Math.round(size * 0.72));
    data = draw(bmp, size, quality);
  }
  return data;
}

function readFailure(err: unknown) {
  const name = err instanceof Error ? err.name : "";
  const message = err instanceof Error ? err.message : String(err ?? "");
  if (name === "NotReadableError" || name === "NotAllowedError" || /could not be read|permission problem|NotReadableError/i.test(message)) {
    return new Error("GIG_READ");
  }
  return err instanceof Error ? err : new Error("GIG_READ");
}

function readAllBytes(file: Blob) {
  if (typeof FileReader === "undefined") return file.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer && result.byteLength > 0) resolve(result);
      else reject(new Error("GIG_READ"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("GIG_READ"));
    reader.readAsArrayBuffer(file);
  });
}

export function seizeFile(file: File) {
  const name = file.name && file.name !== "blob" ? file.name : "upload";
  const type = file.type || "";
  const stamp = file.lastModified || Date.now();
  return readAllBytes(file).then(
    (bytes) => {
      if (!bytes.byteLength) throw new Error("GIG_READ");
      return new File([bytes], name, { type, lastModified: stamp });
    },
    (err) => Promise.reject(readFailure(err)),
  );
}

export function ownGalleryFile(file: File) {
  return seizeFile(file);
}

export async function compressGigPhoto(file: File) {
  if (file.size < 1) throw new Error("GIG_PHOTO");
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      return { full: squeeze(bmp, Math.max(bmp.width, bmp.height), PHOTO_CAP), thumb: squeeze(bmp, 640, THUMB_CAP) };
    } finally {
      bmp.close();
    }
  } catch (err) {
    if (err instanceof Error && (err.message === "GIG_PHOTO" || err.message === "GIG_MEDIA")) throw err;
    throw new Error("GIG_PHOTO");
  }
}

export function videoMime(file: File) {
  const type = file.type.toLowerCase().split(";")[0].trim();
  if (type.startsWith("video/")) return type === "video/x-m4v" ? "video/mp4" : type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".mp4") || name.endsWith(".m4v")) return "video/mp4";
  if (name.endsWith(".mov")) return "video/quicktime";
  if (name.endsWith(".3gp")) return "video/3gpp";
  if (name.endsWith(".webm")) return "video/webm";
  return "";
}

function mimeFromBytes(head: Uint8Array) {
  const text = new TextDecoder("latin1").decode(head);
  const at = text.indexOf("ftyp");
  if (at >= 0) {
    const brand = text.slice(at + 4, at + 8).toLowerCase();
    if (brand.startsWith("3g")) return "video/3gpp";
    if (brand.trim() === "qt") return "video/quicktime";
    return "video/mp4";
  }
  for (let i = 0; i < head.length - 3; i += 1) {
    if (head[i] === 0x1a && head[i + 1] === 0x45 && head[i + 2] === 0xdf && head[i + 3] === 0xa3) return "video/webm";
  }
  return "";
}

export function sniffMime(file: File) {
  const named = videoMime(file);
  if (named) return Promise.resolve(named);
  return sliceBytes(file, 0, Math.min(file.size, 65536))
    .then((held) => mimeFromBytes(new Uint8Array(held, 0, Math.min(held.byteLength, 65536))) || "")
    .catch(() => "");
}

function fileName(file: File, mime: string) {
  if (file.name && file.name !== "blob") return file.name;
  if (mime === "video/quicktime") return "sample.mov";
  if (mime === "video/3gpp") return "sample.3gp";
  if (mime === "video/webm") return "sample.webm";
  return "sample.mp4";
}

function releaseVideo(video: HTMLVideoElement, url: string) {
  try {
    video.pause();
    video.srcObject = null;
    video.removeAttribute("src");
    video.load();
  } catch {
    /* the element is already gone */
  }
  if (video.parentNode) video.parentNode.removeChild(video);
  if (url) URL.revokeObjectURL(url);
}

const PROBE_WINDOW = 8 * 1024 * 1024;

function sliceBytes(file: Blob, start: number, end: number) {
  return file.slice(start, Math.max(start, end)).arrayBuffer();
}

function workerSeconds(head: ArrayBuffer, tail: ArrayBuffer) {
  return new Promise<number | null>((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./gig-probe.worker.ts", import.meta.url), { type: "module" });
    } catch {
      resolve(null);
      return;
    }
    const timer = window.setTimeout(() => {
      worker.terminate();
      resolve(null);
    }, 4000);
    worker.onmessage = (event: MessageEvent<{ seconds?: number }>) => {
      window.clearTimeout(timer);
      worker.terminate();
      const seconds = Number(event.data?.seconds);
      resolve(seconds > 0 ? seconds : null);
    };
    worker.onerror = () => {
      window.clearTimeout(timer);
      worker.terminate();
      resolve(null);
    };
    worker.postMessage({ head: head.slice(0), tail: tail.slice(0) });
  });
}

async function secondsFromFile(file: File) {
  const size = file.size;
  if (size < 1) return null;
  const headLen = Math.min(size, PROBE_WINDOW);
  const tailStart = Math.max(0, size - PROBE_WINDOW);
  const head = await sliceBytes(file, 0, headLen);
  const tail = tailStart === 0 ? head : await sliceBytes(file, tailStart, size);
  const offThread = await workerSeconds(head, tail);
  if (offThread != null) return offThread;
  const headView = new Uint8Array(head);
  const tailView = new Uint8Array(tail);
  return readContainerSeconds(headView.subarray(0, Math.min(headView.byteLength, PROBE_WINDOW))) ?? readContainerSeconds(tailView, "movie");
}

function elementDuration(file: File) {
  const objectUrl = URL.createObjectURL(file);
  return new Promise<number>((resolve, reject) => {
    const video = document.createElement("video");
    let settled = false;
    const finish = (err: Error | null, value = 0) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      releaseVideo(video, objectUrl);
      if (err) reject(err);
      else resolve(value);
    };
    const timer = window.setTimeout(() => finish(new Error("GIG_READ")), 8000);
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "true");
    video.style.cssText = "position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none";
    document.body.appendChild(video);
    video.onloadedmetadata = () => {
      const duration = video.duration;
      if (Number.isFinite(duration) && duration > 0) finish(null, duration);
      else finish(new Error("GIG_READ"));
    };
    video.onerror = () => finish(new Error("GIG_READ"));
    video.src = objectUrl;
  });
}

function gigLog(_event: string, _detail: Record<string, unknown>) {
  return;
}

export async function sampleLength(file: File) {
  if (file.size < 1) throw new Error("GIG_READ");
  let boxed: number | null = null;
  try {
    boxed = await secondsFromFile(file);
  } catch {
    boxed = null;
  }
  let media: number | null = null;
  if (boxed == null || overSampleLimit(boxed)) {
    try {
      const seen = await elementDuration(file);
      if (seen > 0 && Number.isFinite(seen)) media = seen;
    } catch {
      media = null;
    }
  }
  if (boxed != null && boxed > 0 && Number.isFinite(boxed) && !overSampleLimit(boxed)) return boxed;
  if (media != null && !overSampleLimit(media)) return media;
  if (media != null) return media;
  if (boxed != null && boxed > 0 && Number.isFinite(boxed)) return boxed;
  throw new Error("GIG_READ");
}

export function probeVideo(file: File) {
  return sampleLength(file).then((seconds) => {
    if (overSampleLimit(seconds)) throw new Error("GIG_LONG");
    return seconds;
  });
}

export function videoPoster(file: File) {
  const url = URL.createObjectURL(file);
  return new Promise<string>((resolve) => {
    const video = document.createElement("video");
    let settled = false;
    const done = (value: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      releaseVideo(video, url);
      resolve(value);
    };
    const timer = window.setTimeout(() => done(""), 4000);
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    video.onerror = () => done("");
    video.onloadeddata = () => {
      const stamp = Math.min(0.2, Number.isFinite(video.duration) ? video.duration / 3 : 0);
      const snap = () => {
        try {
          const canvas = document.createElement("canvas");
          const scale = Math.min(1, 480 / Math.max(video.videoWidth || 480, video.videoHeight || 270));
          canvas.width = Math.max(1, Math.round((video.videoWidth || 480) * scale));
          canvas.height = Math.max(1, Math.round((video.videoHeight || 270) * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            done("");
            return;
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          done(canvas.toDataURL("image/jpeg", 0.72));
        } catch {
          done("");
        }
      };
      if (stamp > 0) {
        video.onseeked = snap;
        video.currentTime = stamp;
      } else snap();
    };
  });
}

export async function cacheVideoFile(file: File) {
  const type = videoMime(file) || (await sniffMime(file)) || file.type || "video/mp4";
  if (file.type === type) return file;
  return new File([file], fileName(file, type), { type, lastModified: file.lastModified || Date.now() });
}

export function sampleSeconds(src: string) {
  const match = src.match(/[?&]s=(\d{1,4})(?:&|$)/i);
  if (!match) return 0;
  const n = Number(match[1]);
  return n > 0 && n <= 30 ? n : 0;
}

function videoBox(file: File) {
  return new Promise<{ width: number; height: number } | null>((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const finish = (box: { width: number; height: number } | null) => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      resolve(box);
    };
    const timer = window.setTimeout(() => finish(null), 2500);
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      window.clearTimeout(timer);
      finish({ width: video.videoWidth || 0, height: video.videoHeight || 0 });
    };
    video.onerror = () => {
      window.clearTimeout(timer);
      finish(null);
    };
    video.src = url;
  });
}

function planFrame(width: number, height: number) {
  return new Promise<ReturnType<typeof fitFrame>>((resolve) => {
    const local = fitFrame(width, height);
    let worker: Worker;
    try {
      worker = new Worker(new URL("./fit-frame.worker.ts", import.meta.url), { type: "module" });
    } catch {
      resolve(local);
      return;
    }
    const timer = window.setTimeout(() => {
      worker.terminate();
      resolve(local);
    }, 800);
    worker.onmessage = (event: MessageEvent<ReturnType<typeof fitFrame>>) => {
      window.clearTimeout(timer);
      worker.terminate();
      const next = event.data;
      if (!next || next.width < 2) resolve(local);
      else resolve(next);
    };
    worker.onerror = () => {
      window.clearTimeout(timer);
      worker.terminate();
      resolve(local);
    };
    worker.postMessage({ width, height });
  });
}

function encodeFit(file: File, plan: { width: number; height: number; bits: number }, stop?: () => boolean) {
  return new Promise<File>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    canvas.width = plan.width;
    canvas.height = plan.height;
    let recorder: MediaRecorder | null = null;
    const chunks: Blob[] = [];
    const fail = (err: Error) => {
      window.clearTimeout(timer);
      if (recorder && recorder.state !== "inactive") recorder.stop();
      URL.revokeObjectURL(url);
      reject(err);
    };
    const timer = window.setTimeout(() => fail(new Error("GIG_FIT")), 12000);
    video.muted = true;
    video.playsInline = true;
    video.onerror = () => fail(new Error("GIG_FIT"));
    video.onloadeddata = () => {
      const ctx = canvas.getContext("2d");
      const stream = canvas.captureStream(30);
      const media = video as HTMLVideoElement & { captureStream?: () => MediaStream };
      const track = media.captureStream?.().getAudioTracks?.()[0];
      if (track) stream.addTrack(track);
      if (!ctx || typeof MediaRecorder === "undefined") {
        fail(new Error("GIG_FIT"));
        return;
      }
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus") ? "video/webm;codecs=vp8,opus" : "video/webm";
      try {
        recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.max(plan.bits || FIT_BITS, 2_500_000), audioBitsPerSecond: 128_000 });
      } catch {
        fail(new Error("GIG_FIT"));
        return;
      }
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => fail(new Error("GIG_FIT"));
      recorder.onstop = () => {
        window.clearTimeout(timer);
        URL.revokeObjectURL(url);
        resolve(new File(chunks, "sample.webm", { type: "video/webm", lastModified: Date.now() }));
      };
      recorder.start(500);
      const draw = () => {
        if (stop?.() || video.ended || video.paused) {
          if (recorder && recorder.state !== "inactive") recorder.stop();
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        requestAnimationFrame(draw);
      };
      video.play().then(draw).catch(() => fail(new Error("GIG_FIT")));
    };
    video.src = url;
  });
}

export async function fitGigFile(file: File, stop?: () => boolean) {
  if (file.size > SAMPLE_MAX_BYTES) throw new Error("GIG_HEAVY");
  if (typeof document === "undefined") return file;
  const box = await videoBox(file);
  if (!box) return file;
  const plan = await planFrame(box.width, box.height);
  if (plan.skip || stop?.()) return file;
  try {
    const next = await encodeFit(file, plan, stop);
    if (stop?.() || next.size < 1 || next.size > file.size || next.size > SAMPLE_MAX_BYTES) return file;
    return next;
  } catch {
    return file;
  }
}

export function stageGigVideo(file: File, onProgress: (pct: number) => void, stop?: () => boolean) {
  let floor = 0;
  const bump = (pct: number) => {
    floor = nextUploadPercent(floor, pct);
    onProgress(floor);
  };
  bump(1);
  return sampleLength(file).then(async (duration) => {
    if (stop?.()) throw new Error("GIG_CANCEL");
    if (overSampleLimit(duration)) throw new Error(`GIG_LONG:${Math.max(1, Math.ceil(duration))}`);
    if (file.size > SAMPLE_MAX_BYTES) throw new Error(`GIG_HEAVY:${Math.max(1, Math.ceil(file.size / 1_000_000))}`);
    const fitted = await fitGigFile(file, stop);
    const mime = videoMime(fitted) || (await sniffMime(fitted));
    gigLog("metadata", { name: fitted.name, mime, bytes: fitted.size, duration });
    if (!mime.startsWith("video/")) throw new Error("GIG_VIDEO");
    const posterTask = videoPoster(fitted);
    const url = await uploadFile(fitted, bump, stop, duration, mime);
    const poster = await posterTask.catch(() => "");
    const seconds = Math.max(1, Math.min(SAMPLE_MAX_SECONDS, Math.round(duration)));
    bump(100);
    gigLog("ready", { url: `${url}&s=${seconds}`, bytes: file.size, duration, mime });
    return { url: `${url}&s=${seconds}`, poster };
  });
}

type MediaReply = { id?: string; error?: string; idxs?: number[]; chunk?: number; done?: boolean; url?: string; type?: string };
type PartBody = Record<string, string | number>;

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function waitUntilOnline(stop?: () => boolean) {
  if (typeof navigator === "undefined" || navigator.onLine !== false) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const finish = (err?: Error) => {
      window.removeEventListener("online", check);
      window.clearInterval(poll);
      if (err) reject(err);
      else resolve();
    };
    const check = () => {
      if (stop?.()) finish(new Error("GIG_CANCEL"));
      else if (navigator.onLine) finish();
    };
    window.addEventListener("online", check);
    const poll = window.setInterval(check, 800);
  });
}

function timeoutSignal(ms: number) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const ctrl = new AbortController();
  window.setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

function permanent(status: number, code: string) {
  if (status === 413) return "GIG_VIDEO";
  if (status === 401 || status === 403 || code === "Unauthorized" || code === "FORBIDDEN") return "FORBIDDEN";
  if (code === "GIG_VIDEO" || code === "INCOMPLETE" || code === "GIG_LONG" || code === "GIG_HEAVY" || code === "GIG_SIZE" || code === "GIG_READ") return code;
  if (status === 400 && code && code !== "NETWORK") return code;
  return "";
}

function isReadLock(err: unknown) {
  const name = err instanceof Error ? err.name : "";
  const message = err instanceof Error ? err.message : String(err ?? "");
  return name === "NotReadableError" || /could not be read|permission problem|NotReadableError/i.test(message);
}

async function postOnce(body: PartBody): Promise<MediaReply> {
  const headers: Record<string, string> = { "content-type": "application/json; charset=utf-8" };
  const token = getBearerToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch("/api/gig-media", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(body),
    signal: timeoutSignal(120_000),
  });
  const type = res.headers.get("content-type") || "";
  const data = type.includes("json") ? ((await res.json().catch(() => ({}))) as MediaReply) : {};
  if (!res.ok) {
    const code = permanent(res.status, String(data.error || ""));
    if (code) throw new Error(code);
    throw new Error("RETRY");
  }
  if (!type) throw new Error("RETRY");
  return data;
}

function postBlob(body: PartBody, file: Blob, name: string, onLoaded?: (loaded: number) => void) {
  return new Promise<MediaReply>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/gig-media");
    xhr.withCredentials = true;
    xhr.timeout = 120_000;
    const token = getBearerToken();
    if (token) xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (!onLoaded || !event.lengthComputable || event.total < 1) return;
      onLoaded(Math.min(file.size, Math.round((event.loaded / event.total) * file.size)));
    };
    xhr.onload = () => {
      const type = xhr.getResponseHeader("content-type") || "";
      let data: MediaReply = {};
      if (type.includes("json")) {
        try {
          data = JSON.parse(xhr.responseText) as MediaReply;
        } catch {
          data = {};
        }
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        gigLog("post", { action: body.action, idx: body.idx ?? "", status: xhr.status, id: data.id ?? "", error: data.error ?? "" });
        if (!type) {
          reject(new Error("RETRY"));
          return;
        }
        resolve(data);
        return;
      }
      gigLog("post", { action: body.action, idx: body.idx ?? "", status: xhr.status, id: data.id ?? "", error: data.error || "RETRY" });
      const code = permanent(xhr.status, String(data.error || ""));
      reject(new Error(code || "RETRY"));
    };
    xhr.onerror = () => reject(new Error("RETRY"));
    xhr.ontimeout = () => reject(new Error("RETRY"));
    const form = new FormData();
    for (const [key, value] of Object.entries(body)) form.append(key, String(value));
    form.append("file", file, name);
    xhr.send(form);
  });
}

async function postUntil(body: PartBody, stop?: () => boolean) {
  for (;;) {
    if (stop?.()) throw new Error("GIG_CANCEL");
    await waitUntilOnline(stop);
    try {
      return await postOnce(body);
    } catch (err) {
      if (isReadLock(err)) throw new Error("GIG_READ");
      const code = err instanceof Error ? err.message : "";
      if (code === "GIG_CANCEL" || code === "GIG_VIDEO" || code === "FORBIDDEN" || code === "INCOMPLETE" || code === "GIG_LONG" || code.startsWith("GIG_LONG:") || code === "GIG_HEAVY" || code.startsWith("GIG_HEAVY:") || code === "GIG_SIZE" || code === "GIG_READ") throw err;
      await sleep(1000);
    }
  }
}

async function postBlobUntil(body: PartBody, file: Blob, name: string, onLoaded?: (loaded: number) => void, stop?: () => boolean) {
  for (;;) {
    if (stop?.()) throw new Error("GIG_CANCEL");
    await waitUntilOnline(stop);
    try {
      return await postBlob(body, file, name, onLoaded);
    } catch (err) {
      if (isReadLock(err)) throw new Error("GIG_READ");
      const code = err instanceof Error ? err.message : "";
      if (code === "GIG_CANCEL" || code === "GIG_VIDEO" || code === "FORBIDDEN" || code === "INCOMPLETE" || code === "GIG_LONG" || code.startsWith("GIG_LONG:") || code === "GIG_HEAVY" || code.startsWith("GIG_HEAVY:") || code === "GIG_SIZE" || code === "GIG_READ") throw err;
      await sleep(1000);
    }
  }
}

async function sendFileParts(file: File, name: string, id: string, chunk: number, mime: string, onProgress: (pct: number) => void, stop?: () => boolean) {
  const total = Math.max(1, Math.ceil(file.size / chunk));
  let doneBytes = 0;
  for (let idx = 0; idx < total; idx += 1) {
    if (stop?.()) throw new Error("GIG_CANCEL");
    const start = idx * chunk;
    const end = Math.min(file.size, start + chunk);
    const slice = file.slice(start, end, mime || "application/octet-stream");
    if (!slice.size) throw new Error("GIG_READ");
    let sent = 0;
    await postBlobUntil({ action: "part", id, idx, mime }, slice, name, (loaded) => {
      sent = Math.max(sent, loaded);
      onProgress(Math.min(99, ((doneBytes + sent) / Math.max(1, file.size)) * 100));
    }, stop);
    doneBytes += slice.size;
    onProgress(Math.min(99, (doneBytes / Math.max(1, file.size)) * 100));
  }
  if (stop?.()) throw new Error("GIG_CANCEL");
  await postUntil({ action: "finish", id }, stop);
}

async function uploadFile(file: File, onProgress: (pct: number) => void, stop: (() => boolean) | undefined, seconds: number, mime: string) {
  if (stop?.()) throw new Error("GIG_CANCEL");
  if (file.size < 1) throw new Error("GIG_READ");
  const stamped = Math.min(SAMPLE_MAX_SECONDS + 0.5, Math.max(0.05, seconds));
  let floor = 0;
  const bump = (pct: number) => {
    const capped = pct >= 100 ? 100 : Math.min(99, pct);
    floor = nextUploadPercent(floor, capped);
    onProgress(floor);
  };
  const name = fileName(file, mime);
  gigLog("upload", { name, mime, bytes: file.size, seconds: stamped, mode: file.size <= ONE_SHOT ? "whole" : "parts" });
  if (file.size <= ONE_SHOT) {
    const data = await postBlobUntil(
      { action: "whole", mime, bytes: file.size, seconds: stamped },
      file,
      name,
      (loaded) => bump((loaded / Math.max(1, file.size)) * 100),
      stop,
    );
    if (!data.id || !/^[0-9a-f-]{36}$/i.test(data.id)) throw new Error("GIG_VIDEO");
    bump(100);
    gigLog("stored", { id: data.id, url: `/api/gig-media?id=${data.id}` });
    return `/api/gig-media?id=${data.id}`;
  }
  const started = await postUntil({
    action: "start",
    mime,
    bytes: file.size,
    chunk: GIG_CHUNK,
    seconds: stamped,
  }, stop);
  const id = started.id || "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("GIG_VIDEO");
  const chunk = started.chunk && started.chunk >= 524_288 && started.chunk <= 8 * 1024 * 1024 ? started.chunk : GIG_CHUNK;
  await sendFileParts(file, name, id, chunk, mime, bump, stop);
  bump(100);
  gigLog("stored", { id, url: `/api/gig-media?id=${id}` });
  return `/api/gig-media?id=${id}`;
}

export async function uploadGigVideo(file: File, onProgress: (pct: number) => void, stop?: () => boolean, seconds = 0, mimeHint = "") {
  const mime = mimeHint || videoMime(file) || (await sniffMime(file)) || "video/mp4";
  const duration = seconds > 0 ? seconds : await sampleLength(file);
  if (overSampleLimit(duration)) throw new Error("GIG_LONG");
  let floor = 0;
  return uploadFile(file, (pct) => {
    floor = nextUploadPercent(floor, pct);
    onProgress(floor);
  }, stop, duration, mime);
}

export function playableMedia(src: string) {
  if (!src.startsWith("/api/")) return src;
  if (/[?&]token=/.test(src)) return src;
  const token = getBearerToken();
  if (!token) return src;
  return `${src}${src.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
}
