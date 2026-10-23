import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextUploadPercent, overSampleLimit, readContainerSeconds, sampleRejected } from "./sample-limit.ts";

function u32(n: number) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(n >>> 0);
  return bytes;
}

function box(type: string, payload: Buffer) {
  return Buffer.concat([u32(8 + payload.length), Buffer.from(type, "latin1"), payload]);
}

function mvhd(timescale: number, duration: number) {
  const payload = Buffer.alloc(100);
  payload.writeUInt32BE(timescale, 12);
  payload.writeUInt32BE(duration, 16);
  return box("mvhd", payload);
}

function decoyMedia() {
  const junk = Buffer.alloc(80);
  junk.write("mvhd", 16, "latin1");
  junk[20] = 0;
  junk.writeUInt32BE(1, 32);
  junk.writeUInt32BE(999_999, 36);
  junk[48] = 0x44;
  junk[49] = 0x89;
  junk[50] = 0x88;
  junk.writeDoubleBE(9_000_000_000_000, 51);
  return box("mdat", junk);
}

function clip(timescale: number, duration: number) {
  const ftyp = box("ftyp", Buffer.from("isom0000isom", "latin1"));
  const moov = box("moov", mvhd(timescale, duration));
  return Buffer.concat([ftyp, decoyMedia(), moov]);
}

describe("sample duration", () => {
  it("ignores a fake mvhd inside the media bytes and reads the real 28s header", () => {
    const seconds = readContainerSeconds(new Uint8Array(clip(1000, 28_000)));
    assert.ok(seconds != null);
    assert.ok(Math.abs((seconds ?? 0) - 28) < 0.001);
    assert.equal(sampleRejected(seconds), "");
  });

  it("reads a 30.04s clip as allowed and a 31s clip as too long", () => {
    const barely = readContainerSeconds(new Uint8Array(clip(25_000, 751_000)));
    assert.ok(barely != null);
    assert.ok(Math.abs((barely ?? 0) - 30.04) < 0.001);
    assert.equal(overSampleLimit(barely ?? 0), false);
    assert.equal(sampleRejected(barely), "");
    const long = readContainerSeconds(new Uint8Array(clip(1000, 31_000)));
    assert.equal(overSampleLimit(long ?? 0), true);
    assert.equal(sampleRejected(long), "GIG_LONG");
  });

  it("finds the movie header in a tail slice that does not start at the file", () => {
    const file = clip(1000, 30_000);
    const tail = file.subarray(file.length - 160);
    const seconds = readContainerSeconds(new Uint8Array(tail), "movie");
    assert.ok(seconds != null);
    assert.ok(Math.abs((seconds ?? 0) - 30) < 0.001);
  });

  it("does not treat mp4 media bytes as a webm duration", () => {
    const head = Buffer.concat([box("ftyp", Buffer.from("isom0000isom", "latin1")), decoyMedia()]);
    assert.equal(readContainerSeconds(new Uint8Array(head)), null);
  });
});

describe("upload progress", () => {
  it("never moves backward when a retry reports a lower percent", () => {
    let pct = 0;
    for (const next of [1, 20, 80, 0, 12, 80, 96, 100]) pct = nextUploadPercent(pct, next);
    assert.equal(pct, 100);
    assert.equal(nextUploadPercent(80, 0), 80);
    assert.equal(nextUploadPercent(80, 79.4), 80);
  });
});
