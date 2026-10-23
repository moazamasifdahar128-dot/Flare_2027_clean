import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { TopBack } from "@/components/flare/page";
import { Phone } from "@/components/shola/shell";
import { boardFounder, boardPayee } from "@/lib/shola/board";
import { founderBooks, founderReceiving, manualAct, manualQueue, modDesk, modUnhide, payTestProbe, reportAct, requestAct, requestDesk } from "@/lib/shola/gigs";
import { founderHelp, founderHelpReply } from "@/lib/shola/profile-desk";
import { ownerAct, ownerDesk } from "@/lib/shola/server";
import { TICK_USD, UNLOCK_USD, pkrForUsd } from "@/lib/shola/money";
import { formatTimeAgo } from "@/lib/shola/time-ago";

const TABS = [
  ["/founder/overview", "Overview"],
  ["/founder/payment-accounts", "Payments"],
  ["/founder/requests", "Requests"],
  ["/founder/reports", "Reports"],
  ["/founder/support", "Support"],
  ["/founder/escrow", "Escrow"],
  ["/founder/controls", "Controls"],
] as const;

export function FounderLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [phase, setPhase] = useState<"load" | "ready" | "closed">("load");

  useEffect(() => {
    ownerDesk().then((row) => setPhase(row ? "ready" : "closed")).catch(() => setPhase("closed"));
  }, []);

  useEffect(() => {
    if (!TABS.some(([href]) => href === path)) return;
    try { sessionStorage.setItem("flare_founder_tab", path); } catch { /* private mode */ }
  }, [path]);

  if (phase !== "ready") {
    return (
      <Phone bare>
        <div className="px-4 pt-4">
          <TopBack />
          <p className="mt-4 text-sm text-white/60">{phase === "load" ? "Opening Founder Room…" : "This room is only for the founder."}</p>
        </div>
      </Phone>
    );
  }

  if (path.startsWith("/founder/controls/")) {
    return (
      <Phone bare>
        <div className="flare-in min-h-dvh">
          <Outlet />
        </div>
      </Phone>
    );
  }

  return (
    <Phone bare>
      <div className="px-4 pt-4 pb-8">
        <TopBack />
        <h1 className="mt-3 text-2xl font-semibold">Founder Room</h1>
        <nav className="mt-3 flex gap-1 overflow-x-auto rounded-2xl bg-[#0c0c12] p-1 no-scrollbar" aria-label="Founder sections">
          {TABS.map(([href, label]) => (
            <Link key={href} to={href} className={`h-9 shrink-0 rounded-xl px-3 text-xs font-semibold leading-9 ${path === href ? "bg-gradient-to-r from-amber-200 via-amber-400 to-yellow-200 text-black shadow-[0_0_14px_rgba(251,191,36,0.35)]" : "text-white/55"}`}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-4">
          <Outlet />
        </div>
      </div>
    </Phone>
  );
}

function wordCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/).filter(Boolean).length : 0;
}

function clampWords(value: string, max: number) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= max) return value;
  return parts.slice(0, max).join(" ");
}

function reasonText(value: string) {
  const key = String(value || "").toLowerCase();
  if (key === "spam") return "Spam";
  if (key === "fake") return "Fake";
  if (key === "inappropriate") return "Inappropriate";
  if (key === "scam") return "Scam";
  if (key === "copyright") return "Copyright";
  if (key === "abusive") return "Abusive";
  if (!key || key === "other") return "Other";
  return key.slice(0, 1).toUpperCase() + key.slice(1);
}

function actionText(value: string) {
  if (value === "delete") return "Deleted";
  if (value === "hide") return "Hidden";
  if (value === "edit") return "Edited";
  if (value === "dismiss" || value === "dismissed") return "Dismissed";
  if (value === "ban") return "Banned";
  if (!value) return "Resolved";
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-[#16161E] p-3">
      <p className="text-lg font-semibold">{typeof value === "number" ? value.toLocaleString() : value}</p>
      <p className="text-[11px] text-white/45">{label}</p>
    </div>
  );
}

