import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Phone, SignOutSlot, errText } from "@/components/shola/shell";
import { TopBack } from "@/components/flare/page";
import { PrivacyPolicy, TermsOfService } from "@/components/shola/legal";
import { useI18n } from "@/lib/shola/i18n";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { signOut } from "@/lib/auth/client";
import { defaultPayout, myPayouts, removePayout, savePayout } from "@/lib/shola/payouts";
import { blockedList, closeAccount, myProfile, saveProfile, unblockUser } from "@/lib/shola/server";
import { containsContactInfoBio, fakeBadge, trimWords, wordCount } from "@/lib/shola/gig-text";
import { WORLD, countryByCode } from "@/lib/shola/world";

export const Route = createFileRoute("/settings")({ component: Settings });

function maskEmail(email: string) {
  const [name, host] = email.split("@");
  if (!name || !host) return "Not available";
  const shown = name.slice(0, Math.min(7, name.length));
  return `${shown}***@${host}`;
}

function flagFor(region: string) {
  const raw = region.trim();
  if (!raw || /not set/i.test(raw)) return "🇵🇰";
  const byCode = countryByCode(raw);
  if (byCode?.flag) return byCode.flag;
  const named = WORLD.find((row) => row.name.toLowerCase() === raw.toLowerCase());
  return named?.flag || "🇵🇰";
}

