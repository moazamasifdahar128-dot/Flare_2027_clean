import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BackBar } from "@/components/flare/page";
import { Badges, Phone } from "@/components/shola/shell";
import { boardList } from "@/lib/shola/board";
import { gigBoard } from "@/lib/shola/gigs";
import { useI18n } from "@/lib/shola/i18n";
import { search, trending } from "@/lib/shola/server";
import { shopList } from "@/lib/shola/shops";

export const Route = createFileRoute("/search")({ component: SearchPage });

function SearchPage() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [topics, setTopics] = useState<{ topic: string; n: number }[]>([]);
  const [people, setPeople] = useState<{ username: string; display_name: string; avatar: string; verified: boolean; starred: boolean; is_founder?: boolean }[]>([]);
  const [clips, setClips] = useState<{ id: string; title: string; username: string; views: number }[]>([]);
  const [gigs, setGigs] = useState<Awaited<ReturnType<typeof gigBoard>>>([]);
  const [listings, setListings] = useState<Awaited<ReturnType<typeof boardList>>>([]);
  const [shops, setShops] = useState<Awaited<ReturnType<typeof shopList>>>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    trending().then(setTopics).catch(() => undefined);
  }, []);

  useEffect(() => {
    const query = q.trim();
    const followWord = /^(follow|follower|followers|following)$/i.test(query);
    if (!query || followWord) {
      setFailed(false);
      setGigs([]);
      setListings([]);
      setShops([]);
      setClips([]);
      if (followWord) {
        setPeople([]);
        setTopics([]);
        return;
      }
      search({ data: "" }).then((r) => setPeople(r.people)).catch(() => setFailed(true));
      return;
    }
    const id = window.setTimeout(() => {
      setFailed(false);
      Promise.all([
        search({ data: query }).then((r) => {
          setPeople(r.people);
          setClips(r.posts);
          if (r.topics.length) setTopics(r.topics);
          return true;
        }).catch(() => false),
        gigBoard({ data: { q: query, category: "All" } }).then((rows) => { setGigs(rows.slice(0, 8)); return true; }).catch(() => false),
        boardList({ data: { q: query } }).then((rows) => { setListings(rows.slice(0, 8)); return true; }).catch(() => false),
        shopList({ data: { q: query } }).then((rows) => { setShops(rows.slice(0, 8)); return true; }).catch(() => false),
      ]).then((flags) => { if (flags.every((ok) => !ok)) setFailed(true); });
    }, 250);
    return () => window.clearTimeout(id);
  }, [q]);

  const quiet = q.trim() && !failed && gigs.length === 0 && listings.length === 0 && shops.length === 0 && clips.length === 0 && people.length === 0;

  return (
    <Phone>
      <div className="px-4 pt-5 pb-16">
        <BackBar title="Search" hint="People, gigs, listings, and shops." />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Flare" className="h-12 w-full rounded-2xl bg-[#16161E] px-4 text-base outline-none" />
        {failed && <p className="mt-4 text-sm text-red-300">Search could not load. Try again.</p>}
        {quiet && <p className="mt-4 text-sm text-white/45">Nothing matched that search.</p>}
        {q.trim() && gigs.length > 0 && (
          <section className="mt-5">
            <h2 className="text-sm text-white/50">Gigs</h2>
            <div className="mt-2 space-y-2">
              {gigs.map((row) => (
                <Link key={row.id} to="/gigs/$id" params={{ id: row.id }} className="block rounded-2xl bg-[#16161E] px-3 py-3 text-sm font-semibold">{row.title}</Link>
              ))}
            </div>
          </section>
        )}
        {!q.trim() && (
          <>
            <h2 className="mt-6 text-sm text-white/50">{t.trending}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {topics.map((topic) => (
                <button key={topic.topic} type="button" onClick={() => setQ(topic.topic)} className="h-11 rounded-full bg-[#16161E] px-3 text-sm">
                  #{topic.topic} <span className="text-white/40">{topic.n}</span>
                </button>
              ))}
              {topics.length === 0 && <p className="text-sm text-white/40">No topics yet.</p>}
            </div>
          </>
        )}
        {clips.length > 0 && (
          <>
            <h2 className="mt-6 text-sm text-white/50">Videos</h2>
            <div className="mt-2 space-y-2">
              {clips.map((clip) => (
                <Link key={clip.id} to="/v/$id" params={{ id: clip.id }} className="block rounded-2xl bg-[#16161E] px-3 py-3 text-sm">
                  {clip.title || "Video"} · @{clip.username}
                </Link>
              ))}
            </div>
          </>
        )}
        <h2 className="mt-6 text-sm text-white/50">{t.people}</h2>
        <div className="mt-2 space-y-3">
          {people.map((p) => (
            <Link key={p.username} to="/u/$username" params={{ username: p.username }} className="flex min-h-11 items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-[#16161E]">
                {p.avatar ? <img src={p.avatar} alt="" className="size-full object-cover" /> : p.display_name.slice(0, 1)}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 font-medium">
                  <span className="truncate">{p.display_name}</span>
                  <Badges verified={p.verified} starred={p.starred} founder={p.is_founder} />
                </span>
                <span className="block truncate text-xs text-white/45">@{p.username}</span>
              </span>
            </Link>
          ))}
          {people.length === 0 && q.trim() && <p className="text-sm text-white/40">No people matched.</p>}
        </div>
      </div>
    </Phone>
  );
}
