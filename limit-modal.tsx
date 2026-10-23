import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { listingQuota } from "@/lib/shola/profile-desk";

export const GIG_LIMIT_TITLE = "Gig Limit Reached";
export const GIG_LIMIT_BODY =
  "You have 3/3 Gigs active. Flare allows max 3 Gigs to keep quality professional. Delete one Gig from My Gigs or Update an existing Gig to create new. You cannot upload more than 3 Gigs.";
export const BOARD_LIMIT_TITLE = "Board Limit Reached";
export const BOARD_LIMIT_BODY = "You have 5/5 Board requests. Delete one or update existing. Limit is 5.";

export function LimitModal({
  open,
  title,
  body,
  manageLabel,
  onManage,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  manageLabel: string;
  onManage: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/75 px-5" role="dialog" aria-modal="true" aria-labelledby="limit-title">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#14141c] p-5 shadow-2xl">
        <p id="limit-title" className="text-lg font-semibold">{title}</p>
        <p className="mt-2 text-sm leading-6 text-white/70">{body}</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" className="h-11 rounded-xl bg-white text-sm font-semibold text-black" onClick={onManage}>{manageLabel}</button>
          <button type="button" className="h-11 rounded-xl bg-white/10 text-sm font-semibold" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export function useCreateGate() {
  const navigate = useNavigate();
  const [kind, setKind] = useState<"" | "gig" | "board">("");
  const [username, setUsername] = useState("");

  async function openGig() {
    try {
      const row = await listingQuota();
      if (row?.username) setUsername(String(row.username));
      const max = Number(row?.gigMax) || 3;
      if ((Number(row?.gigs) || 0) >= max) {
        setKind("gig");
        return;
      }
    } catch {
      /* the create page checks the cap again */
    }
    navigate({ to: "/gigs/new", search: { edit: "" } });
  }

  async function openBoard() {
    try {
      const row = await listingQuota();
      if (row?.username) setUsername(String(row.username));
      const max = Number(row?.requestMax) || 5;
      if ((Number(row?.requests) || 0) >= max) {
        setKind("board");
        return;
      }
    } catch {
      /* the create page checks the cap again */
    }
    navigate({ to: "/board/new", search: { edit: "" } });
  }

  function manage() {
    const tab = kind === "board" ? "requests" : "gigs";
    try { sessionStorage.setItem("flare_profile_tab", tab); } catch { /* private mode */ }
    const name = username;
    setKind("");
    if (name) navigate({ to: "/u/$username", params: { username: name } });
    else navigate({ to: "/settings" });
  }

  const modal = (
    <LimitModal
      open={kind !== ""}
      title={kind === "board" ? BOARD_LIMIT_TITLE : GIG_LIMIT_TITLE}
      body={kind === "board" ? BOARD_LIMIT_BODY : GIG_LIMIT_BODY}
      manageLabel={kind === "board" ? "Go to My Boards" : "Go to My Gigs"}
      onManage={manage}
      onClose={() => setKind("")}
    />
  );

  return { openGig, openBoard, modal };
}
