import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { BoostMark, boostOn } from "@/components/shola/boost";
import { ListingFooter } from "@/components/shola/listing-foot";
import { Badges } from "@/components/shola/shell";
import { boardList, jobLike, jobSave, requestOne } from "@/lib/shola/board";
import { recordListingView } from "@/lib/shola/profile-desk";
import { REQUEST_CATS, REQUEST_DEADLINES } from "@/lib/shola/board-rules";

export type RequestCard = Awaited<ReturnType<typeof boardList>>[number];

const BUDGETS = [
  { id: "all", label: "Any budget" },
  { id: "u50", label: "Under $50" },
  { id: "mid", label: "$50–$200" },
  { id: "high", label: "$200+" },
] as const;

function money(row: RequestCard) {
  if (row.currency === "USD") return `$${row.price}`;
  return `${row.price.toLocaleString("en-US")} ${row.currency}`;
}

export function RequestCardView({ row, onChange }: { row: RequestCard; onChange?: (next: RequestCard) => void }) {
  const [open, setOpen] = useState(false);
  const long = row.body.length > 120;
  return (
    <article className={`overflow-hidden rounded-2xl bg-[#16161E] ${boostOn(row.boostUntil) ? "boost-card" : ""}`}>
      <div className="flex items-center gap-2 px-3 pt-3">
        <Link to="/u/$username" params={{ username: row.username }} className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-black text-xs">
          {row.avatar ? <img src={row.avatar} alt="" className="size-full object-cover" /> : row.displayName.slice(0, 1)}
        </Link>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{row.displayName} <Badges verified={row.verified} /></p>
          <p className="truncate text-[11px] text-white/45">@{row.username}</p>
        </div>
      </div>
      <Link to="/board/$id" params={{ id: row.id }} className="block px-3 pt-2 text-base font-semibold leading-6">{row.title}</Link>
      {boostOn(row.boostUntil) ? <div className="px-3 pt-1"><BoostMark until={row.boostUntil} /></div> : null}
      <p className={`px-3 pt-1 text-sm leading-6 text-white/70 ${open ? "" : "line-clamp-2"}`}>{row.body}</p>
      {long ? (
        <button type="button" className="px-3 pt-1 text-xs font-semibold text-sky-300" onClick={() => setOpen((value) => !value)}>{open ? "Show less" : "More"}</button>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2 px-3 text-[11px] text-white/70">
        <span className="rounded-full bg-white/10 px-2 py-1">{row.category}</span>
        <span className="rounded-full bg-white/10 px-2 py-1">{money(row)}</span>
        {row.deadline ? <span className="rounded-full bg-white/10 px-2 py-1">{row.deadline}</span> : null}
        {row.adminHold && row.mine ? <span className="rounded-full bg-amber-200/15 px-2 py-1 text-amber-200">Hidden by Admin - Under Review</span> : row.hidden && row.mine ? <span className="rounded-full bg-[#fe2c55]/20 px-2 py-1 text-[#fe2c55]">Under review</span> : null}
      </div>
      {!row.mine ? (
        <div className="mt-2 px-3">
          <Link to="/chat/$userId/$gigId" params={{ userId: row.ownerId, gigId: row.id }} search={{ box: "job" }} className="grid h-10 place-items-center rounded-full border border-sky-400/70 text-sm font-semibold text-sky-200">Message</Link>
        </div>
      ) : null}
      <ListingFooter
        kind="request"
        id={row.id}
        createdAt={row.createdAt}
        likes={row.likes}
        liked={row.liked}
        saved={row.saved}
        mine={row.mine}
        title={row.title}
        onLike={async () => {
          const next = await jobLike({ data: row.id });
          onChange?.({ ...row, likes: next.likes, liked: next.liked });
          return next.liked;
        }}
        onSave={async () => {
          const next = await jobSave({ data: row.id });
          onChange?.({ ...row, saved: next.saved });
        }}
      />
    </article>
  );
}

export function RequestsPanel({ posted = false }: { posted?: boolean }) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("All");
  const [budget, setBudget] = useState<(typeof BUDGETS)[number]["id"]>("all");
  const [deadline, setDeadline] = useState("All");
  const [rows, setRows] = useState<RequestCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState(posted ? "Request posted." : "");

  function load(next = q, cat = category) {
    setLoading(true);
    boardList({ data: { kind: "need", category: cat === "All" ? "" : cat, q: next } })
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const id = window.setTimeout(() => load(q, category), 200);
    return () => window.clearTimeout(id);
  }, [q, category]);

  useEffect(() => {
    try {
      const text = sessionStorage.getItem("flare_job_toast");
      if (!text) return;
      sessionStorage.removeItem("flare_job_toast");
      setNote(text);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!note) return;
    const id = window.setTimeout(() => setNote(""), 2400);
    return () => window.clearTimeout(id);
  }, [note]);

  const shown = rows.filter((row) => {
    if (budget === "u50" && !(row.currency === "USD" && row.price < 50)) return false;
    if (budget === "mid" && !(row.currency === "USD" && row.price >= 50 && row.price <= 200)) return false;
    if (budget === "high" && !(row.currency === "USD" && row.price >= 200)) return false;
    if (deadline !== "All" && row.deadline !== deadline) return false;
    return true;
  });
  const viewKey = shown.map((row) => row.id).join(",");

  useEffect(() => {
    if (!viewKey) return;
    const ids = viewKey.split(",");
    const timer = window.setTimeout(() => {
      for (const id of ids) recordListingView({ data: { kind: "board", id } }).catch(() => undefined);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [viewKey]);

  return (
    <div className="h-full overflow-y-auto bg-black px-4 pt-4 pb-8">
      <h1 className="text-2xl font-semibold">Jobs</h1>
      <p className="mb-3 text-xs text-white/50">Buyer requests. Text only. Gigs stay on the Gigs tab.</p>
      <div className="flex items-center gap-2 rounded-xl bg-[#16161E] px-3">
        <Search className="size-4 text-white/50" />
        <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search requests" className="h-11 w-full bg-transparent text-base outline-none placeholder:text-white/40" />
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
        {["All", ...REQUEST_CATS].map((item) => (
          <button key={item} type="button" onClick={() => setCategory(item)} className={`h-8 shrink-0 rounded-full px-3 text-xs font-semibold ${category === item ? "bg-white text-black" : "bg-[#16161E] text-white/80"}`}>{item}</button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <select value={budget} onChange={(event) => setBudget(event.target.value as (typeof BUDGETS)[number]["id"])} className="h-8 flex-1 rounded-full bg-[#16161E] px-3 text-xs">
          {BUDGETS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <select value={deadline} onChange={(event) => setDeadline(event.target.value)} className="h-8 flex-1 rounded-full bg-[#16161E] px-3 text-xs">
          <option value="All">Any deadline</option>
          {REQUEST_DEADLINES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      {note ? <p className="mt-3 rounded-full bg-white px-3 py-2 text-center text-xs font-semibold text-black">{note}</p> : null}
      {loading ? (
        <div className="mt-4 animate-pulse space-y-3">
          <div className="h-36 rounded-2xl bg-white/10" />
          <div className="h-36 rounded-2xl bg-white/10" />
        </div>
      ) : null}
      {!loading && shown.length === 0 ? <p className="mt-8 text-center text-sm text-white/70">{q.trim() || category !== "All" ? "No requests match that search." : "No requests yet. Post one with the + button."}</p> : null}
      <div className="mt-4 space-y-4">
        {shown.map((row) => (
          <RequestCardView key={row.id} row={row} onChange={(next) => setRows((list) => list.map((item) => (item.id === row.id ? next : item)))} />
        ))}
      </div>
    </div>
  );
}

export type RequestDetail = NonNullable<Awaited<ReturnType<typeof requestOne>>>;
