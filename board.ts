import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { chatLeak, contactLeak, containsContactInfoBio, maskContact } from "@/lib/shola/gig-text";
import { eraseJob, keepSweep } from "@/lib/shola/life";
import { REQUEST_CAP, overActiveCap } from "@/lib/shola/caps";
import { assertBoostProof, normalizePayMethod, orderRef } from "@/lib/shola/pay-proof";
import { checkoutDesk, founderPayAccounts, founderReviewer, saveFounderAccounts, tidAlreadyUsed } from "@/lib/shola/pay-live";
import { noteBoost, noteBoostReject, noteBoostWait, noteDeal, noteReports } from "@/lib/shola/system-notes";
import { reportReason, shouldHideForReports } from "@/lib/shola/time-ago";
import { assertCountryOpen } from "@/lib/shola/geo-guard";
import {
  BOARD_CATS,
  BOARD_KINDS,
  BOARD_METHODS,
  BOARD_PAY_KINDS,
  REQUEST_CATS,
  REQUEST_DEADLINES,
  payLabel,
  sellerSplit,
  shopLink,
  type BoardCat,
  type BoardKind,
  type BoardMethod,
  type BoardPayKind,
} from "@/lib/shola/board-rules";

function nid() {
  return crypto.randomUUID();
}

function clean(value: unknown, max: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function oneOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function wordsOf(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

type JobRow = {
  id: string;
  kind: string;
  category: string;
  title: string;
  body: string;
  price: number;
  currency: string;
  photo: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar: string;
  verified: boolean;
  tick_state: string;
  owner_views: number;
  boosted: boolean;
  deadline: string;
  likes: number;
  liked: boolean;
  saved: boolean;
  hidden?: boolean;
  admin_hold?: boolean;
  created_at: string;
  expires_at: string;
  boost_until?: string | null;
};

function mapJob(row: JobRow, me: string) {
  return {
    id: row.id,
    kind: oneOf(row.kind, BOARD_KINDS, "offer"),
    category: oneOf(row.category, BOARD_CATS, "Other"),
    title: maskContact(row.title),
    body: maskContact(row.body || ""),
    price: row.price,
    currency: row.currency === "USD" ? "USD" : "PKR",
    photo: row.photo.startsWith("data:image/jpeg") ? row.photo : "",
    mine: row.user_id === me,
    ownerId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    avatar: row.avatar || "",
    verified: Boolean(row.verified),
    faded: false,
    opacity: 1,
    boosted: Boolean(row.boosted),
    deadline: row.deadline || "",
    boostUntil: row.boost_until || "",
    likes: Number(row.likes) || 0,
    liked: Boolean(row.liked),
    saved: Boolean(row.saved),
    hidden: Boolean(row.hidden),
    adminHold: Boolean(row.admin_hold),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

async function open(userId: string) {
  const sql = await getSql();
  if ((await sql`select 1 from profiles where user_id = ${userId} and (banned_forever or (banned_until is not null and banned_until > now()))`).length) {
    throw new Error("BANNED");
  }
  return sql;
}

async function admin(userId: string) {
  const sql = await getSql();
  const me = await sql<{ is_admin: boolean; is_founder: boolean }>`select is_admin, is_founder from profiles where user_id = ${userId}`;
  if (!me[0]?.is_admin && !me[0]?.is_founder) throw new Error("FORBIDDEN");
  return sql;
}

export const boardList = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { kind?: string; category?: string; q?: string } | null | undefined) => ({
    kind: clean(input?.kind, 12),
    category: clean(input?.category, 24),
    q: clean(input?.q, 60).toLowerCase().replace(/[%_\\]/g, ""),
  }))
  .handler(async ({ context, data }) => {
    const sql = await open(context.userId);
    await keepSweep(sql);
    const kind = BOARD_KINDS.includes(data.kind as BoardKind) ? data.kind : "";
    const category = BOARD_CATS.includes(data.category as BoardCat) ? data.category : "";
    const rows = await sql<{
      id: string;
      kind: string;
      category: string;
      title: string;
      body: string;
      price: number;
      currency: string;
      photo: string;
      user_id: string;
      username: string;
      display_name: string;
      avatar: string;
      verified: boolean;
      tick_state: string;
      owner_views: number;
      boosted: boolean;
      boost_until: string | null;
      deadline: string;
      likes: number;
      liked: boolean;
      saved: boolean;
      created_at: string;
      expires_at: string;
    }>`
      select j.id, j.kind, j.category, j.title, j.body, j.price, j.currency, j.photo, j.user_id,
        pr.username, pr.display_name, pr.avatar, pr.verified, pr.tick_state,
        (select count(*)::int from listing_views lv where lv.owner_id = j.user_id) as owner_views,
        (j.boost_until is not null and j.boost_until > now()) as boosted,
        j.boost_until::text as boost_until,
        j.deadline,
        (select count(*)::int from job_likes l where l.job_id = j.id) as likes,
        exists(select 1 from job_likes l where l.job_id = j.id and l.user_id = ${context.userId}) as liked,
        exists(select 1 from job_saves s where s.job_id = j.id and s.user_id = ${context.userId}) as saved,
        j.created_at::text as created_at,
        j.expires_at::text as expires_at
      from job_posts j
      join profiles pr on pr.user_id = j.user_id
      where j.hidden_at is null
       
        and (${kind} = '' or j.kind = ${kind})
        and (${category} = '' or j.category = ${category})
        and (${data.q} = '' or lower(j.title) like ${"%" + data.q + "%"} or lower(j.body) like ${"%" + data.q + "%"} or lower(pr.display_name) like ${"%" + data.q + "%"} or lower(pr.username) like ${"%" + data.q + "%"})
        and not exists (
          select 1 from blocks b
          where (b.blocker_id = ${context.userId} and b.blocked_id = j.user_id)
             or (b.blocked_id = ${context.userId} and b.blocker_id = j.user_id)
        )
      order by (j.boost_until is not null and j.boost_until > now()) desc,
        j.boost_rank desc nulls last,
        j.created_at desc
      limit 60`;
    return rows.map((row) => mapJob(row, context.userId));
  });

export const boardSave = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { kind?: string; category?: string; title?: string; body?: string; price?: number; currency?: string; photo?: string; shopUrl?: string }) => ({
    kind: clean(input?.kind, 12),
    category: clean(input?.category, 24),
    title: clean(input?.title, 80),
    body: clean(input?.body, 600),
    price: Math.floor(Number(input?.price) || 0),
    currency: clean(input?.currency, 3).toUpperCase(),
    photo: String(input?.photo ?? "").slice(0, 140_000),
    shopUrl: String(input?.shopUrl ?? "").trim().slice(0, 200),
  }))
  .handler(async ({ context, data }) => {
    const kind = oneOf(data.kind, BOARD_KINDS, "offer");
    if (!BOARD_KINDS.includes(data.kind as BoardKind)) throw new Error("BOARD_KIND");
    const category = oneOf(data.category, BOARD_CATS, "Other");
    if (!BOARD_CATS.includes(data.category as BoardCat)) throw new Error("BOARD_KIND");
    if (data.title.length < 4 || data.body.length < 4) throw new Error("BOARD_TITLE");
    if (data.price < 1 || data.price > 100_000_000) throw new Error("BOARD_PRICE");
    if (data.currency !== "PKR" && data.currency !== "USD") throw new Error("BOARD_PRICE");
    if (contactLeak(data.title) || contactLeak(data.body)) throw new Error("GIG_LEAK");
    if (data.photo && !data.photo.startsWith("data:image/jpeg")) throw new Error("BOARD_PHOTO");
    const link = data.kind === "shop" ? shopLink(data.shopUrl) : "";
    if (data.kind === "shop" && !link) throw new Error("BOARD_URL");
    if (link && contactLeak(link)) throw new Error("GIG_LEAK");
    const sql = await open(context.userId);
    const fresh = await sql<{ young: boolean }>`
      select created_at > now() - interval '1 day' as young from profiles where user_id = ${context.userId}`;
    if (link && fresh[0]?.young) throw new Error("BOARD_NEW");
    const today = await sql<{ n: number }>`
      select count(*)::int as n from job_posts where user_id = ${context.userId} and created_at > now() - interval '1 day'`;
    if (kind === "need") {
      const active = await sql<{ n: number }>`
        select count(*)::int as n from job_posts
        where user_id = ${context.userId} and kind = 'need' and hidden_at is null`;
      if (overActiveCap(active[0]?.n ?? 0, REQUEST_CAP)) throw new Error("LIMIT_REACHED");
    } else if ((today[0]?.n ?? 0) >= 3) throw new Error("BOARD_CAP");
    const id = nid();
    await sql`
      insert into job_posts (id, user_id, title, body, kind, category, price, currency, photo, shop_url)
      values (${id}, ${context.userId}, ${data.title}, ${data.body}, ${kind}, ${category}, ${data.price}, ${data.currency}, ${data.photo}, ${link})`;
    return { id };
  });