export function OverviewPage() {
  const [books, setBooks] = useState<Awaited<ReturnType<typeof founderBooks>> | null>(null);

  useEffect(() => {
    founderBooks().then(setBooks).catch(() => setBooks(null));
  }, []);

  if (!books) return <p className="text-sm text-white/50">Loading stats…</p>;
  const growth = books.growth ?? [];
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    const hit = growth.find((row) => String(row.day).slice(0, 10) === key);
    return { label: key.slice(5), n: Number(hit?.n) || 0 };
  });
  const peak = Math.max(1, ...days.map((row) => row.n));

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Overview & Stats</h2>
      <div className="grid grid-cols-2 gap-2">
        <Card label="Total users" value={books.users} />
        <Card label="Total gigs" value={books.gigs} />
        <Card label="Total boards" value={books.requests} />
        <Card label="Views" value={books.views ?? 0} />
        <Card label="Likes" value={books.likes ?? 0} />
        <Card label="Active now" value={books.activeNow ?? 0} />
      </div>
      <section className="rounded-2xl bg-[#16161E] p-3">
        <p className="text-sm font-semibold">Growth · new accounts, 7 days</p>
        <div className="mt-3 flex h-32 items-end gap-2">
          {days.map((row) => (
            <div key={row.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="text-[10px] text-white/50">{row.n}</span>
              <div className="w-full rounded-t-md bg-gradient-to-t from-amber-700 to-amber-200" style={{ height: `${Math.max(8, Math.round((row.n / peak) * 72))}px` }} />
              <span className="text-[10px] text-white/40">{row.label}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function ReportsPage() {
  const [desk, setDesk] = useState<Awaited<ReturnType<typeof modDesk>> | null>(null);
  const [filter, setFilter] = useState<"gigs" | "boards" | "users" | "hidden" | "done">("gigs");
  const [note, setNote] = useState("");
  const [toast, setToast] = useState("");
  const [editId, setEditId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  function load() {
    modDesk().then(setDesk).catch(() => setDesk(null));
  }
  useEffect(load, []);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(id);
  }, [toast]);

  const reports = desk?.reports ?? [];
  const hidden = desk?.hidden ?? [];
  const openRows = reports.filter((row) => row.status === "open");
  const rows = filter === "gigs"
    ? openRows.filter((row) => row.box === "gig")
    : filter === "boards"
      ? openRows.filter((row) => row.box === "board")
      : filter === "users"
        ? openRows.filter((row) => row.box === "user")
        : [];
  const history = reports.filter((row) => row.status !== "open");
  const editing = reports.find((row) => row.id === editId);
  const pills = [
    ["gigs", "Reported Gigs"],
    ["boards", "Reported Boards"],
    ["users", "Reported Users"],
    ["hidden", "Hidden"],
    ["done", "Deleted / Resolved"],
  ] as const;

  function copyName(name: string, banHint: boolean) {
    const value = name.replace(/^@/, "");
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setToast(banHint ? "Username copied - Paste in Ban User tab" : "Username copied");
    }).catch(() => setToast("Could not copy that username."));
  }

  function run(id: string, action: string, extra?: { title?: string; body?: string }) {
    reportAct({ data: { id, action, title: extra?.title ?? "", body: extra?.body ?? "", span: "" } })
      .then(() => {
        setEditId("");
        setNote(action === "edit" ? "Listing updated." : action === "delete" ? "Listing removed." : "Listing hidden.");
        load();
      })
      .catch(() => setNote("That action was not saved."));
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Reports & Moderation</h2>
      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        {pills.map(([id, label]) => (
          <button key={id} type="button" className={`h-8 shrink-0 rounded-full px-3 text-[11px] font-semibold ${filter === id ? "bg-gradient-to-r from-amber-200 via-amber-400 to-yellow-200 text-black" : "bg-[#16161E] text-white/70"}`} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      {filter !== "hidden" && filter !== "done" ? rows.map((row) => (
        <article key={row.id} className="rounded-2xl bg-[#16161E] p-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold">{row.title || "Listing"}</p>
            <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/70">{row.box === "board" ? "Board" : row.box === "user" ? "User" : "Gig"}</span>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-1 text-xs text-white/70">
            Reporter: @{row.reporter || "user"} (ID: {row.reporterId || "—"})
            <button type="button" className="h-6 rounded-full bg-white/10 px-2 text-[10px] font-semibold" onClick={() => copyName(row.reporter, false)}>Copy</button>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-white/70">
            Owner: @{row.owner || "user"} (ID: {row.ownerId || "—"})
            <button type="button" className="h-6 rounded-full bg-white/10 px-2 text-[10px] font-semibold" onClick={() => copyName(row.owner, true)}>Copy</button>
          </p>
          <p className="mt-2 text-xs text-white/55">Reason: {reasonText(row.reason)} · {row.at ? String(row.at).slice(0, 16).replace("T", " ") : ""}</p>
          {row.thumb ? <img src={row.thumb} alt="" className="mt-2 size-16 rounded-xl object-cover" /> : null}
          {row.box === "user" ? null : (
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              <button type="button" className="h-9 rounded-full bg-amber-300 px-2 text-[11px] font-semibold text-black" onClick={() => { setEditId(row.id); setTitle(row.title || ""); setBody(row.body || ""); }}>Edit</button>
              <button type="button" className="h-9 rounded-full bg-red-600 px-2 text-[11px] font-semibold text-white" onClick={() => run(row.id, "delete")}>Delete</button>
              <button type="button" className="h-9 rounded-full bg-white/10 px-2 text-[11px] font-semibold text-white/80" onClick={() => run(row.id, "hide")}>Hide</button>
            </div>
          )}
        </article>
      )) : null}
      {filter === "hidden" ? hidden.map((row) => (
        <article key={`${row.box}-${row.id}`} className="rounded-2xl bg-[#16161E] p-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold">{row.title || "Listing"}</p>
            <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/70">{row.box === "board" ? "Board" : "Gig"}</span>
          </div>
          <p className="mt-1 text-xs text-white/60">Owner: @{row.username || "user"}</p>
          {row.thumb ? <img src={row.thumb} alt="" className="mt-2 size-16 rounded-xl object-cover" /> : null}
          <button type="button" className="mt-3 h-9 w-full rounded-full bg-white/10 text-xs font-semibold" onClick={() => modUnhide({ data: row.id }).then(() => { setNote("Listing is public again."); load(); }).catch(() => setNote("That listing was not restored."))}>Unhide</button>
        </article>
      )) : null}
      {filter === "done" ? history.map((row) => (
        <article key={row.id} className="rounded-2xl bg-[#16161E] p-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold">{row.title || "Listing"}</p>
            <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/70">{actionText(row.action || row.status)}</span>
          </div>
          <p className="mt-1 text-xs text-white/55">{row.box === "board" ? "Board" : row.box === "user" ? "User" : "Gig"} · @{row.owner || "user"} · {reasonText(row.reason)}</p>
          <p className="mt-1 text-[11px] text-white/40">{row.at ? String(row.at).slice(0, 16).replace("T", " ") : ""}</p>
        </article>
      )) : null}
      {desk && filter !== "hidden" && filter !== "done" && rows.length === 0 ? <p className="text-sm text-white/45">No open reports in this filter.</p> : null}
      {desk && filter === "hidden" && hidden.length === 0 ? <p className="text-sm text-white/45">No hidden listings.</p> : null}
      {desk && filter === "done" && history.length === 0 ? <p className="text-sm text-white/45">No deleted or resolved reports.</p> : null}
      {!desk ? <p className="text-sm text-white/45">Loading reports…</p> : null}
      {editing ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/70 px-4 pb-6">
          <form className="w-full max-w-[398px] space-y-2 rounded-3xl bg-[#16161E] p-4 ring-1 ring-amber-200/20" onSubmit={(event) => { event.preventDefault(); if (title.trim().length < 3 || wordCount(body) > 400) { setNote("Title needs 3–80 characters and the description stays within 400 words."); return; } run(editing.id, "edit", { title: title.trim(), body }); }}>
            <p className="text-sm font-semibold">Edit listing</p>
            <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value.slice(0, 80))} className="h-11 w-full rounded-xl bg-black px-3 text-sm outline-none" />
            <p className="text-right text-[10px] text-white/35">{title.length}/80</p>
            <textarea value={body} rows={6} onChange={(e) => setBody(clampWords(e.target.value, 400))} className="w-full rounded-xl bg-black px-3 py-2 text-sm outline-none" />
            <p className={`text-right text-[10px] ${wordCount(body) > 400 ? "text-red-300" : "text-white/35"}`}>{wordCount(body)}/400 words</p>
            <div className="flex gap-2">
              <button type="button" className="h-10 flex-1 rounded-full bg-white/10 text-sm" onClick={() => setEditId("")}>Cancel</button>
              <button disabled={title.trim().length < 3 || wordCount(body) > 400} className="h-10 flex-1 rounded-full bg-amber-300 text-sm font-semibold text-black disabled:opacity-40">Save</button>
            </div>
          </form>
        </div>
      ) : null}
      {note ? <p className="text-sm text-white/70">{note}</p> : null}
      {toast ? <p className="fixed bottom-6 left-1/2 z-50 max-w-[22rem] -translate-x-1/2 rounded-full bg-white px-4 py-2 text-center text-xs font-semibold text-black shadow">{toast}</p> : null}
    </div>
  );
}

export function PaymentsPage() {
  const [title, setTitle] = useState("");
  const [jazz, setJazz] = useState("");
  const [easy, setEasy] = useState("");
  const [bank, setBank] = useState("");
  const [card, setCard] = useState("");
  const [easyOn, setEasyOn] = useState(false);
  const [jazzOn, setJazzOn] = useState(false);
  const [bankOn, setBankOn] = useState(false);
  const [cardOn, setCardOn] = useState(false);
  const [payoneer, setPayoneer] = useState("");
  const [usdt, setUsdt] = useState("");
  const [note, setNote] = useState("");
  const [envOn, setEnvOn] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    boardPayee().then((row) => {
      setTitle(row.title);
      setJazz(row.jazzcash);
      setEasy(row.easypaisa);
      setBank(row.bank);
      setCard(row.card || row.payoneer || row.wise);
      setPayoneer(row.payoneer || "");
      setUsdt(row.usdt || "");
      setEasyOn(row.easyOn);
      setJazzOn(row.jazzOn);
      setBankOn(row.bankOn);
      setCardOn(row.cardOn);
      setReady(true);
    }).catch(() => setNote("Could not load accounts."));
    founderReceiving().then((row) => setEnvOn(row.attached)).catch(() => setEnvOn(false));
  }, []);

  const live = [
    easyOn && easy.trim() ? "Easypaisa" : "",
    jazzOn && jazz.trim() ? "JazzCash" : "",
    cardOn && card.trim() ? "Visa / MasterCard" : "",
  ].filter(Boolean);

  return (
    <form className="space-y-3" onSubmit={(event) => {
      event.preventDefault();
      if (!ready) return;
      boardFounder({ data: { action: "payee", title, jazzcash: jazz, easypaisa: easy, bank, card, payoneer, usdt, easyOn, jazzOn, bankOn, cardOn } })
        .then(() => founderReceiving())
        .then((row) => {
          setEnvOn(row.attached);
          setNote(row.attached
            ? "Saved. Buyers only see Flare Official Account. Checkout shows the methods you turned on."
            : "Saved. Founder payment account not attached. Payments disabled.");
        })
        .catch(() => setNote("Could not save."));
    }}>
      <h2 className="text-lg font-semibold">Payments Setup</h2>
      <section className="rounded-2xl bg-[#16161E] p-3 text-sm">
        <p className="font-semibold">Live prices</p>
        <p className="mt-2 text-white/70">Blue Tick ${TICK_USD.toFixed(2)} / {pkrForUsd(TICK_USD).toLocaleString("en-US")} PKR</p>
        <p className="text-white/70">WhatsApp unlock ${UNLOCK_USD} / {pkrForUsd(UNLOCK_USD).toLocaleString("en-US")} PKR</p>
        <p className="text-white/70">Boost $2 / 24 hours, $6 / 7 days, $20 / 30 days</p>
      </section>
      <p className="text-xs leading-5 text-white/50">Save Easypaisa and Visa / MasterCard together. Pakistani buyers pay the wallet you turn on. Foreign buyers pay the card, which routes to your Payoneer or Wise. Buyers never see the real number.</p>
      <p className="text-xs leading-5 text-white/40">{envOn === null ? "Checking accounts…" : envOn ? `Payments are on for ${live.join(", ") || "the saved methods"}.` : "Founder payment account not attached. Payments disabled."}</p>
      <label className="block text-xs text-white/55">
        Account title
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 h-11 w-full rounded-xl bg-[#16161E] px-3 text-sm text-white outline-none" />
      </label>
      <label className="block text-xs text-white/55">
        Easypaisa number
        <input value={easy} onChange={(e) => {
          const next = e.target.value;
          if (!easy.trim() && next.trim()) setEasyOn(true);
          setEasy(next);
        }} inputMode="numeric" className="mt-1 h-11 w-full rounded-xl bg-[#16161E] px-3 text-sm text-white outline-none" />
      </label>
      <label className="flex items-center gap-2 text-xs text-white/70">
        <input type="checkbox" checked={easyOn} onChange={(e) => setEasyOn(e.target.checked)} />
        Accept Easypaisa at checkout
      </label>
      <label className="block text-xs text-white/55">
        JazzCash number
        <input value={jazz} onChange={(e) => {
          const next = e.target.value;
          if (!jazz.trim() && next.trim()) setJazzOn(true);
          setJazz(next);
        }} inputMode="numeric" className="mt-1 h-11 w-full rounded-xl bg-[#16161E] px-3 text-sm text-white outline-none" />
      </label>
      <label className="flex items-center gap-2 text-xs text-white/70">
        <input type="checkbox" checked={jazzOn} onChange={(e) => setJazzOn(e.target.checked)} />
        Accept JazzCash at checkout
      </label>
      <label className="block text-xs text-white/55">
        Bank IBAN
        <input value={bank} onChange={(e) => {
          const next = e.target.value;
          if (!bank.trim() && next.trim()) setBankOn(true);
          setBank(next);
        }} className="mt-1 h-11 w-full rounded-xl bg-[#16161E] px-3 text-sm text-white outline-none" />
      </label>
      <label className="flex items-center gap-2 text-xs text-white/70">
        <input type="checkbox" checked={bankOn} onChange={(e) => setBankOn(e.target.checked)} />
        Save bank IBAN (not a buyer checkout button)
      </label>
      <label className="block text-xs text-white/55">
        Payoneer email
        <input value={payoneer} onChange={(e) => setPayoneer(e.target.value)} className="mt-1 h-11 w-full rounded-xl bg-[#16161E] px-3 text-sm text-white outline-none" />
      </label>
      <label className="block text-xs text-white/55">
        Crypto wallet
        <input value={usdt} onChange={(e) => setUsdt(e.target.value)} placeholder="USDT address" className="mt-1 h-11 w-full rounded-xl bg-[#16161E] px-3 text-sm text-white outline-none" />
      </label>
      <label className="block text-xs text-white/55">
        Visa / MasterCard receiving (Payoneer or Wise email)
        <input value={card} onChange={(e) => {
          const next = e.target.value;
          if (!card.trim() && next.trim()) setCardOn(true);
          setCard(next);
        }} className="mt-1 h-11 w-full rounded-xl bg-[#16161E] px-3 text-sm text-white outline-none" />
      </label>
      <label className="flex items-center gap-2 text-xs text-white/70">
        <input type="checkbox" checked={cardOn} onChange={(e) => setCardOn(e.target.checked)} />
        Accept Visa / MasterCard at checkout
      </label>
      <p className="text-[11px] leading-4 text-white/40">Test mode only. A PIN in the app does not debit these wallets, and the card is not charged.</p>
      <button disabled={!ready} className="h-11 w-full rounded-full bg-white text-sm font-semibold text-black disabled:opacity-40">Save Accounts</button>
      {note ? <p className="text-sm text-white/70">{note}</p> : null}
    </form>
  );
}

