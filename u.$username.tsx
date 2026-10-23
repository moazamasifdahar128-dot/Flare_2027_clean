import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Camera } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TopBack } from "@/components/flare/page";
import { GigTile } from "@/components/shola/gigs";
import { RequestCardView, type RequestCard } from "@/components/shola/requests";
import { BannerShell, CropSheet, Portrait } from "@/components/shola/portrait";
import { Badges, Phone, errText } from "@/components/shola/shell";
import { jobsByName, savedJobs } from "@/lib/shola/board";
import { flareNote, gigSave, gigsByName, savedGigs } from "@/lib/shola/gigs";
import { profileDesk } from "@/lib/shola/profile-desk";
import { profileByName, saveLook, myHandle, ensureMe } from "@/lib/shola/server";
import { useI18n } from "@/lib/shola/i18n";

export const Route = createFileRoute("/u/$username")({ component: ProfilePage });

function fullBadge(used: number, max: number) {
  if (used < max) return null;
  return (
    <p className="mb-2 rounded-full bg-[#FF4D2E] px-3 py-2 text-center text-xs font-semibold text-white">
      {max}/{max} Limit Reached - Delete to create new
    </p>
  );
}

const PROFILE_CACHE = "flare_self_profile";

function readCache(username: string) {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROFILE_CACHE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { username?: string; desk?: Awaited<ReturnType<typeof profileDesk>>; person?: Awaited<ReturnType<typeof profileByName>> };
    if (!parsed?.username || parsed.username.toLowerCase() !== username.toLowerCase()) return null;
    if (!parsed.desk && !parsed.person) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(username: string, desk: Awaited<ReturnType<typeof profileDesk>>, person: Awaited<ReturnType<typeof profileByName>>) {
  if (!desk?.isSelf && !person?.isSelf) return;
  try {
    const safeDesk = desk
      ? { ...desk, views: desk.isSelf ? desk.views : 0, earnings: [], withdrawals: [], verify: desk.isSelf ? desk.verify : "", canApply: false }
      : null;
    const safePerson = person
      ? { ...person, hiddenWords: person.isSelf ? person.hiddenWords : "", views: person.isSelf ? person.views : 0 }
      : null;
    localStorage.setItem(PROFILE_CACHE, JSON.stringify({ username, desk: safeDesk, person: safePerson }));
    localStorage.setItem("flare_handle", username);
  } catch {
    /* private mode */
  }
}

function ProfilePage() {
  const { username } = Route.useParams();
  const navigate = useNavigate();
  const [desk, setDesk] = useState<Awaited<ReturnType<typeof profileDesk>>>(null);
  const [gigs, setGigs] = useState<Awaited<ReturnType<typeof gigsByName>>>([]);
  const [requests, setRequests] = useState<RequestCard[]>([]);
  const [saved, setSaved] = useState<Awaited<ReturnType<typeof savedGigs>>>([]);
  const [savedRequests, setSavedRequests] = useState<RequestCard[]>([]);
  const [tab, setTab] = useState<"gigs" | "requests" | "saved">("gigs");
  const [person, setPerson] = useState<Awaited<ReturnType<typeof profileByName>>>(null);
  const [notice, setNotice] = useState("");
  const [phase, setPhase] = useState<"load" | "done">("load");
  const [draftBanner, setDraftBanner] = useState("");
  const [draftAvatar, setDraftAvatar] = useState("");
  const [crop, setCrop] = useState<{ url: string; shape: "banner" | "circle" } | null>(null);
  const [photoNote, setPhotoNote] = useState("");
  const [saving, setSaving] = useState("");
  const [retry, setRetry] = useState(0);
  const bannerPick = useRef<HTMLInputElement>(null);
  const avatarPick = useRef<HTMLInputElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    let stop = false;
    let timer = 0;
    const cached = readCache(username);
    if (cached) {
      setDesk(cached.desk ?? null);
      setPerson(cached.person ?? null);
    } else {
      setDesk(null);
      setPerson(null);
    }
    setPhase("load");
    let prefer: "gigs" | "requests" | "saved" = "gigs";
    try {
      const raw = sessionStorage.getItem("flare_profile_tab");
      if (raw === "requests" || raw === "saved" || raw === "gigs") {
        prefer = raw;
        sessionStorage.removeItem("flare_profile_tab");
      }
    } catch { /* private mode */ }
    setTab(prefer);

    const pull = (attempt: number) => {
      if (stop) return;
      const ready = attempt === 0 ? ensureMe({ data: {} }).catch(() => undefined) : Promise.resolve();
      ready.then(() => {
        if (stop) return;
        profileDesk({ data: username }).then((row) => {
          if (stop || !row) return;
          setDesk(row);
          if (row.isSelf) {
            savedGigs().then((list) => { if (!stop) setSaved(list); }).catch(() => { if (!stop) setSaved([]); });
            savedJobs().then((list) => { if (!stop) setSavedRequests(list); }).catch(() => { if (!stop) setSavedRequests([]); });
          }
        }).catch(() => undefined);
        gigsByName({ data: username }).then((list) => { if (!stop) setGigs(list); }).catch(() => { if (!stop) setGigs([]); });
        jobsByName({ data: username }).then((list) => { if (!stop) setRequests(list); }).catch(() => { if (!stop) setRequests([]); });
        flareNote().then((text) => { if (!stop) setNotice(text); }).catch(() => { if (!stop) setNotice(""); });
        Promise.all([
          profileDesk({ data: username }).catch(() => null),
          profileByName({ data: username }).catch(() => null),
        ]).then(async ([deskRow, personRow]) => {
          if (stop) return;
          if (deskRow || personRow) {
            if (deskRow) setDesk(deskRow);
            if (personRow) setPerson(personRow);
            writeCache(deskRow?.username || personRow?.username || username, deskRow, personRow);
            setPhase("done");
            return;
          }
          const mine = await myHandle().catch(() => null);
          if (stop) return;
          const next = mine?.username?.trim() || "";
          if (next && next.toLowerCase() !== username.toLowerCase()) {
            try { localStorage.setItem("flare_handle", next); } catch { /* ignore */ }
            window.dispatchEvent(new CustomEvent("flare-handle", { detail: next }));
            navigate({ to: "/u/$username", params: { username: next }, replace: true });
            return;
          }
          if (next && next.toLowerCase() === username.toLowerCase()) {
            const again = await profileByName({ data: next }).catch(() => null);
            const deskAgain = await profileDesk({ data: next }).catch(() => null);
            if (stop) return;
            if (again) setPerson(again);
            if (deskAgain) setDesk(deskAgain);
            if (again || deskAgain) {
              writeCache(next, deskAgain, again);
              setPhase("done");
              return;
            }
          }
          if (cached?.desk || cached?.person) {
            setPhase("done");
            return;
          }
          if (attempt < 4) {
            timer = window.setTimeout(() => pull(attempt + 1), 450 * (attempt + 1));
            return;
          }
          setPhase("done");
        });
      });
    };
    pull(0);
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [username, navigate, retry]);

  function openFile(file: File | undefined, shape: "banner" | "circle") {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      setPhotoNote("Choose a photo under 12MB. It is reduced before save.");
      return;
    }
    setPhotoNote("");
    setCrop({ url: URL.createObjectURL(file), shape });
  }

  function store(kind: "banner" | "avatar", image: string) {
    setSaving(kind);
    saveLook({ data: { kind, image } })
      .then(() => {
        setPerson((row) => (row ? { ...row, [kind]: image } : row));
        if (kind === "banner") setDraftBanner("");
        else setDraftAvatar("");
        setPhotoNote("");
      })
      .catch((err) => setPhotoNote(errText(err, t)))
      .finally(() => setSaving(""));
  }

  if (!desk && !person) {
    return (
      <Phone>
        {phase === "done" ? (
          <div className="grid min-h-[50dvh] place-items-center px-8 text-center">
            <div>
              <p className="text-sm text-white/70">This profile is not available.</p>
              <button type="button" className="mt-4 h-10 rounded-full bg-white px-4 text-sm font-semibold text-black" onClick={() => {
                myHandle().then((row) => {
                  if (row?.username) navigate({ to: "/u/$username", params: { username: row.username }, replace: true });
                  else setRetry((n) => n + 1);
                }).catch(() => setRetry((n) => n + 1));
              }}>Open my profile</button>
            </div>
          </div>
        ) : <div className="animate-pulse space-y-3 p-4"><div className="h-16 rounded-2xl bg-white/10" /><div className="h-32 rounded-2xl bg-white/10" /></div>}
      </Phone>
    );
  }

  const name = desk?.displayName || person?.displayName || username;
  const handleName = desk?.username || person?.username || username;
  const self = Boolean(desk?.isSelf || person?.isSelf);

  return (
    <Phone>
      <div className="pb-16">
        <BannerShell src={draftBanner || person?.banner} ceo={person?.isFounder}>
          {self ? (
            <>
              <Link to="/settings" aria-label="Settings" className="absolute top-3 left-3 z-10 grid place-items-center rounded-2xl bg-black/55 px-2 py-1 text-[10px] font-semibold">
                <span className="text-lg leading-none">⚙</span>
                Settings
              </Link>
              <button type="button" aria-label="Banner photo" className="absolute top-3 right-3 z-10 grid size-10 place-items-center rounded-full bg-black/70 ring-1 ring-white/20" onClick={() => bannerPick.current?.click()}>
                <Camera className="size-5" />
              </button>
              <input ref={bannerPick} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { openFile(event.target.files?.[0], "banner"); event.target.value = ""; }} />
              {draftBanner ? (
                <button type="button" className="absolute right-3 bottom-3 z-10 h-8 rounded-full bg-[#25D366] px-3 text-xs font-semibold text-black" onClick={() => store("banner", draftBanner)}>{saving === "banner" ? "Saving" : "Save"}</button>
              ) : null}
            </>
          ) : <TopBack floating />}
          <span className="absolute -bottom-16 left-4 z-10">
            <Portrait src={draftAvatar || person?.avatar} name={name} ceo={person?.isFounder} />
            {self ? (
              <button type="button" className="mt-1 text-xs font-semibold text-sky-300" onClick={() => avatarPick.current?.click()}>Edit</button>
            ) : null}
          </span>
          {self ? <input ref={avatarPick} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { openFile(event.target.files?.[0], "circle"); event.target.value = ""; }} /> : null}
          {self && draftAvatar ? (
            <button type="button" className="absolute bottom-[-4.5rem] left-28 z-10 h-8 rounded-full bg-[#25D366] px-3 text-xs font-semibold text-black" onClick={() => store("avatar", draftAvatar)}>{saving === "avatar" ? "Saving" : "Save"}</button>
          ) : null}
        </BannerShell>
        {photoNote ? <p className="px-4 pt-2 text-xs text-[#fe2c55]">{photoNote}</p> : null}
        <div className="px-4 pt-20">
          <h1 className="flex min-w-0 items-center gap-1 text-2xl font-semibold">
            <span className="truncate">{name}</span>
            <Badges
              verified={desk?.verified || person?.verified}
              faded={desk?.tick === "faded"}
              opacity={desk?.opacity ?? 1}
              tip={self && desk?.tick === "faded" ? "Blue Tick stays until you delete a gig and total views fall below 2,000." : undefined}
            />
          </h1>
          {self && desk?.tick === "faded" ? <p className="text-xs text-white/45">Blue Tick stays. It is removed only if you delete a gig and total views fall below 2,000.</p> : null}
          <p className="text-sm text-white/45">@{handleName}</p>
          {person?.bio ? <p className="mt-2 text-sm leading-6 text-white/75">{person.bio}</p> : <p className="mt-2 text-sm text-white/35">No bio yet.</p>}
          {notice ? <p className="mt-3 rounded-2xl bg-white/5 px-3 py-2 text-sm text-white/80">{notice}</p> : null}
          <div className="mt-4 grid grid-cols-3 text-center text-xs">
            <p><span className="block text-sm font-semibold">{desk?.activeGigs ?? gigs.length}/{desk?.gigMax ?? 3}</span><span className="text-white/45">Gigs</span></p>
            <p><span className="block text-sm font-semibold">{desk?.activeRequests ?? requests.length}/{desk?.requestMax ?? 5}</span><span className="text-white/45">My Boards</span></p>
            <p><span className="block text-sm font-semibold">{(desk?.likes ?? 0).toLocaleString()}</span><span className="text-white/45">Total Likes</span></p>
          </div>
          {self && (
            <div className="mt-4 flex items-center gap-2">
              <Link to="/studio" className="grid h-11 flex-1 place-items-center rounded-full bg-[#16161E] text-sm font-semibold">Flare Studio</Link>
              {person?.isFounder && (handleName === "moazam" || handleName === "moazamasif") ? (
                <button
                  type="button"
                  onClick={() => {
                    const tabs = ["/founder/overview", "/founder/payment-accounts", "/founder/requests", "/founder/reports", "/founder/support", "/founder/escrow", "/founder/controls"] as const;
                    let next: (typeof tabs)[number] = "/founder/overview";
                    try {
                      sessionStorage.setItem("flare_founder_from", window.location.pathname);
                      const saved = sessionStorage.getItem("flare_founder_tab");
                      if (saved && (tabs as readonly string[]).includes(saved)) next = saved as (typeof tabs)[number];
                    } catch { /* ignore */ }
                    navigate({ to: next });
                  }}
                  className="grid h-11 flex-1 place-items-center rounded-full bg-gradient-to-r from-amber-200 via-amber-400 to-yellow-200 text-sm font-semibold text-black shadow-[0_0_18px_rgba(251,191,36,0.35)]"
                >
                  👑 Founder Room
                </button>
              ) : null}
            </div>
          )}

          <div className={`mt-5 grid border-b border-white/10 text-sm font-semibold ${self ? "grid-cols-3" : "grid-cols-2"}`}>
            <button type="button" className={`h-11 ${tab === "gigs" ? "border-b-2 border-white text-white" : "text-white/45"}`} onClick={() => setTab("gigs")}>My Gigs</button>
            <button type="button" className={`h-11 ${tab === "requests" ? "border-b-2 border-white text-white" : "text-white/45"}`} onClick={() => setTab("requests")}>My Boards</button>
            {self ? <button type="button" className={`h-11 ${tab === "saved" ? "border-b-2 border-white text-white" : "text-white/45"}`} onClick={() => setTab("saved")}>Saved</button> : null}
          </div>
          {tab === "requests" ? (
            <div className="mt-3 space-y-3">
              {self ? fullBadge(Number(desk?.activeRequests ?? requests.length) || 0, Number(desk?.requestMax) || 5) : null}
              {requests.map((row) => (
                <RequestCardView key={row.id} row={row} onChange={(next) => setRequests((list) => list.map((item) => (item.id === next.id ? next : item)))} />
              ))}
              {requests.length === 0 && <p className="py-8 text-center text-sm text-white/40">No boards yet.</p>}
            </div>
          ) : null}
          {tab === "gigs" ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {self && (Number(desk?.activeGigs ?? gigs.length) || 0) >= (Number(desk?.gigMax) || 3) ? (
                <div className="col-span-2">{fullBadge(Number(desk?.activeGigs ?? gigs.length) || 0, Number(desk?.gigMax) || 3)}</div>
              ) : null}
              {gigs.map((row) => <GigTile key={row.id} row={row} />)}
              {gigs.length === 0 && <p className="col-span-2 py-8 text-center text-sm text-white/40">No active gigs.</p>}
            </div>
          ) : null}
          {self && tab === "saved" ? (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {saved.map((row) => (
                  <GigTile
                    key={row.id}
                    row={row}
                    onRemove={() => {
                      gigSave({ data: row.id }).then(() => setSaved((list) => list.filter((item) => item.id !== row.id))).catch(() => undefined);
                    }}
                  />
                ))}
              </div>
              {savedRequests.map((row) => (
                <RequestCardView
                  key={row.id}
                  row={row}
                  onChange={(next) => setSavedRequests((list) => list.map((item) => (item.id === next.id ? next : item)).filter((item) => item.saved))}
                />
              ))}
              {saved.length === 0 && savedRequests.length === 0 ? <p className="py-8 text-center text-sm text-white/40">Nothing saved yet.</p> : null}
            </div>
          ) : null}
        </div>
      </div>
      {crop ? (
        <CropSheet
          fileUrl={crop.url}
          shape={crop.shape}
          onCancel={() => setCrop(null)}
          onUse={(image) => {
            if (crop.shape === "banner") setDraftBanner(image);
            else setDraftAvatar(image);
            setCrop(null);
          }}
        />
      ) : null}
    </Phone>
  );
}