export const boardOne = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => clean(id, 80))
  .handler(async ({ context, data }) => {
    const sql = await open(context.userId);
    const rows = await sql<{
      id: string;
      user_id: string;
      kind: string;
      category: string;
      title: string;
      body: string;
      price: number;
      currency: string;
      photo: string;
      shop_url: string;
      username: string;
      display_name: string;
      boosted: boolean;
      expires_at: string;
      created_at: string;
    }>`
      select j.id, j.user_id, j.kind, j.category, j.title, j.body, j.price, j.currency, j.photo, j.shop_url,
        pr.username, pr.display_name,
        (j.boost_until is not null and j.boost_until > now()) as boosted,
        j.expires_at::text as expires_at, j.created_at::text as created_at
      from job_posts j
      join profiles pr on pr.user_id = j.user_id
      where j.id = ${data} and j.hidden_at is null`;
    const row = rows[0];
    if (!row) return null;
    if ((await sql`select 1 from blocks where (blocker_id = ${context.userId} and blocked_id = ${row.user_id}) or (blocker_id = ${row.user_id} and blocked_id = ${context.userId})`).length) return null;
    const mine = row.user_id === context.userId;
    return {
      id: row.id,
      kind: oneOf(row.kind, BOARD_KINDS, "offer"),
      category: oneOf(row.category, BOARD_CATS, "Other"),
      title: maskContact(row.title),
      body: maskContact(row.body),
      price: row.price,
      currency: row.currency === "USD" ? "USD" : "PKR",
      photo: row.photo.startsWith("data:image/jpeg") ? row.photo : "",
      shopUrl: row.kind === "shop" ? shopLink(row.shop_url) : "",
      mine,
      ownerId: row.user_id,
      username: row.username,
      displayName: row.display_name,
      boosted: Boolean(row.boosted),
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      split: sellerSplit(row.price),
    };
  });