function ProofZoom({ src, onClose }: { src: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const pinch = useRef<{ start: number; scale: number } | null>(null);

  function distance(touches: { item: (index: number) => { clientX: number; clientY: number } | null }) {
    const a = touches.item(0);
    const b = touches.item(1);
    if (!a || !b) return 0;
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/90 px-4" onClick={onClose}>
      <button type="button" className="absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-white text-lg font-semibold text-black" onClick={onClose}>×</button>
      <img
        src={src}
        alt="Payment proof"
        className="max-h-[80dvh] max-w-full origin-center object-contain"
        style={{ transform: `scale(${scale})` }}
        onClick={(event) => event.stopPropagation()}
        onTouchStart={(event) => {
          if (event.touches.length === 2) pinch.current = { start: distance(event.touches), scale };
        }}
        onTouchMove={(event) => {
          if (event.touches.length !== 2 || !pinch.current?.start) return;
          const next = pinch.current.scale * (distance(event.touches) / pinch.current.start);
          setScale(Math.max(1, Math.min(4, next)));
        }}
        onTouchEnd={() => { pinch.current = null; }}
      />
    </div>
  );
}

export function RequestsPage() {
  const [lane, setLane] = useState<"pending" | "approved" | "rejected">("pending");
  const [kind, setKind] = useState<"all" | "boost" | "whatsapp" | "tick">("all");
  const [rows, setRows] = useState<Awaited<ReturnType<typeof requestDesk>>>([]);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState("");
  const [proof, setProof] = useState("");
  const [rejectId, setRejectId] = useState("");
  const [reason, setReason] = useState("");

  function load() {
    requestDesk().then((list) => { setRows(list); setReady(true); }).catch(() => { setRows([]); setReady(true); });
  }
  useEffect(load, []);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(id);
  }, [toast]);

  function methodName(method: string) {
    if (method === "card") return "Visa / MasterCard";
    if (method === "jazzcash") return "JazzCash";
    if (method === "easypaisa") return "Easypaisa";
    return method || "Easypaisa / JazzCash";
  }

  function copy(value: string, message: string) {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => setToast(message)).catch(() => setToast("Could not copy."));
  }

  function act(row: { id: string; box: string }, action: "approve" | "reject" | "restore", note = "") {
    const key = `${row.box}:${row.id}`;
    setBusy(key);
    const next = action === "approve" ? "approved" : action === "reject" ? "rejected" : "pending";
    setRows((list) => list.map((item) => item.id === row.id && item.box === row.box ? { ...item, lane: next, note: action === "reject" ? (note || "Invalid payment receipt") : item.note } : item));
    requestAct({ data: { id: row.id, box: row.box, action, reason: note } })
      .then(() => {
        setRejectId("");
        setReason("");
        setToast(action === "approve" ? "Request approved - User notified" : action === "reject" ? "Request rejected - User notified" : "Moved back to pending.");
        load();
      })
      .catch(() => { setToast("That request was not updated."); load(); })
      .finally(() => setBusy(""));
  }

  const shown = rows.filter((row) => row.lane === lane && (kind === "all" || (kind === "boost" ? row.box === "boost" || row.box === "board" : row.box === kind)));
  const rejecting = rows.find((row) => `${row.box}:${row.id}` === rejectId);
  const kinds = [
    ["all", "All"],
    ["boost", "Boost Receipts"],
    ["whatsapp", "WhatsApp Unlocks"],
    ["tick", "Blue Tick"],
  ] as const;
  const empty = lane === "pending" && kind === "boost"
    ? "No pending boost receipts"
    : lane === "pending" && kind === "whatsapp"
      ? "No pending WhatsApp unlocks"
      : lane === "pending" && kind === "tick"
        ? "No pending blue tick requests"
        : `No ${lane} ${kind === "all" ? "requests" : kind === "boost" ? "boost receipts" : kind === "whatsapp" ? "WhatsApp unlocks" : "blue tick requests"}`;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">User Requests & Approvals</h2>
      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-[#0c0c12] p-1">
        {(["pending", "approved", "rejected"] as const).map((id) => (
          <button key={id} type="button" onClick={() => setLane(id)} className={`h-9 rounded-xl text-xs font-semibold capitalize ${lane === id ? "bg-white text-black" : "text-white/55"}`}>{id}</button>
        ))}
      </div>
      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        {kinds.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setKind(id)} className={`h-8 shrink-0 rounded-full px-3 text-[11px] font-semibold ${kind === id ? "bg-[#FFD700] text-black" : "bg-[#16161E] text-white/70"}`}>{label}</button>
        ))}
      </div>
      {shown.map((row) => {
        const key = `${row.box}:${row.id}`;
        const tone = row.box === "tick" ? "bg-amber-300 text-black" : row.box === "whatsapp" ? "bg-violet-500 text-white" : "bg-sky-500 text-white";
        return (
          <article key={key} className="rounded-2xl bg-[#16161E] p-3 text-sm">
            <div className="flex items-start gap-2">
              <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-black text-xs font-semibold">
                {row.avatar ? <img src={row.avatar} alt="" className="size-full object-cover" /> : (row.username || "U").slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">@{row.username || "user"}</p>
                <p className="text-[11px] text-white/45">ID: {row.userId || "—"} <button type="button" className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white" onClick={() => copy(row.userId, "User ID copied")}>Copy ID</button></p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${tone}`}>{row.badge}{row.box === "tick" ? " ✓" : ""}</span>
            </div>
            <p className="mt-3 font-semibold">{row.amount}</p>
            <p className="text-xs text-white/60">{methodName(row.method)} · {row.at ? formatTimeAgo(row.at) : ""}</p>
            <p className="mt-2 text-xs text-white/75">TxID: {row.reference || "—"} <button type="button" className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold" onClick={() => copy(row.reference, "TxID copied - Verify in Easypaisa app")}>Copy TxID</button></p>
            {row.title ? <p className="mt-1 text-xs text-white/50">{row.title}</p> : null}
            {row.shot ? (
              <button type="button" className="mt-2 block size-20 overflow-hidden rounded-xl ring-1 ring-white/20" onClick={() => setProof(row.shot)}>
                <img src={row.shot} alt="Payment proof" className="size-full object-cover" />
              </button>
            ) : <p className="mt-2 text-[11px] text-white/35">No receipt image on this test payment.</p>}
            {row.box === "tick" ? <p className="mt-2 text-xs text-white/70">Gigs: {row.gigs}/3, Views: {row.views.toLocaleString()}, Likes: {row.likes.toLocaleString()} - {row.eligible ? "Eligible" : "Below 5,000 views. You can still approve."}</p> : null}
            {row.payer ? <p className="mt-1 text-xs text-white/50">Note: Paid as {row.payer}</p> : null}
            {row.lane === "pending" ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" disabled={busy === key} className="h-10 rounded-full bg-[#00C853] text-xs font-semibold text-white disabled:opacity-40" onClick={() => act(row, "approve")}>Approve Request</button>
                <button type="button" disabled={busy === key} className="h-10 rounded-full bg-[#D32F2F] text-xs font-semibold text-white disabled:opacity-40" onClick={() => { setRejectId(key); setReason(""); }}>Reject Request</button>
              </div>
            ) : null}
            {row.lane === "approved" ? (
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-300">Approved {row.at ? formatTimeAgo(row.at) : ""}</span>
                {row.username ? <Link to="/u/$username" params={{ username: row.username }} className="grid h-9 place-items-center rounded-full bg-white/10 px-3 text-xs font-semibold">View Profile</Link> : null}
              </div>
            ) : null}
            {row.lane === "rejected" ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-semibold text-red-300">Rejected - {row.note || "Invalid receipt"}</p>
                <button type="button" disabled={busy === key} className="h-9 w-full rounded-full bg-white/10 text-xs font-semibold disabled:opacity-40" onClick={() => act(row, "restore")}>Restore to Pending</button>
              </div>
            ) : null}
          </article>
        );
      })}
      {ready && shown.length === 0 ? (
        <div className="rounded-2xl bg-[#16161E] px-4 py-10 text-center">
          <p className="text-2xl">🧾</p>
          <p className="mt-2 text-sm text-white/60">{empty}</p>
        </div>
      ) : null}
      {!ready ? <p className="text-sm text-white/45">Loading requests…</p> : null}
      {proof ? <ProofZoom src={proof} onClose={() => setProof("")} /> : null}
      {rejecting ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/70 px-4 pb-6">
          <form className="w-full max-w-[398px] space-y-3 rounded-3xl bg-[#16161E] p-4" onSubmit={(event) => { event.preventDefault(); act(rejecting, "reject", reason.trim()); }}>
            <p className="text-sm font-semibold">Reject Request</p>
            <input value={reason} onChange={(e) => setReason(e.target.value.slice(0, 180))} placeholder="Reason (optional): e.g., Invalid payment receipt, TxID not found, Duplicate request" className="h-12 w-full rounded-xl bg-black px-3 text-sm outline-none" />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="h-10 rounded-full bg-white/10 text-sm" onClick={() => setRejectId("")}>Cancel</button>
              <button className="h-10 rounded-full bg-[#D32F2F] text-sm font-semibold text-white">Confirm Reject</button>
            </div>
          </form>
        </div>
      ) : null}
      {toast ? <p className="fixed bottom-6 left-1/2 z-50 max-w-[22rem] -translate-x-1/2 rounded-full bg-white px-4 py-2 text-center text-xs font-semibold text-black shadow">{toast}</p> : null}
    </div>
  );
}

