import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { TopBack } from "@/components/flare/page";
import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import { MediaStrip } from "@/components/shola/gigs";
import { BoostMark, DirectPay, boostOn } from "@/components/shola/boost";
import { ListingFooter } from "@/components/shola/listing-foot";
import { WhatsAppChip } from "@/components/shola/wa-chip";
import { Phone, Badges, errText } from "@/components/shola/shell";
import { gigDetailMedia } from "@/lib/shola/gig-slides";
import { usdText, pkrForUsd, UNLOCK_USD } from "@/lib/shola/money";
import { askWhatsapp, gigBlock, gigBuy, gigDealReceipt, gigLike, gigOne, gigSave, gigSeen } from "@/lib/shola/gigs";
import { recordListingView } from "@/lib/shola/profile-desk";
import { escrowOpen } from "@/lib/shola/escrow";
import { useI18n } from "@/lib/shola/i18n";

const gigCache = new Map<string, NonNullable<Awaited<ReturnType<typeof gigOne>>>>();

export const Route = createFileRoute("/gigs/$id")({ component: GigPage });

function GigPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const cached = gigCache.get(id) ?? null;
  const [row, setRow] = useState<Awaited<ReturnType<typeof gigOne>>>(cached);
  const [menu, setMenu] = useState(false);
  const [note, setNote] = useState("");
  const [receipt, setReceipt] = useState("");
  const [deal, setDeal] = useState("");
  const [info, setInfo] = useState(false);

  function load() {
    const warm = gigCache.get(id);
    setRow(warm ?? null);
    gigOne({ data: id }).then((next) => {
      if (next) gigCache.set(id, next);
      else gigCache.delete(id);
      setRow(next);
    }).catch(() => {
      if (!gigCache.get(id)) setRow(null);
    });
  }

  useEffect(load, [id]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("flare_unlock") !== id) return;
      sessionStorage.removeItem("flare_unlock");
      setDeal("wa");
    } catch {
      /* ignore */
    }
  }, [id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      gigSeen({ data: id }).catch(() => undefined);
    }, 5000);
    const view = window.setTimeout(() => {
      recordListingView({ data: { kind: "gig", id } }).catch(() => undefined);
    }, 5000);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(view);
    };
  }, [id]);

  const slides = row ? row.slides.filter(Boolean) : [];
  const stills = slides.length ? slides : row?.thumb ? [row.thumb] : [];
  const samples = row
    ? gigDetailMedia(stills, row.videos).map((item) => ({ src: item.url, video: item.type === "video" }))
    : [];

  return (
    <Phone>
      <div className="px-4 pt-3 pb-10">
        <div className="flex items-center justify-between">
          <TopBack />
          <div className="flex items-center gap-3">
            {row?.canEdit && (
              <Link to="/gigs/new" search={{ edit: id }} className="text-sm font-semibold text-white">Edit Gig</Link>
            )}
            {row && !row.mine && (
              <button type="button" className="text-sm" onClick={() => setMenu((v) => !v)}>Menu</button>
            )}
          </div>
        </div>
        {menu && row && !row.mine && (
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <button type="button" className="h-10 rounded-xl bg-surface" onClick={() => gigBlock({ data: row.username }).then(() => setNote("Seller blocked.")).catch((err) => setNote(errText(err, t)))}>Block Seller</button>
          </div>
        )}
        {samples.length > 0 && <div className="mt-3 overflow-hidden rounded-2xl"><MediaStrip items={samples} frame="h-[70dvh]" playable locked={row ? !row.clearShots : false} /></div>}
        {!row && (
          <div className="mt-3 animate-pulse space-y-3" role="status" aria-label="Loading gig">
            <div className="h-[70dvh] rounded-2xl bg-white/10" />
            <div className="h-6 w-2/3 rounded bg-white/10" />
            <div className="h-4 w-1/3 rounded bg-white/10" />
            <div className="h-24 rounded-2xl bg-white/10" />
          </div>
        )}
        {row && (
          <>
            <div className="mt-4 flex items-start justify-between gap-3">
              <h1 className="text-xl font-semibold">{row.title}</h1>
              <button type="button" aria-label="About these stats" className="grid size-8 shrink-0 place-items-center text-muted" onClick={() => setInfo((open) => !open)}>
                <Info className="size-4" />
              </button>
            </div>
            {boostOn(row.boostUntil) ? <div className="mt-2"><BoostMark until={row.boostUntil} /></div> : null}
            {info && <p className="mt-1 text-xs text-muted">Promotion stats only, separate from video earnings.</p>}
            <div className="mt-2 flex items-end justify-between gap-3">
              <Link to="/u/$username" params={{ username: row.username }} className="inline-flex items-center gap-2 text-sm">
                <span className={`relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-surface text-xs ${row.founder ? "founder-mini" : ""}`}>
                  {row.avatar ? <img src={row.avatar} alt="" className="size-full object-cover" /> : row.displayName.slice(0, 1)}
                  {row.online && <span className="absolute right-0 bottom-0 size-2.5 rounded-full bg-emerald-400 ring-2 ring-bg" />}
                </span>
                <span>
                  <span className="flex items-center gap-1 font-medium">
                    {row.displayName}
                    <Badges verified={row.verified} founder={row.founder} />
                  </span>
                  <span className="block text-[11px] text-muted">{row.online ? "Online" : "Offline"}</span>
                </span>
              </Link>
              <div className="text-end">
                <p className="text-2xl font-semibold">{usdText(row.priceUsd)}</p>
                <p className="text-xs text-muted">Delivery {row.days}</p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted">{row.body}</p>
            {row.mine || row.staff ? <p className="mt-2 text-xs text-muted">{row.views} views · {row.likes} likes · {row.saves ?? 0} saves</p> : null}
            {row.adminEdit && <p className="mt-1 text-xs text-muted">{row.adminEdit}</p>}
            <ListingFooter
              kind="gig"
              id={id}
              createdAt={row.createdAt}
              likes={row.likes}
              liked={Boolean(row.liked)}
              saved={Boolean(row.saved)}
              mine={row.mine}
              title={row.title}
              onLike={async () => {
                const next = await gigLike({ data: id });
                setRow((current) => (current ? { ...current, likes: next.likes, liked: next.liked } : current));
                return Boolean(next.liked);
              }}
              onSave={async () => {
                const next = await gigSave({ data: id });
                setRow((current) => (current ? { ...current, saved: next.saved, saves: next.saves } : current));
              }}
            />
            {!row.mine && !row.staff && (
              <div className="mt-3 space-y-2">
                <div className="flex gap-2">
                  <Link to="/chat/$userId/$gigId" params={{ userId: row.ownerId, gigId: id }} search={{ box: "gig" }} className="grid h-11 flex-1 place-items-center rounded-full border border-sky-400/70 text-sm font-semibold text-sky-200">Message</Link>
                  {(row.whatsappListed || row.whatsappOpen) ? <WhatsAppChip gigId={id} open={Boolean(row.whatsappOpen && row.whatsapp)} number={row.whatsapp} listed={row.whatsappListed} onUnlock={() => setDeal(deal === "wa" ? "" : "wa")} /> : null}
                </div>
                <button type="button" className="h-11 w-full rounded-full bg-white text-sm font-semibold text-black" onClick={() => gigBuy({ data: id }).then((next) => setDeal(`In-app deal ${usdText(next.amount)}. Seller receives ${usdText(next.payout)}. Flare keeps ${usdText(next.fee)}.`)).catch((err) => setNote(errText(err, t)))}>
                  Create in-app deal
                </button>
                <button type="button" className="h-11 w-full rounded-full bg-[#16161E] text-sm font-semibold" onClick={() => escrowOpen({ data: id }).then((deal) => navigate({ to: "/escrow/$id", params: { id: deal.id } })).catch((err) => setNote(errText(err, t)))}>
                  Open escrow order
                </button>
                <p className="text-center text-xs text-white/50">{row.whatsappOpen ? "Unlocked" : "Hidden until unlock"}</p>
                {deal === "wa" && !row.whatsappOpen ? (
                  <div className="rounded-2xl border border-white/10 p-3">
                    <p className="text-sm font-semibold">Pay ${UNLOCK_USD} to unlock WhatsApp contact</p>
                    <p className="text-xs leading-5 text-white/60">${UNLOCK_USD} = {pkrForUsd(UNLOCK_USD)} PKR. Pay to Flare Official Account. The number stays hidden until confirmation.</p>
                    <DirectPay usd={UNLOCK_USD} pkr={pkrForUsd(UNLOCK_USD)} onPay={async (input) => {
                      const paid = await askWhatsapp({ data: { id, method: input.method, payer: input.payer, pin: input.pin, last4: input.last4 } });
                      const text = `Payment Successful! $${UNLOCK_USD} paid to Flare Official Account. Test mode: no real wallet or card was charged.`;
                      if (paid.review) {
                        sessionStorage.setItem("flare_pay_note", text);
                        void navigate({ to: "/founder/requests" });
                        return;
                      }
                      setNote(text);
                    }} />
                  </div>
                ) : null}
                {deal && deal !== "wa" && (
                  <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); gigDealReceipt({ data: { id, reference: receipt } }).then(() => setNote("Receipt sent. The 15% deal waits for confirmation.")).catch((err) => setNote(errText(err, t))); }}>
                    <p className="text-xs leading-5 text-white/70">{deal}</p>
                    <input value={receipt} onChange={(e) => setReceipt(e.target.value)} placeholder="Payment receipt" className="h-11 w-full rounded-xl bg-[#16161E] px-3 text-sm outline-none" />
                    <button className="h-11 w-full rounded-xl bg-[#fe2c55] text-sm font-semibold">Send receipt</button>
                  </form>
                )}
              </div>
            )}
            {row.mine && (
              <div className="mt-3">
                <Link to="/inbox" className="grid h-11 w-full place-items-center rounded-xl bg-surface text-sm font-semibold">
                  Inquiry inbox
                </Link>
              </div>
            )}
            {note && <p className="mt-3 text-sm text-primary">{note}</p>}
          </>
        )}
      </div>
    </Phone>
  );
}