export const boardPayee = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await open(context.userId);
    const me = await sql<{ is_founder: boolean; is_admin: boolean }>`select is_founder, is_admin from profiles where user_id = ${context.userId}`;
    const empty = { pk: "", world: "", title: "", jazzcash: "", easypaisa: "", bank: "", wise: "", payoneer: "", usdt: "", card: "", easyOn: false, jazzOn: false, bankOn: false, cardOn: false };
    if (!me[0]?.is_founder && !me[0]?.is_admin) return empty;
    const accounts = await founderPayAccounts(sql);
    const pick = (method: string) => accounts.find((row) => row.method === method);
    const easy = pick("easypaisa");
    const jazz = pick("jazzcash");
    const bankRow = pick("bank");
    const card = pick("card");
    const row = await sql<{
      payee_pk: string;
      payee_world: string;
      payee_title: string;
      payee_jazzcash: string;
      payee_easypaisa: string;
      payee_bank: string;
      payee_wise: string;
      payee_payoneer: string;
      payee_usdt: string;
    }>`
      select payee_pk, payee_world, payee_title, payee_jazzcash, payee_easypaisa, payee_bank, payee_wise, payee_payoneer, payee_usdt
      from board_settings where id = 'main'`;
    const book = row[0];
    const cardAccount = card?.accountNumber || book?.payee_payoneer || book?.payee_wise || book?.payee_world || "";
    return {
      pk: book?.payee_pk ?? "",
      world: book?.payee_world ?? "",
      title: easy?.title || jazz?.title || card?.title || bankRow?.title || book?.payee_title || "",
      jazzcash: jazz?.accountNumber || book?.payee_jazzcash || book?.payee_pk || "",
      easypaisa: easy?.accountNumber || book?.payee_easypaisa || "",
      bank: bankRow?.accountNumber || book?.payee_bank || "",
      wise: book?.payee_wise || book?.payee_world || "",
      payoneer: book?.payee_payoneer ?? "",
      usdt: book?.payee_usdt ?? "",
      card: cardAccount,
      easyOn: easy ? easy.active : false,
      jazzOn: jazz ? jazz.active : false,
      bankOn: bankRow ? bankRow.active : false,
      cardOn: card ? card.active : false,
    };
  });

export const boardAsk = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { postId?: string; kind?: string; method?: string; reference?: string }) => ({
    postId: clean(input?.postId, 80),
    kind: clean(input?.kind, 16),
    method: clean(input?.method, 16),
    reference: clean(input?.reference, 40),
  }))
  .handler(async ({ context, data }) => {
    if (!BOARD_PAY_KINDS.includes(data.kind as BoardPayKind)) throw new Error("BOARD_PAY");
    if (!BOARD_METHODS.includes(data.method as BoardMethod)) throw new Error("BOARD_PAY");
    if (data.reference.length < 4 || contactLeak(data.reference)) throw new Error("BOARD_PAY");
    const label = payLabel(data.kind, data.method);
    if (!label) throw new Error("BOARD_PAY");
    const sql = await open(context.userId);
    const fresh = await sql<{ young: boolean }>`select created_at > now() - interval '1 day' as young from profiles where user_id = ${context.userId}`;
    if (fresh[0]?.young) throw new Error("BOARD_NEW");
    const post = await sql<{ user_id: string; created_at: string }>`select user_id, created_at::text as created_at from job_posts where id = ${data.postId} and hidden_at is null`;
    if (!post[0] || post[0].user_id !== context.userId) throw new Error("FORBIDDEN");
    await sql`
      insert into board_payments (id, user_id, post_id, kind, method, reference, amount_label)
      values (${nid()}, ${context.userId}, ${data.postId}, ${data.kind}, ${data.method}, ${data.reference}, ${label})`;
    return { ok: true, label };
  });

export const boardReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: string | { id?: string; reason?: string; note?: string }) => {
    const raw = typeof input === "string" ? { id: input, reason: "other", note: "" } : input ?? {};
    return {
      id: clean(raw.id, 80),
      reason: reportReason(String(raw.reason ?? "")),
      note: clean(raw.note, 280),
    };
  })
  .handler(async ({ context, data }) => {
    if (data.note && contactLeak(data.note)) throw new Error("GIG_LEAK");
    const sql = await open(context.userId);
    const post = (await sql<{ user_id: string; title: string; hidden_at: string | null }>`select user_id, title, hidden_at::text as hidden_at from job_posts where id = ${data.id}`)[0];
    if (!post) throw new Error("FORBIDDEN");
    if (post.user_id === context.userId) throw new Error("OWN_LISTING");
    const wrote = await sql`
      insert into board_reports (post_id, reporter_id, reason, note) values (${data.id}, ${context.userId}, ${data.reason}, ${data.note})
      on conflict (post_id, reporter_id) do nothing
      returning post_id`;
    if (!wrote.length) return { ok: true, already: true, hidden: Boolean(post.hidden_at) };
    await sql`insert into reports (id, reporter_id, target_user_id, post_id, reason, note) values (${nid()}, ${context.userId}, ${post.user_id}, ${data.id}, ${data.reason}, ${data.note})`;
    const count = await sql<{ n: number }>`select count(*)::int as n from board_reports where post_id = ${data.id}`;
    let hidden = Boolean(post.hidden_at);
    if (!hidden && shouldHideForReports(count[0]?.n ?? 0)) {
      await sql`update job_posts set hidden_at = now() where id = ${data.id} and hidden_at is null`;
      hidden = true;
      await noteReports(sql, post.user_id, data.id, post.title);
    }
    return { ok: true, already: false, hidden };
  });