export function SupportPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof founderHelp>>>([]);
  const [ready, setReady] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");

  function load() {
    founderHelp().then((list) => { setRows(list); setReady(true); }).catch(() => { setRows([]); setReady(true); });
  }
  useEffect(load, []);

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Support</h2>
      {rows.map((row) => {
        const open = row.status === "open";
        return (
          <article key={row.id} className="rounded-2xl bg-[#16161E] p-3 text-sm">
            <p className="text-xs leading-5 text-white/70">
              From: @{row.username} (ID: {row.user_id}) · {formatTimeAgo(row.at)} · {open ? <span className="text-red-400">● Open</span> : <span className="text-emerald-400">● Replied</span>}
            </p>
            <p className="mt-2 font-semibold">{row.subject || "Support"}</p>
            <p className="mt-1 whitespace-pre-wrap text-white/75">{row.body}</p>
            {row.reply ? <p className="mt-2 whitespace-pre-wrap text-white/55">Admin: {row.reply}</p> : null}
            <div className="mt-3 space-y-2">
              <input value={drafts[row.id] ?? ""} onChange={(e) => setDrafts((cur) => ({ ...cur, [row.id]: e.target.value }))} placeholder="Type your reply..." className="h-11 w-full rounded-xl bg-black px-3 text-sm outline-none" />
              <button type="button" className="h-10 w-full rounded-full bg-gradient-to-r from-amber-200 via-amber-400 to-yellow-200 text-sm font-semibold text-black" onClick={() => {
                const reply = (drafts[row.id] || "").trim();
                if (reply.length < 2) { setNote("Write a reply first."); return; }
                founderHelpReply({ data: { id: row.id, reply, resolve: false } })
                  .then(() => { setDrafts((cur) => ({ ...cur, [row.id]: "" })); setNote("Reply sent."); load(); })
                  .catch(() => setNote("That reply was not sent."));
              }}>Send Reply</button>
            </div>
          </article>
        );
      })}
      {ready && rows.length === 0 ? <p className="rounded-2xl bg-[#16161E] p-4 text-sm text-white/70">No support tickets - All caught up ✅</p> : null}
      {!ready ? <p className="text-sm text-white/45">Loading tickets…</p> : null}
      {note ? <p className="text-sm text-white/70">{note}</p> : null}
    </div>
  );
}