function Settings() {
  const { t, lang, setLang } = useI18n();
  const { user } = useCurrentUserState();
  const [region, setRegion] = useState("");
  const [msg, setMsg] = useState("");
  const [blocked, setBlocked] = useState<Awaited<ReturnType<typeof blockedList>>>([]);
  const [showEmail, setShowEmail] = useState(false);
  const [doc, setDoc] = useState<"" | "privacy" | "terms">("");
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteWord, setDeleteWord] = useState("");
  const [payouts, setPayouts] = useState<Awaited<ReturnType<typeof myPayouts>>>([]);
  const [payMethod, setPayMethod] = useState("jazzcash");
  const [payTitle, setPayTitle] = useState("");
  const [payAccount, setPayAccount] = useState("");
  const [payDefault, setPayDefault] = useState(true);
  const [bioAlert, setBioAlert] = useState(false);
  const [bioLeak, setBioLeak] = useState(false);
  const bioTimer = useRef(0);
  const [form, setForm] = useState({
    username: "",
    displayName: "",
    bio: "",
    todayLine: "",
    linkUrl: "",
    rateLine: "",
    avatar: "",
    banner: "",
    isPrivate: false,
    hideOnline: false,
    hideLikes: false,
    hideFollowing: false,
    hideFollowers: false,
    commentPolicy: "all",
    dmPolicy: "all",
    readReceipts: true,
    hiddenWords: "",
    clearAvatar: false,
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function takeBio(raw: string) {
    const clipped = raw.length > 600 ? raw.slice(0, 600) : raw;
    const next = wordCount(clipped) > 80 || raw.length > 600 ? trimWords(clipped, 80) : raw;
    if (wordCount(clipped) > 80 || raw.length > 600) {
      setBioAlert(true);
      window.clearTimeout(bioTimer.current);
      bioTimer.current = window.setTimeout(() => setBioAlert(false), 3000);
    }
    set("bio", next);
    setBioLeak(containsContactInfoBio(next));
  }

  useEffect(() => {
    if (lang !== "en") setLang("en");
  }, [lang, setLang]);

  useEffect(() => {
    myProfile().then((p) => {
      if (!p) return;
      setForm({
        username: p.username,
        displayName: p.displayName,
        bio: p.bio,
        todayLine: p.todayLine,
        linkUrl: p.linkUrl,
        rateLine: p.rateLine,
        avatar: p.avatar,
        banner: p.banner,
        isPrivate: p.isPrivate,
        hideOnline: p.hideOnline,
        hideLikes: p.hideLikes,
        hideFollowing: p.hideFollowing,
        hideFollowers: p.hideFollowers,
        commentPolicy: p.commentPolicy,
        dmPolicy: p.dmPolicy,
        readReceipts: p.readReceipts,
        hiddenWords: p.hiddenWords,
        clearAvatar: false,
      });
      setBioLeak(containsContactInfoBio(p.bio || ""));
      setRegion(p.country || "Not set");
      blockedList().then(setBlocked).catch(() => setBlocked([]));
    });
  }, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("flare_open_payout") !== "1") return;
      sessionStorage.removeItem("flare_open_payout");
    } catch {
      return;
    }
    setPayoutOpen(true);
    myPayouts().then(setPayouts).catch(() => setPayouts([]));
  }, []);

  function reloadPayouts() {
    return myPayouts().then(setPayouts).catch(() => setPayouts([]));
  }

  return (
    <Phone bare>
      <form
        className="lock-copy space-y-3 px-4 pt-4 pb-16"
        onSubmit={(e) => {
          e.preventDefault();
          if (fakeBadge(form.username) || fakeBadge(form.displayName)) {
            setMsg("Fake verification badge not allowed. Remove tick/badge/emoji from username. Blue Tick is only given by Flare admin after 5000 views. Save blocked.");
            return;
          }
          if (containsContactInfoBio(form.bio) || wordCount(form.bio) > 80) {
            setBioLeak(containsContactInfoBio(form.bio));
            if (wordCount(form.bio) > 80) setBioAlert(true);
            return;
          }
          saveProfile({
            data: {
              ...form,
              avatar: form.clearAvatar ? "" : form.avatar.startsWith("data:") ? form.avatar : "",
              banner: form.banner.startsWith("data:") ? form.banner : "",
              clearAvatar: form.clearAvatar,
            },
          })
            .then(() => {
              setMsg(t.saveChanges);
              const name = form.username.trim();
              if (!name) return;
              try {
                localStorage.setItem("flare_handle", name);
                window.dispatchEvent(new CustomEvent("flare-handle", { detail: name }));
              } catch {
                /* private mode */
              }
            })
            .catch((err) => setMsg(errText(err, t)));
        }}
      >
        <div className="flex items-center gap-3">
          <TopBack />
          <h1 className="text-2xl font-semibold">Settings</h1>
        </div>
        <section className="rounded-3xl bg-[#16161E] p-4">
          <p className="text-sm font-semibold">Account</p>
          <div className="mt-4 flex flex-col items-center">
            <span className="email-glow inline-flex max-w-full items-center gap-2 rounded-full px-4 py-2">
              <span className="text-[20px] leading-none" aria-hidden="true">{flagFor(region)}</span>
              <span className="email-letters text-center text-xs font-semibold leading-5">{showEmail ? (user?.primaryEmail || "Not available") : maskEmail(user?.primaryEmail || "")}</span>
            </span>
            <button type="button" className="mt-3 text-xs font-semibold text-[#fe2c55]" onClick={() => setShowEmail((v) => !v)}>{showEmail ? "Hide" : "Show"}</button>
          </div>
          <p className="mt-3 text-center text-sm text-white/70">{region === "Not set" || !region ? "Pakistan · PK" : region}</p>
          <p className="mt-2 text-center text-xs leading-5 text-white/45">Signed in via Google. Email is shown on your account card. Country flag is based on your initial signup location and does not change with travel.</p>
          <div className="mt-4"><SignOutSlot /></div>
        </section>
        <p className="rounded-2xl bg-[#16161E] px-4 py-3 text-xs leading-5 text-white/55">Edit photo and banner from your profile page.</p>
        <section className="space-y-3">
          <p className="text-sm font-semibold">Profile Details</p>
          <Field label="Username" value={form.username} onChange={(v) => set("username", v)} />
          {(fakeBadge(form.username) || fakeBadge(form.displayName)) ? <p className="text-xs font-semibold text-[#FF3B30]">Fake verification badge not allowed. Remove tick/badge/emoji from username. Blue Tick is only given by Flare admin after 5000 views. Save blocked.</p> : null}
          <Field label="Name" value={form.displayName} onChange={(v) => set("displayName", v)} />
          <label className="block text-xs text-muted">
            Bio (Max 80 words)
            <textarea
              value={form.bio}
              maxLength={600}
              rows={4}
              onChange={(event) => takeBio(event.target.value)}
              onPaste={(event) => {
                const pasted = event.clipboardData.getData("text");
                const start = event.currentTarget.selectionStart ?? form.bio.length;
                const end = event.currentTarget.selectionEnd ?? form.bio.length;
                const merged = form.bio.slice(0, start) + pasted + form.bio.slice(end);
                if (wordCount(merged) > 80 || merged.length > 600) {
                  event.preventDefault();
                  takeBio(merged);
                }
              }}
              className={`mt-1 w-full rounded-2xl bg-surface px-4 py-3 text-sm text-white ${bioLeak ? "leak-shake ring-1 ring-[#FF3B30]" : ""}`}
            />
            <span className={`mt-1 block ${wordCount(form.bio) >= 80 ? "font-semibold text-[#FF3B30]" : wordCount(form.bio) >= 60 ? "text-orange-400" : wordCount(form.bio) > 0 ? "text-emerald-400" : "text-white/45"}`}>{wordCount(form.bio)}/80 words</span>
            {bioAlert ? <span className="mt-1 block font-semibold text-[#FF3B30]">Bio limit reached (80 words max). Extra text trimmed.</span> : null}
            {bioLeak ? <span className="mt-1 block font-semibold text-[#FF3B30]">Remove phone numbers, WhatsApp, links, emails, or social handles from bio. Use Flare chat only. Delete to save.</span> : null}
          </label>
        </section>
        <section className="space-y-2">
          <p className="text-sm font-semibold">Privacy</p>
          <Switch label="Private profile" on={form.isPrivate} onChange={(v) => set("isPrivate", v)} />
          <Switch label="Hide likes" on={form.hideLikes} onChange={(v) => set("hideLikes", v)} />
          <Switch label="Hide online" on={form.hideOnline} onChange={(v) => set("hideOnline", v)} />
          <div id="blocked" className="rounded-2xl bg-[#16161E] p-3">
            <p className="text-sm font-semibold">Blocked users</p>
            {blocked.map((person) => (
              <div key={person.username} className="mt-2 flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{person.display_name || person.username}</span>
                <button type="button" className="text-xs font-semibold text-[#fe2c55]" onClick={() => unblockUser({ data: person.username }).then(() => setBlocked((list) => list.filter((row) => row.username !== person.username))).catch((err) => setMsg(errText(err, t)))}>Unblock</button>
              </div>
            ))}
            {blocked.length === 0 && <p className="mt-2 text-xs text-white/45">No blocked users.</p>}
          </div>
        </section>
        <section className="rounded-3xl bg-[#16161E] p-4">
          <p className="text-sm font-semibold">Wallet and earnings</p>
          <p className="mt-1 text-xs text-white/45">Views, released earnings, and withdrawals stay in Flare Studio.</p>
          <Link to="/studio" className="mt-3 grid h-11 place-items-center rounded-full bg-white text-sm font-semibold text-black">Open Flare Studio</Link>
          <button type="button" className="mt-2 h-11 w-full rounded-full border border-white/15 text-sm font-semibold" onClick={() => { setPayoutOpen(true); reloadPayouts(); }}>Payout Methods</button>
        </section>
        <section className="space-y-2">
          <p className="text-sm font-semibold">App</p>
          <div className="flex items-center justify-between rounded-2xl bg-[#16161E] px-4 py-3 text-sm"><span>Language</span><span className="text-white/60">English</span></div>
          <Switch label="Notifications" on={form.readReceipts} onChange={(v) => set("readReceipts", v)} />
          <div className="flex items-center justify-between rounded-2xl bg-[#16161E] px-4 py-3 text-sm"><span>Theme</span><span className="text-white/60">Dark</span></div>
        </section>
        <section className="space-y-2">
          <p className="text-sm font-semibold">Support</p>
          <Link to="/help" className="grid h-12 place-items-center rounded-2xl bg-[#16161E] text-sm font-semibold">Help Center</Link>
          <button type="button" className="h-12 w-full rounded-2xl bg-[#16161E] text-sm font-semibold" onClick={() => setDoc("privacy")}>Privacy Policy</button>
          <button type="button" className="h-12 w-full rounded-2xl bg-[#16161E] text-sm font-semibold" onClick={() => setDoc("terms")}>Terms</button>
        </section>
        {msg && <p className="text-sm text-[#fe2c55]">{msg}</p>}
        <button disabled={wordCount(form.bio) > 80 || containsContactInfoBio(form.bio) || fakeBadge(form.username) || fakeBadge(form.displayName)} className="h-12 w-full rounded-2xl bg-[#fe2c55] font-semibold text-white disabled:opacity-40">Save</button>
        <section className="space-y-2 rounded-3xl border border-red-500/40 p-4">
          <p className="text-sm font-semibold text-red-300">Danger zone</p>
          <button type="button" className="h-11 w-full rounded-full bg-[#16161E] text-sm" onClick={() => { try { sessionStorage.clear(); } catch { /* ignore */ } setMsg("Cache cleared on this phone."); }}>Clear cache</button>
          <button type="button" className="h-11 w-full rounded-full bg-[#16161E] text-sm text-red-300" onClick={() => { setDeleteWord(""); setDeleteOpen(true); }}>Delete account</button>
        </section>
        <Link to="/about" className="block py-2 text-center text-[11px] font-normal text-white/35">About Flare</Link>
      </form>
      {deleteOpen && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/70 px-4 pb-8 sm:place-items-center">
          <div className="w-full max-w-sm rounded-3xl bg-[#16161E] p-5">
            <p className="text-lg font-semibold">Delete account permanently?</p>
            <p className="mt-2 text-sm leading-6 text-white/70">This removes your profile, gigs, boards, and wallet from Flare. It cannot be undone. Type DELETE to confirm.</p>
            <input value={deleteWord} onChange={(event) => setDeleteWord(event.target.value)} placeholder="DELETE" className="mt-4 h-11 w-full rounded-xl bg-black px-3 text-sm outline-none" />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" className="h-11 rounded-full bg-white/10 text-sm font-semibold" onClick={() => setDeleteOpen(false)}>Cancel</button>
              <button
                type="button"
                disabled={deleteWord !== "DELETE"}
                className="h-11 rounded-full bg-[#DC2626] text-sm font-semibold text-white disabled:opacity-40"
                onClick={() => {
                  closeAccount().then(() => signOut("/login")).catch((err) => { setMsg(errText(err, t)); setDeleteOpen(false); });
                }}
              >
                Permanent delete
              </button>
            </div>
          </div>
        </div>
      )}
      {(msg.includes("7 days") || msg.includes("30 days")) && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-surface p-5 text-sm leading-6">
            <p>{msg}</p>
            <button type="button" className="mt-4 h-11 w-full rounded-xl bg-primary font-semibold text-ink" onClick={() => setMsg("")}>
              OK
            </button>
          </div>
        </div>
      )}
      {payoutOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <header className="flex h-14 items-center gap-2 border-b border-white/10 px-2">
            <TopBack onClick={() => setPayoutOpen(false)} />
            <h2 className="font-semibold">Payout Methods</h2>
          </header>
          <div className="overflow-y-auto px-4 py-4 pb-16">
            <p className="text-xs leading-5 text-white/50">Add the account that should receive your withdrawals. This is not asked when you publish a gig.</p>
            <form
              className="mt-3 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                savePayout({ data: { method: payMethod, title: payTitle, account: payAccount, isDefault: payDefault } })
                  .then(() => {
                    setPayTitle("");
                    setPayAccount("");
                    setMsg("");
                    return reloadPayouts();
                  })
                  .catch((err) => setMsg(errText(err, t)));
              }}
            >
              <label className="block text-xs text-white/50">
                Method
                <select value={payMethod} onChange={(event) => setPayMethod(event.target.value)} className="mt-1 h-12 w-full rounded-2xl bg-[#16161E] px-3 text-sm text-white">
                  {PAYOUT_METHODS.map((item) => <option key={item[0]} value={item[0]}>{item[1]}</option>)}
                </select>
              </label>
              <label className="block text-xs text-white/50">
                Account title
                <input value={payTitle} onChange={(event) => setPayTitle(event.target.value.slice(0, 60))} placeholder="Your name on the account" className="mt-1 h-12 w-full rounded-2xl bg-[#16161E] px-4 text-sm text-white outline-none" />
              </label>
              <label className="block text-xs text-white/50">
                Number, IBAN, email, or address
                <input value={payAccount} onChange={(event) => setPayAccount(event.target.value.slice(0, 80))} placeholder="03XXXXXXXXX, IBAN, email, or USDT address" className="mt-1 h-12 w-full rounded-2xl bg-[#16161E] px-4 text-sm text-white outline-none" />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={payDefault} onChange={(event) => setPayDefault(event.target.checked)} />
                Use as default
              </label>
              <button className="h-12 w-full rounded-full bg-white text-sm font-semibold text-black">Save</button>
            </form>
            {msg ? <p className="mt-3 text-sm text-[#fe2c55]">{msg}</p> : null}
            <div className="mt-4 space-y-2">
              {payouts.map((row) => (
                <div key={row.id} className="rounded-2xl bg-[#16161E] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{payoutLabel(row.method)}</p>
                    {row.isDefault ? <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-black">Default</span> : null}
                  </div>
                  <p className="mt-1 text-sm">{row.title}</p>
                  <p className="text-xs text-white/55">{row.account}</p>
                  <div className="mt-2 flex gap-2">
                    {!row.isDefault ? <button type="button" className="h-8 rounded-full bg-white px-3 text-xs font-semibold text-black" onClick={() => defaultPayout({ data: row.id }).then(reloadPayouts).catch((err) => setMsg(errText(err, t)))}>Make default</button> : null}
                    <button type="button" className="h-8 rounded-full bg-black px-3 text-xs font-semibold text-[#fe2c55]" onClick={() => removePayout({ data: row.id }).then(reloadPayouts).catch((err) => setMsg(errText(err, t)))}>Remove</button>
                  </div>
                </div>
              ))}
              {payouts.length === 0 ? <p className="text-sm text-white/45">No saved methods yet.</p> : null}
            </div>
          </div>
        </div>
      )}
      {doc && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <header className="flex h-14 items-center gap-2 border-b border-white/10 px-2">
            <TopBack onClick={() => setDoc("")} />
            <h2 className="font-semibold">{doc === "privacy" ? "Privacy Policy" : "Terms"}</h2>
          </header>
          <div className="overflow-y-auto px-5 py-5 text-sm leading-7 text-white/70">
            {doc === "privacy" ? <PrivacyPolicy /> : <TermsOfService />}
          </div>
        </div>
      )}
    </Phone>
  );
}

function payoutLabel(method: string) {
  return PAYOUT_METHODS.find((item) => item[0] === method)?.[1] ?? method;
}

const PAYOUT_METHODS = [
  ["jazzcash", "JazzCash"],
  ["easypaisa", "Easypaisa"],
  ["bank", "Bank"],
  ["wise", "Wise"],
  ["payoneer", "Payoneer"],
  ["usdt", "USDT"],
] as const;

function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex h-12 w-full items-center justify-between rounded-2xl bg-[#16161E] px-4 text-sm">
      {label}
      <span className={`relative h-7 w-12 rounded-full ${on ? "bg-[#34c759]" : "bg-white/20"}`}>
        <span className={`absolute top-0.5 size-6 rounded-full bg-white ${on ? "left-5" : "left-0.5"}`} />
      </span>
    </button>
  );
}

function Field({ label, value, onChange, max = 80 }: { label: string; value: string; onChange: (value: string) => void; max?: number }) {
  return (
    <label className="block text-xs text-muted">
      {label}
      <input value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} className="mt-1 h-12 w-full rounded-2xl bg-surface px-4 text-sm text-white" />
    </label>
  );
}