export const boardSend = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string; body?: string; to?: string }) => ({
    id: clean(input?.id, 80),
    body: clean(input?.body, 400),
    to: clean(input?.to ?? "", 32).toLowerCase(),
  }))
  .handler(async ({ context, data }) => {
    if (!data.body) throw new Error("EMPTY");
    const sql = await open(context.userId);
    if (chatLeak(data.body)) {
      await sql`insert into spam_logs (id, user_id, kind, body) values (${nid()}, ${context.userId}, ${"request"}, ${maskContact(data.body).slice(0, 180)})`;
      throw new Error("CHAT_LEAK");
    }
    const post = await sql<{ user_id: string }>`select user_id from job_posts where id = ${data.id} and hidden_at is null`;
    if (!post[0]) throw new Error("FORBIDDEN");
    const posterId = post[0].user_id;
    let other = "";
    if (posterId === context.userId) {
      const who = await sql<{ user_id: string }>`select user_id from profiles where username = ${data.to}`;
      if (!who[0] || who[0].user_id === context.userId) throw new Error("FORBIDDEN");
      if (!(await sql`select 1 from job_messages where job_id = ${data.id} and from_id = ${who[0].user_id} and to_id = ${context.userId} limit 1`).length) throw new Error("JOB_FIRST");
      other = who[0].user_id;
    } else other = posterId;
    if ((await sql`select 1 from blocks where (blocker_id = ${context.userId} and blocked_id = ${other}) or (blocker_id = ${other} and blocked_id = ${context.userId})`).length) throw new Error("BLOCKED");
    const messageId = nid();
    if (posterId === context.userId) {
      await sql`insert into job_messages (id, job_id, from_id, to_id, body) values (${messageId}, ${data.id}, ${context.userId}, ${other}, ${data.body})`;
    } else {
      const wrote = await sql<{ id: string }>`
        insert into job_messages (id, job_id, from_id, to_id, body)
        select ${messageId}, ${data.id}, ${context.userId}, ${other}, ${data.body}
        where (
          exists (select 1 from job_messages where job_id = ${data.id} and from_id = ${posterId} and to_id = ${context.userId})
          or exists (
            select 1 from thread_flags
            where kind = 'job' and listing_id = ${data.id} and owner_id = ${posterId} and other_id = ${context.userId} and accepted = true and declined = false
          )
          or (
            (select count(*)::int from job_messages where job_id = ${data.id} and from_id = ${context.userId} and to_id = ${other}) < 3
            and not exists (
              select 1 from thread_flags
              where kind = 'job' and listing_id = ${data.id} and owner_id = ${posterId} and other_id = ${context.userId} and declined = true
            )
          )
        )
        returning id`;
      if (!wrote.length) throw new Error("BOARD_WAIT");
    }
    return { ok: true };
  });

export const boardTalk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { id?: string; with?: string }) => ({
    id: clean(input?.id, 80),
    withUser: clean(input?.with, 32).toLowerCase(),
  }))
  .handler(async ({ context, data }) => {
    const sql = await open(context.userId);
    const post = await sql<{ user_id: string }>`select user_id from job_posts where id = ${data.id}`;
    if (!post[0]) return { messages: [] as { id: string; body: string; mine: boolean }[] };
    let other = "";
    if (post[0].user_id === context.userId) {
      other = (await sql<{ user_id: string }>`select user_id from profiles where username = ${data.withUser}`)[0]?.user_id ?? "";
    } else other = post[0].user_id;
    if (!other || other === context.userId) return { messages: [] };
    const left = post[0].user_id === context.userId ? context.userId : context.userId;
    const messages = await sql<{ id: string; from_id: string; body: string }>`
      select id, from_id, body from job_messages
      where job_id = ${data.id}
        and ((from_id = ${left} and to_id = ${other}) or (from_id = ${other} and to_id = ${left}))
      order by created_at`;
    return { messages: messages.map((row) => ({ id: row.id, body: maskContact(row.body), mine: row.from_id === context.userId })) };
  });

export const boardPeople = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => clean(id, 80))
  .handler(async ({ context, data }) => {
    const sql = await open(context.userId);
    const post = await sql<{ user_id: string }>`select user_id from job_posts where id = ${data}`;
    if (!post[0] || post[0].user_id !== context.userId) return [];
    return (await sql<{ username: string; display_name: string }>`
      select pr.username, pr.display_name
      from (
        select from_id as uid from job_messages where job_id = ${data} and to_id = ${context.userId}
        union
        select to_id as uid from job_messages where job_id = ${data} and from_id = ${context.userId}
      ) people
      join profiles pr on pr.user_id = people.uid
      where people.uid <> ${context.userId}`).map((row) => ({ username: row.username, displayName: row.display_name }));
  });