export function ControlsPage() {
  const [desk, setDesk] = useState<Awaited<ReturnType<typeof ownerDesk>> | null>(null);
  const [manuals, setManuals] = useState<Awaited<ReturnType<typeof manualQueue>>>([]);
  const [cashOn, setCashOn] = useState(true);
  const [payTest, setPayTest] = useState(false);
  const [probe, setProbe] = useState("");
  const [maintain, setMaintain] = useState(false);
  const [note, setNote] = useState("");
  const [toast, setToast] = useState("");

  function load() {
    ownerDesk().then((row) => {
      setDesk(row);
      const rule = row?.rules.find((item) => item.key === "cash_open");
      setCashOn(rule?.value !== "off");
      setPayTest(row?.rules.find((item) => item.key === "pay_test")?.value === "on");
      setMaintain(row?.rules.find((item) => item.key === "maintenance")?.value === "on");
    }).catch(() => setDesk(null));
    manualQueue().then(setManuals).catch(() => setManuals([]));
  }
  useEffect(load, []);
  useEffect(() => {
    try {
      const text = sessionStorage.getItem("flare_founder_toast");
      if (!text) return;
      sessionStorage.removeItem("flare_founder_toast");
      setToast(text);
    } catch { /* private mode */ }
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 4200);
    return () => window.clearTimeout(id);
  }, [toast]);
  const banned = (desk?.blocks ?? []).filter((block) => block.forever || (block.until != null && new Date(block.until).getTime() > Date.now()));
  const scenes = [
    ["success", "Success stays pending"],
    ["pending", "Pending"],
    ["failed", "Failed"],
    ["invalid", "Invalid PIN"],
    ["duplicate", "Duplicate order"],
    ["network", "Network drop"],
    ["reopen", "App reopened"],
  ] as const;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">App Controls</h2>
      <div className="grid grid-cols-2 gap-2">
        <Link to="/founder/controls/maintenance" className="rounded-2xl bg-[#16161E] p-3 ring-1 ring-amber-200/20">
          <span className="grid size-10 place-items-center rounded-xl bg-black text-xl ring-1 ring-amber-300/40">⚙️</span>
          <p className="mt-3 text-sm font-semibold">Maintenance Mode</p>
          <p className="mt-1 text-[11px] font-medium text-amber-200/80">Status: {maintain ? "ON" : "OFF"}</p>
        </Link>
        <Link to="/founder/controls/ban-user" className="rounded-2xl bg-[#16161E] p-3 ring-1 ring-amber-200/20">
          <span className="grid size-10 place-items-center rounded-xl bg-black text-xl ring-1 ring-amber-300/40">🚫</span>
          <p className="mt-3 text-sm font-semibold">Ban User</p>
          <p className="mt-1 text-[11px] font-medium text-amber-200/80">Action</p>
        </Link>
        <Link to="/founder/controls/country-ban" className="rounded-2xl bg-[#16161E] p-3 ring-1 ring-amber-200/20">
          <span className="grid size-10 place-items-center rounded-xl bg-black text-xl ring-1 ring-amber-300/40">🌍</span>
          <p className="mt-3 text-sm font-semibold">Country Ban</p>
          <p className="mt-1 text-[11px] font-medium text-amber-200/80">{banned.length} Active</p>
        </Link>
        <Link to="/founder/controls/broadcast" className="rounded-2xl bg-[#16161E] p-3 ring-1 ring-amber-200/20">
          <span className="grid size-10 place-items-center rounded-xl bg-black text-xl ring-1 ring-amber-300/40">📢</span>
          <p className="mt-3 text-sm font-semibold">Broadcast & Notices</p>
          <p className="mt-1 text-[11px] font-medium text-amber-200/80">Send</p>
        </Link>
        <Link to="/founder/controls/cashout" className="rounded-2xl bg-[#16161E] p-3 ring-1 ring-amber-200/20">
          <span className="grid size-10 place-items-center rounded-xl bg-black text-xl ring-1 ring-amber-300/40">💸</span>
          <p className="mt-3 text-sm font-semibold">Cash-out Control</p>
          <p className="mt-1 text-[11px] font-medium text-amber-200/80">{cashOn ? "Enabled" : "Disabled"}</p>
        </Link>
        <button type="button" className={`rounded-2xl bg-[#16161E] p-3 text-left ring-1 ${payTest ? "ring-amber-300" : "ring-amber-200/20"}`} onClick={() => ownerAct({ data: { kind: "pay_test", value: payTest ? "off" : "on" } }).then(load)}>
          <span className="grid size-10 place-items-center rounded-xl bg-black text-xl ring-1 ring-amber-300/40">🧪</span>
          <p className="mt-3 text-sm font-semibold">Developer Mode</p>
          <p className="mt-1 text-[11px] font-medium text-amber-200/80">{payTest ? "ON" : "OFF"}</p>
        </button>
      </div>
      {payTest ? (
        <section className="rounded-2xl bg-[#16161E] p-3">
          <p className="text-sm font-semibold">Payment test mode</p>
          <p className="mt-1 text-xs leading-5 text-white/50">Dev only. These checks never collect money and never mark an order paid.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {scenes.map(([scene, label]) => (
              <button key={scene} type="button" className="h-10 rounded-xl bg-white/10 px-2 text-xs" onClick={() => payTestProbe({ data: { scene, tid: scene === "invalid" ? "12" : "TEST1234" } }).then((row) => setProbe(row.note)).catch(() => setProbe("Test mode is off."))}>{label}</button>
            ))}
          </div>
          {probe ? <p className="mt-2 text-sm text-white/75">{probe}</p> : null}
        </section>
      ) : null}
      <section className="space-y-2">
        <p className="text-sm font-semibold">Manual orders</p>
        {manuals.map((row) => (
          <div key={row.id} className="rounded-2xl bg-[#16161E] p-3 text-sm">
            <p>@{row.username} · {row.deal_type} · ${(row.amount_usd_cents / 100).toFixed(2)}</p>
            <p className="text-white/45">{row.payment_method} · {row.transaction_id} · {row.status}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {["released", "disputed"].map((status) => (
                <button key={status} type="button" className="h-8 rounded-full bg-white/10 px-3 text-xs" onClick={() => manualAct({ data: { id: row.id, status } }).then(load)}>{status === "released" ? "Approve" : "Reject"}</button>
              ))}
            </div>
          </div>
        ))}
        {manuals.length === 0 ? <p className="text-sm text-white/45">No manual orders.</p> : null}
      </section>
      {note ? <p className="text-sm text-white/70">{note}</p> : null}
      {toast ? <p className="fixed bottom-6 left-1/2 z-50 max-w-[22rem] -translate-x-1/2 rounded-full bg-white px-4 py-2 text-center text-xs font-semibold text-black shadow">{toast}</p> : null}
    </div>
  );
}