export const boardDeal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { postId?: string; action?: string; reference?: string }) => ({
    postId: clean(input?.postId, 80),
    action: clean(input?.action, 16),
    reference: clean(input?.reference, 40),
  }))
  .handler(async ({ context, data }) => {
    const sql = await open(context.userId);
    const post = await sql<{ user_id: string; price: number; currency: string }>`
      select user_id, price, currency from job_posts where id = ${data.postId} and hidden_at is null`;
    if (!post[0]) throw new Error("FORBIDDEN");
    if (data.action === "open") {
      if (post[0].user_id === context.userId) throw new Error("FORBIDDEN");
      await sql`
        insert into board_deals (id, post_id, buyer_id, seller_id, amount, currency)
        values (${nid()}, ${data.postId}, ${context.userId}, ${post[0].user_id}, ${post[0].price}, ${post[0].currency})
        on conflict (post_id, buyer_id) do nothing`;
      return { ok: true };
    }
    const deal = await sql<{ id: string; buyer_id: string; seller_id: string; status: string; amount: number }>`
      select id, buyer_id, seller_id, status, amount from board_deals where post_id = ${data.postId} and (buyer_id = ${context.userId} or seller_id = ${context.userId})
      order by created_at desc limit 1`;
    const row = deal[0];
    if (!row) throw new Error("FORBIDDEN");
    if (data.action === "proof" && row.buyer_id === context.userId && row.status === "asked") {
      if (data.reference.length < 4) throw new Error("BOARD_PAY");
      await sql`update board_deals set status = 'pending', reference = ${data.reference}, updated_at = now() where id = ${row.id}`;
      return { ok: true };
    }
    if (data.action === "delivered" && row.seller_id === context.userId && row.status === "held") {
      await sql`update board_deals set status = 'delivered', updated_at = now() where id = ${row.id}`;
      return { ok: true };
    }
    if (data.action === "received" && row.buyer_id === context.userId && row.status === "delivered") {
      await sql`update board_deals set status = 'released', updated_at = now() where id = ${row.id}`;
      await noteDeal(sql, row.seller_id, row.buyer_id, data.postId, row.amount);
      return { ok: true, ...sellerSplit(row.amount) };
    }
    throw new Error("FORBIDDEN");
  });

export const boardMine = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((postId: string) => clean(postId, 80))
  .handler(async ({ context, data }) => {
    const sql = await open(context.userId);
    const rows = await sql<{ status: string; amount: number; currency: string; reference: string; buyer_id: string }>`
      select status, amount, currency, reference, buyer_id from board_deals
      where post_id = ${data} and (buyer_id = ${context.userId} or seller_id = ${context.userId})
      order by created_at desc limit 1`;
    const row = rows[0];
    if (!row) return null;
    return {
      status: row.status,
      amount: row.amount,
      currency: row.currency,
      reference: row.buyer_id === context.userId ? row.reference : "",
      split: sellerSplit(row.amount),
    };
  });

export const boardQueue = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await admin(context.userId);
    const desk = await checkoutDesk(sql);
    const payments = await sql<{ id: string; kind: string; method: string; reference: string; amount_label: string; title: string; username: string; payer_name: string; shot: string; status: string; at: string; route_hint: string }>`
      select p.id, p.kind, p.method, p.reference, p.amount_label, p.status, j.title, pr.username, p.payer_name, p.screenshot_url as shot, p.created_at::text as at, coalesce(p.route_hint, '') as route_hint
      from board_payments p
      join job_posts j on j.id = p.post_id
      join profiles pr on pr.user_id = p.user_id
      where p.kind like 'boost%'
      order by p.created_at desc
      limit 40`;
    const deals = await sql<{ id: string; status: string; amount: number; currency: string; reference: string; title: string; updated_at: string }>`
      select d.id, d.status, d.amount, d.currency, d.reference, j.title, d.updated_at::text as updated_at
      from board_deals d
      join job_posts j on j.id = d.post_id
      where d.status in ('pending', 'held', 'delivered')
      order by d.updated_at
      limit 40`;
    const settings = await sql<{ payee_pk: string; payee_world: string }>`select payee_pk, payee_world from board_settings where id = 'main'`;
    return {
      payments: payments.map((row) => ({ ...row, title: maskContact(row.title), route_hint: row.route_hint || desk.line(row.method) })),
      deals: deals.map((row) => ({ ...row, title: maskContact(row.title), split: sellerSplit(row.amount) })),
      payeePk: settings[0]?.payee_pk ?? "",
      payeeWorld: settings[0]?.payee_world ?? "",
    };
  });

export const boardFounder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { action?: string; id?: string; payeePk?: string; payeeWorld?: string; title?: string; jazzcash?: string; easypaisa?: string; bank?: string; wise?: string; payoneer?: string; usdt?: string; card?: string; easyOn?: boolean; jazzOn?: boolean; bankOn?: boolean; cardOn?: boolean }) => {
    const raw = input ?? {};
    return {
    action: clean(raw.action, 16),
    id: clean(raw.id, 80),
    payeePk: clean(raw.payeePk, 80),
    payeeWorld: clean(raw.payeeWorld, 120),
    title: clean(raw.title, 60),
    jazzcash: clean(raw.jazzcash, 40),
    easypaisa: clean(raw.easypaisa, 40),
    bank: clean(raw.bank, 180),
    wise: clean(raw.wise, 120),
    payoneer: clean(raw.payoneer, 120),
    usdt: "usdt" in raw ? clean(raw.usdt, 80) : null,
    card: "card" in raw ? clean(raw.card, 120) : "",
    cardSent: "card" in raw,
    easyOn: raw.easyOn === true ? true : raw.easyOn === false ? false : null,
    jazzOn: raw.jazzOn === true ? true : raw.jazzOn === false ? false : null,
    bankOn: raw.bankOn === true ? true : raw.bankOn === false ? false : null,
    cardOn: raw.cardOn === true ? true : raw.cardOn === false ? false : null,
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await admin(context.userId);
    if (data.action === "payee") {
      const jazzcash = data.jazzcash || data.payeePk;
      const cardAccount = data.cardSent ? data.card : (data.payoneer || data.wise || data.payeeWorld);
      const wise = data.cardSent ? data.card : (data.wise || data.payeeWorld);
      const payoneer = data.payoneer || (data.cardSent ? data.card : "");
      await saveFounderAccounts(sql, {
        title: data.title,
        easypaisa: data.easypaisa,
        jazzcash,
        bank: data.bank,
        card: cardAccount,
        easyOn: data.easyOn,
        jazzOn: data.jazzOn,
        bankOn: data.bankOn,
        cardOn: data.cardOn,
      });
      await sql`
        update board_settings set
          payee_title = ${data.title},
          payee_jazzcash = ${jazzcash},
          payee_easypaisa = ${data.easypaisa},
          payee_bank = ${data.bank},
          payee_wise = ${wise},
          payee_payoneer = ${payoneer},
          payee_usdt = coalesce(${data.usdt}, payee_usdt),
          payee_pk = ${jazzcash},
          payee_world = ${wise || payoneer}
        where id = 'main'`;
      return { ok: true };
    }
    if (data.action === "reject") {
      const pay = (await sql<{ post_id: string; kind: string }>`select post_id, kind from board_payments where id = ${data.id} and status in ('pending', 'paid')`)[0];
      await sql`update board_payments set status = 'rejected' where id = ${data.id} and status in ('pending', 'paid')`;
      if (pay?.kind.startsWith("boost")) {
        const job = (await sql<{ user_id: string; title: string }>`select user_id, title from job_posts where id = ${pay.post_id}`)[0];
        if (job) await noteBoostReject(sql, job.user_id, pay.post_id, job.title);
      }
      return { ok: true };
    }
    if (data.action === "approve") {
      const pay = await sql<{ post_id: string; kind: string }>`select post_id, kind from board_payments where id = ${data.id} and status in ('pending', 'paid')`;
      if (!pay[0]) throw new Error("FORBIDDEN");
      if (pay[0].kind === "renew") {
        // Listings stay until the owner deletes them. Renew does not move a clock.
      } else if (pay[0].kind === "boost_month") {
        await sql`
          update job_posts
          set boost_rank = now(),
            boost_until = greatest(coalesce(boost_until, now()), now()) + interval '30 days'
          where id = ${pay[0].post_id}`;
      } else if (pay[0].kind === "boost_week") {
        await sql`
          update job_posts
          set boost_rank = now(),
            boost_until = greatest(coalesce(boost_until, now()), now()) + interval '7 days'
          where id = ${pay[0].post_id}`;
      } else {
        await sql`
          update job_posts
          set boost_rank = now(),
            boost_until = greatest(coalesce(boost_until, now()), now()) + interval '1 day'
          where id = ${pay[0].post_id}`;
      }
      await sql`update board_payments set status = 'approved' where id = ${data.id}`;
      if (pay[0].kind.startsWith("boost")) {
        const job = (await sql<{ user_id: string; title: string }>`select user_id, title from job_posts where id = ${pay[0].post_id}`)[0];
        const length = pay[0].kind === "boost_month" ? "month" : pay[0].kind === "boost_week" ? "week" : "day";
        if (job) await noteBoost(sql, job.user_id, pay[0].post_id, job.title, length);
      }
      return { ok: true };
    }
    if (data.action === "refund") {
      await sql`update board_deals set status = 'refunded', updated_at = now() where id = ${data.id} and status in ('pending', 'held', 'delivered')`;
      return { ok: true };
    }
    if (data.action === "hold" || data.action === "release") {
      const next = data.action === "hold" ? "held" : "released";
      const from = data.action === "hold" ? "pending" : "delivered";
      await sql`update board_deals set status = ${next}, updated_at = now() where id = ${data.id} and status = ${from}`;
      return { ok: true };
    }
    throw new Error("FORBIDDEN");
  });

export const requestJobBoost = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string; kind?: string; method?: string; payer?: string; pin?: string; last4?: string }) => ({
    id: clean(input?.id, 80),
    kind: input?.kind === "week" ? "week" : input?.kind === "month" ? "month" : "day",
    method: normalizePayMethod(input?.method),
    payer: clean(input?.payer, 60),
    pin: String(input?.pin ?? "").replace(/\D/g, "").slice(0, 5),
    last4: String(input?.last4 ?? "").replace(/\D/g, "").slice(0, 4),
  }))
  .handler(async ({ context, data }) => {
    const sql = await open(context.userId);
    const desk = await checkoutDesk(sql);
    const proof = assertBoostProof({
      payer: data.payer,
      method: data.method,
      pin: data.pin,
      last4: data.last4,
      kind: data.kind,
      founderAccount: desk.attached ? "attached" : "",
      openMethods: desk.methods,
    });
    // Wrong PIN, low balance, and declined cards throw above. No order and no founder note.
    let ref = orderRef();
    if (await tidAlreadyUsed(sql, ref)) ref = orderRef();
    const mine = await sql<{ title: string }>`select title from job_posts where id = ${data.id} and user_id = ${context.userId} and hidden_at is null`;
    if (!mine[0]) throw new Error("FORBIDDEN");
    const kind = proof.kind === "month" ? "boost_month" : proof.kind === "week" ? "boost_week" : "boost_day";
    const hint = desk.line(proof.method);
    await sql`
      insert into board_payments (id, user_id, post_id, kind, method, reference, amount_label, payer_name, status, route_hint)
      values (${nid()}, ${context.userId}, ${data.id}, ${kind}, ${proof.method}, ${ref}, ${proof.amount}, ${proof.payer}, ${"paid"}, ${hint})`;
    await noteBoostWait(sql, context.userId, data.id, mine[0].title, proof.kind);
    return { ok: true, amount: proof.amount, review: await founderReviewer(sql, context.userId) };
  });

const JOB_CARD = `
  select j.id, j.kind, j.category, j.title, j.body, j.price, j.currency, j.photo, j.user_id,
    pr.username, pr.display_name, pr.avatar, pr.verified, pr.tick_state,
    (select count(*)::int from listing_views lv where lv.owner_id = j.user_id) as owner_views,
    (j.boost_until is not null and j.boost_until > now()) as boosted,
    j.boost_until::text as boost_until,
    j.deadline,
    (select count(*)::int from job_likes l where l.job_id = j.id) as likes,
    exists(select 1 from job_likes l where l.job_id = j.id and l.user_id = $ME) as liked,
    exists(select 1 from job_saves s where s.job_id = j.id and s.user_id = $ME) as saved,
    (j.hidden_at is not null) as hidden,
    coalesce(j.admin_hold, false) as admin_hold,
    j.created_at::text as created_at,
    j.expires_at::text as expires_at
  from job_posts j
  join profiles pr on pr.user_id = j.user_id
`;

export const postRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { title?: string; body?: string; category?: string; budget?: number; deadline?: string }) => ({
    title: clean(input?.title, 80),
    body: String(input?.body ?? "").replace(/\s+/g, " ").trim().slice(0, 2000),
    category: clean(input?.category, 24),
    budget: Math.floor(Number(input?.budget) || 0),
    deadline: clean(input?.deadline, 16),
  }))
  .handler(async ({ context, data }) => {
    if (!REQUEST_CATS.includes(data.category as (typeof REQUEST_CATS)[number])) throw new Error("BOARD_KIND");
    if (!REQUEST_DEADLINES.includes(data.deadline as (typeof REQUEST_DEADLINES)[number])) throw new Error("BOARD_KIND");
    if ((wordsOf(data.title) < 3 && data.title.length < 10) || data.title.length > 80) throw new Error("BOARD_TITLE");
    const count = wordsOf(data.body);
    if (count < 20 || count > 400) throw new Error(count > 400 ? "BOARD_WORDS" : "GIG_BODY");
    if (data.budget < 1 || data.budget > 1_000_000) throw new Error("BOARD_PRICE");
    if (containsContactInfoBio(data.title) || containsContactInfoBio(data.body)) throw new Error("GIG_LEAK");
    const sql = await open(context.userId);
    try {
      if ((await sql`select value from app_rules where key = 'maintenance'`)[0]?.value === "on") {
        const me = await sql<{ is_founder: boolean }>`select is_founder from profiles where user_id = ${context.userId}`;
        if (!me[0]?.is_founder) throw new Error("MAINTENANCE");
      }
    } catch (err) {
      if (err instanceof Error && err.message === "MAINTENANCE") throw err;
    }
    await assertCountryOpen(sql, context.userId);
    const active = await sql<{ n: number }>`
      select count(*)::int as n from job_posts
      where user_id = ${context.userId} and kind = 'need' and hidden_at is null`;
    if (overActiveCap(active[0]?.n ?? 0, REQUEST_CAP)) throw new Error("LIMIT_REACHED");
    const id = nid();
    await sql`
      insert into job_posts (id, user_id, title, body, kind, category, price, currency, photo, shop_url, deadline)
      values (${id}, ${context.userId}, ${data.title}, ${data.body}, ${"need"}, ${data.category}, ${data.budget}, ${"USD"}, ${""}, ${""}, ${data.deadline})`;
    return { id };
  });

export const updateRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string; title?: string; body?: string; category?: string; budget?: number; deadline?: string }) => ({
    id: clean(input?.id, 80),
    title: clean(input?.title, 80),
    body: String(input?.body ?? "").replace(/\s+/g, " ").trim().slice(0, 2000),
    category: clean(input?.category, 24),
    budget: Math.floor(Number(input?.budget) || 0),
    deadline: clean(input?.deadline, 16),
  }))
  .handler(async ({ context, data }) => {
    if (!REQUEST_CATS.includes(data.category as (typeof REQUEST_CATS)[number])) throw new Error("BOARD_KIND");
    if (!REQUEST_DEADLINES.includes(data.deadline as (typeof REQUEST_DEADLINES)[number])) throw new Error("BOARD_KIND");
    if ((wordsOf(data.title) < 3 && data.title.length < 10) || data.title.length > 80) throw new Error("BOARD_TITLE");
    const count = wordsOf(data.body);
    if (count < 20 || count > 400) throw new Error(count > 400 ? "BOARD_WORDS" : "GIG_BODY");
    if (data.budget < 1 || data.budget > 1_000_000) throw new Error("BOARD_PRICE");
    if (containsContactInfoBio(data.title) || containsContactInfoBio(data.body)) throw new Error("GIG_LEAK");
    const sql = await open(context.userId);
    const mine = await sql`select 1 from job_posts where id = ${data.id} and user_id = ${context.userId} and kind = 'need' and hidden_at is null`;
    if (!mine.length) throw new Error("FORBIDDEN");
    await sql`
      update job_posts
      set title = ${data.title}, body = ${data.body}, category = ${data.category}, price = ${data.budget},
        deadline = ${data.deadline}
      where id = ${data.id}`;
    return { id: data.id };
  });

export const deleteRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => clean(id, 80))
  .handler(async ({ context, data }) => {
    const sql = await open(context.userId);
    const mine = await sql`select 1 from job_posts where id = ${data} and user_id = ${context.userId}`;
    if (!mine.length) throw new Error("FORBIDDEN");
    await eraseJob(sql, data);
    return { ok: true };
  });

export const jobLike = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => clean(id, 80))
  .handler(async ({ context, data }) => {
    const sql = await open(context.userId);
    const has = await sql`select 1 from job_likes where job_id = ${data} and user_id = ${context.userId}`;
    if (has.length) {
      await sql`delete from job_likes where job_id = ${data} and user_id = ${context.userId}`;
    } else if ((await sql<{ n: number }>`select count(*)::int as n from job_likes where user_id = ${context.userId} and created_at > now() - interval '10 minutes'`)[0]?.n >= 30) {
      throw new Error("LIKE_FAST");
    } else {
      await sql`insert into job_likes (job_id, user_id) values (${data}, ${context.userId}) on conflict do nothing`;
    }
    const row = await sql<{ n: number }>`select count(*)::int as n from job_likes where job_id = ${data}`;
    return { likes: Number(row[0]?.n) || 0, liked: !has.length };
  });

export const jobSave = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => clean(id, 80))
  .handler(async ({ context, data }) => {
    const sql = await open(context.userId);
    const has = await sql`select 1 from job_saves where job_id = ${data} and user_id = ${context.userId}`;
    if (has.length) await sql`delete from job_saves where job_id = ${data} and user_id = ${context.userId}`;
    else await sql`insert into job_saves (job_id, user_id) values (${data}, ${context.userId}) on conflict do nothing`;
    return { saved: !has.length };
  });

export const jobsByName = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((username: string) => clean(username, 32).toLowerCase())
  .handler(async ({ context, data }) => {
    const sql = await open(context.userId);
    const query = JOB_CARD.replaceAll("$ME", "$2") + `
      where lower(pr.username) = $1
        and j.kind = 'need'
       
        and (j.hidden_at is null or j.user_id = $2)
        and not exists (
          select 1 from blocks b
          where (b.blocker_id = $2 and b.blocked_id = j.user_id)
             or (b.blocked_id = $2 and b.blocker_id = j.user_id)
        )
      order by j.created_at desc
      limit 40`;
    const rows = await sql.query<JobRow>(query, [data, context.userId]);
    return rows.map((row) => mapJob(row, context.userId));
  });

export const savedJobs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await open(context.userId);
    const query = JOB_CARD.replaceAll("$ME", "$1") + `
      where exists(select 1 from job_saves s where s.job_id = j.id and s.user_id = $1)
        and j.kind = 'need'
        and j.hidden_at is null
       
      order by j.created_at desc
      limit 40`;
    const rows = await sql.query<JobRow>(query, [context.userId]);
    return rows.map((row) => mapJob(row, context.userId));
  });

export const requestOne = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => clean(id, 80))
  .handler(async ({ context, data }) => {
    const sql = await open(context.userId);
    await keepSweep(sql);
    const row = (await sql.query<JobRow>(JOB_CARD.replaceAll("$ME", "$2") + ` where j.id = $1 limit 1`, [data, context.userId]))[0];
    if (!row) return null;
    if (row.user_id !== context.userId) {
      if (row.hidden) return null;
      if ((await sql`select 1 from blocks where (blocker_id = ${context.userId} and blocked_id = ${row.user_id}) or (blocker_id = ${row.user_id} and blocked_id = ${context.userId})`).length) return null;
    }
    return mapJob(row, context.userId);
  });
