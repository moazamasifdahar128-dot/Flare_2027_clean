import { COUNTRY_SET } from "@/lib/shola/countries";
import { banCopy, countryByCode } from "@/lib/shola/world";
import { giftById } from "@/lib/shola/gifts";
import { readPlatform } from "@/core/constants";
import { regionOf } from "@/lib/shola/regions";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getSql, type Sql } from "@/lib/db";
import { founderRecord } from "@/core/record.server";
import { authMiddleware } from "@/lib/auth/middleware";
import { chatLeak, containsContactInfoBio, fakeBadge, maskContact, wordCount } from "@/lib/shola/gig-text";
import { keepSweep } from "@/lib/shola/life";
import { postSystem, welcomeOnce } from "@/lib/shola/system-notes";

const founderLaunch = founderRecord.launched;

type Profile = {
  userId: string;
  username: string;
  displayName: string;
  bio: string;
  todayLine: string;
  linkUrl: string;
  rateLine: string;
  avatar: string;
  banner: string;
  isPrivate: boolean;
  hideOnline: boolean;
  hideLikes: boolean;
  hideFollowing: boolean;
  hideFollowers: boolean;
  commentPolicy: string;
  dmPolicy: string;
  readReceipts: boolean;
  hiddenWords: string;
  verified: boolean;
  isFounder: boolean;
  country: string;
  isAdmin: boolean;
  streakDays: number;
  lastSeen: string;
  online: boolean;
  followers: number;
  following: number;
  likes: number;
  views: number;
  starred: boolean;
  eligible: boolean;
  starEligible: boolean;
  isSelf: boolean;
  followed: boolean;
  requested: boolean;
  blocked: boolean;
  locked: boolean;
};

type PostCard = {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  todayLine: string;
  verified: boolean;
  starred: boolean;
  founder: boolean;
  online: boolean;
  kind: string;
  title: string;
  body: string;
  topic: string;
  externalId: string;
  ratio: string;
  nextId: string;
  thumb: string;
  pollOptions: string[];
  quoteOf: string;
  quoteTitle: string;
  collab: string;
  pinned: boolean;
  views: number;
  replays: number;
  likes: number;
  comments: number;
  liked: boolean;
  saved: boolean;
  hideLikes: boolean;
  createdAt: string;
  mine: boolean;
  allowDownload: boolean;
  aiMade: boolean;
  sound: string;
  volume: number;
  trimStart: number;
  trimEnd: number;
  filter: string;
  branded: boolean;
  copyrighted: boolean;
  overlay: string;
  place: string;
  linkUrl: string;
};

function nid() {
  return crypto.randomUUID();
}

const vpnSeen = new Map<string, { at: number; vpn: boolean }>();

function clientIp(headers: Headers) {
  const raw = (headers.get("x-forwarded-for") || headers.get("x-real-ip") || "").split(",")[0].trim();
  return raw.replace(/^::ffff:/i, "");
}

function localIp(ip: string) {
  if (!ip || ip === "::1" || ip === "0.0.0.0") return true;
  const lower = ip.toLowerCase();
  if (lower.startsWith("127.") || lower.startsWith("10.") || lower.startsWith("192.168.")) return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("172.")) {
    const part = Number(lower.split(".")[1]);
    if (part >= 16 && part <= 31) return true;
  }
  return false;
}

async function activeVpn(ip: string) {
  if (localIp(ip)) return false;
  const hit = vpnSeen.get(ip);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.vpn;
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, { signal: AbortSignal.timeout(800) });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean; security?: { vpn?: boolean } };
    const vpn = data.success === true && data.security?.vpn === true;
    vpnSeen.set(ip, { at: Date.now(), vpn });
    return vpn;
  } catch {
    return false;
  }
}

async function tunneled() {
  try {
    const ip = clientIp(getRequest().headers);
    return await activeVpn(ip);
  } catch {
    return false;
  }
}

async function requestHash() {
  try {
    const headers = getRequest().headers;
    const ip = (headers.get("x-forwarded-for") || headers.get("x-real-ip") || "").split(",")[0].trim();
    if (!ip) return "";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
    return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}

function hashtags(text: string, topic: string) {
  const found = text.match(/#([a-z0-9_]{2,24})/gi) ?? [];
  const tags = [...new Set(found.map((tag) => tag.slice(1).toLowerCase()))];
  const cleanTopic = topic.toLowerCase().replace(/^#/, "");
  if (cleanTopic && !tags.includes(cleanTopic)) tags.unshift(cleanTopic);
  return tags.slice(0, 8).join(" ");
}

async function pace(sql: Sql, userId: string, kind: string) {
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from action_log
    where user_id = ${userId} and kind = ${kind} and created_at > now() - interval '1 minute'`;
  if ((rows[0]?.n ?? 0) >= 12) throw new Error("SLOW");
  await sql`insert into action_log (id, user_id, kind) values (${nid()}, ${userId}, ${kind})`;
}

function clean(s: unknown, max: number) {
  return String(s ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function bounded(s: unknown, max: number, code: string) {
  const raw = String(s ?? "").replace(/\u0000/g, "").trim();
  if ([...raw].length > max) throw new Error(code);
  return raw;
}

function secretNote(value: string) {
  return /\b(password|passcode|otp|one[- ]time|login code|verification code|seed phrase|private key|pin code)\b/i.test(value);
}

function okData(s: string, max: number) {
  if (!s) return "";
  if (s.length > max) throw new Error("TOO_BIG");
  if (s.startsWith("data:image/jpeg") || s.startsWith("data:image/png") || s.startsWith("data:image/webp") || s.startsWith("data:video/")) {
    return s;
  }
  throw new Error("BAD_MEDIA");
}

function profileLink(raw: string) {
  let parsed: URL;
  try {
    parsed = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    throw new Error("BAD_URL");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("BAD_URL");
  const host = parsed.hostname.toLowerCase();
  const allowed = new Set([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
    "tiktok.com",
    "www.tiktok.com",
    "vm.tiktok.com",
    "facebook.com",
    "www.facebook.com",
    "m.facebook.com",
    "fb.com",
    "www.fb.com",
  ]);
  const path = parsed.pathname.replace(/\/+$/, "");
  if (!allowed.has(host) || !path || path === "/") throw new Error("BAD_URL");
  return `https://${host}${parsed.pathname}${parsed.search}`.slice(0, 200);
}

function okHttps(s: string) {
  if (!s) return "";
  if (s.startsWith("data:image/")) return okData(s, 1_800_000);
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") throw new Error("BAD_URL");
    return s.slice(0, 800);
  } catch {
    throw new Error("BAD_URL");
  }
}

async function gate(userId: string) {
  readPlatform();
  const sql = await getSql();
  const existing = await sql<{ user_id: string; banned: number }>`
    select user_id,
      case when banned_forever or (banned_until is not null and banned_until > now()) then 1 else 0 end as banned
    from profiles where user_id = ${userId}`;
  if (!existing.length) {
    const admins = await sql<{ n: number }>`select count(*)::int as n from profiles where is_admin = true`;
    const isAdmin = (admins[0]?.n ?? 0) === 0;
    let slug = "u" + userId.replace(/[^a-z0-9]/gi, "").slice(-8).toLowerCase();
    if (slug.length < 3) slug = "u" + nid().slice(0, 6);
    const taken = await sql`select username from profiles where username = ${slug}`;
    if (taken.length) slug = slug + nid().slice(0, 3);
    await sql`insert into profiles (user_id, username, display_name, is_admin) values (${userId}, ${slug}, ${"Flare"}, ${isAdmin})`;
    await sql`insert into wallets (user_id, coins) values (${userId}, 20) on conflict (user_id) do nothing`;
    await welcomeOnce(sql, userId);
  } else if (Number(existing[0].banned) === 1) {
    throw new Error("BANNED");
  }
  try {
    const held = await sql<{ closed_at: string | null; name_hold: string; display_name: string }>`
      select closed_at::text as closed_at, name_hold, display_name from profiles where user_id = ${userId}`;
    if (held[0]?.closed_at) {
      const name = held[0].name_hold || held[0].display_name;
      await sql`update profiles set closed_at = null, display_name = ${name} where user_id = ${userId}`;
    }
  } catch {
    /* name hold arrives with the account migration */
  }
  await sql`insert into wallets (user_id, coins) values (${userId}, 20) on conflict (user_id) do nothing`;
  await claimFounder(sql, userId);
  await stampCountry(sql, userId);
  return sql;
}

async function claimFounder(sql: Sql, userId: string) {
  const found = await sql<{ user_id: string }>`select user_id from profiles where is_founder = true limit 1`;
  if (found[0]) {
    if (found[0].user_id === userId) {
      await sql`
        update profiles
        set bio = ''
        where user_id = ${userId}
          and (bio = ${"Founder & CEO of Flare"} or bio like ${"%Pindi Bhattian%"} or bio like ${"%Jatt Dahar%"})`;
      await sql`
        update profiles
        set display_name = ${"Moazam Asif"}
        where user_id = ${userId} and display_name = ${"Moazam Asif (Dahar)"}`;
      return;
    }
    return;
  }
  const me = await sql<{ is_admin: boolean }>`select is_admin from profiles where user_id = ${userId}`;
  if (!me[0]?.is_admin) return;
  const nameTaken = await sql`select user_id from profiles where username = 'moazam' and user_id <> ${userId}`;
  const username = nameTaken.length ? "moazamasif" : "moazam";
  await sql`
    update profiles
    set is_founder = true, verified = true, starred = true, username = ${username}
    where user_id = ${userId}`;
}

async function stampCountry(sql: Sql, userId: string) {
  const row = await sql<{ country: string }>`select country from profiles where user_id = ${userId}`;
  if (row[0]?.country) return;
  let code = "";
  try {
    const headers = getRequest().headers;
    code = (headers.get("x-vercel-ip-country") || headers.get("cf-ipcountry") || "").toUpperCase();
  } catch {
    code = "";
  }
  if (/^[A-Z]{2}$/.test(code) && code !== "XX" && code !== "T1") {
    await sql`update profiles set country = ${code} where user_id = ${userId} and country = ''`;
  }
}

async function notify(sql: Sql, userId: string, kind: string, fromId: string, postId = "") {
  if (!userId || userId === fromId) return;
  if (kind === "like" || kind === "follow" || kind === "comment") {
    const dup = await sql<{ id: string }>`
      select id from notifications
      where user_id = ${userId} and kind = ${kind} and from_id = ${fromId} and post_id = ${postId}
      limit 1`;
    if (dup.length) return;
  }
  await sql`insert into notifications (id, user_id, kind, from_id, post_id) values (${nid()}, ${userId}, ${kind}, ${fromId}, ${postId})`;
}

async function words(sql: Sql) {
  const rows = await sql<{ word: string }>`select word from banned_words`;
  return rows.map((r) => r.word.toLowerCase());
}

function hasBanned(text: string, list: string[]) {
  const hay = text.toLowerCase();
  return list.some((w) => w && hay.includes(w));
}

const SENSITIVE = ["nude", "nudes", "nsfw", "porn", "xxx", "naked", "onlyfans"];

function isSensitive(text: string) {
  const hay = text.toLowerCase();
  return SENSITIVE.some((w) => hay.includes(w));
}

async function totals(sql: Sql, userId: string) {
  const views = await sql<{ n: number }>`select coalesce(sum(views), 0)::int as n from posts where user_id = ${userId}`;
  return { views: views[0]?.n ?? 0, followers: 0 };
}

function clipRule() {
  return `p.kind = 'video' and e.seconds >= case when p.ratio = '16:9' then 12 else 5 end`;
}

async function calculateEarnings(sql: Sql, userId: string) {
  const recent = await sql.query<{ n: number }>(
    `select count(*)::int as n from view_events e
     join posts p on p.id = e.post_id
     where p.user_id = $1 and e.created_at > now() - interval '30 days' and ${clipRule()}`,
    [userId],
  );
  const wallet = await sql<{ coins: number }>`select coins from wallets where user_id = ${userId}`;
  const coins = wallet[0]?.coins ?? 0;
  return { qualifiedViews: recent[0]?.n ?? 0, coins, usd: coins / 100 };
}

async function qualified30(sql: Sql, userId: string) {
  const earned = await calculateEarnings(sql, userId);
  const { followers } = await totals(sql, userId);
  return { views: earned.qualifiedViews, followers };
}

async function afterGrowth(sql: Sql, userId: string) {
  const { views, followers } = await qualified30(sql, userId);
  const profile = await sql<{ verified: boolean; starred: boolean }>`select verified, starred from profiles where user_id = ${userId}`;
  if (followers >= 6000) {
    const seen = await sql`select kind from milestones where user_id = ${userId} and kind = 'star_auto'`;
    if (!seen.length) {
      await sql`insert into milestones (user_id, kind) values (${userId}, 'star_auto')`;
      await sql`update profiles set starred = true where user_id = ${userId} and is_founder = false`;
    }
  }
  if (followers < 6000 || views < 100000) return;
  if (!profile[0]?.verified) {
    const seen = await sql`select kind from milestones where user_id = ${userId} and kind = 'verify_invited'`;
    if (!seen.length) {
      await sql`insert into milestones (user_id, kind) values (${userId}, 'verify_invited')`;
      await sql`insert into notifications (id, user_id, kind, from_id, post_id) values (${nid()}, ${userId}, 'verify_eligible', '', '')`;
    }
  }
  const studioSeen = await sql`select kind from milestones where user_id = ${userId} and kind = 'studio_ready'`;
  if (!studioSeen.length) {
    await sql`insert into milestones (user_id, kind) values (${userId}, 'studio_ready')`;
    await sql`insert into notifications (id, user_id, kind, from_id, post_id) values (${nid()}, ${userId}, 'studio_ready', '', '')`;
  }
}

function mapPost(r: Record<string, unknown>, me: string): PostCard {
  let poll: string[] = [];
  try {
    const parsed = JSON.parse(String(r.poll_options ?? "[]"));
    if (Array.isArray(parsed)) poll = parsed.map((x) => String(x)).slice(0, 4);
  } catch {
    poll = [];
  }
  const last = r.last_seen ? new Date(String(r.last_seen)).getTime() : 0;
  return {
    id: String(r.id),
    userId: String(r.user_id),
    username: String(r.username),
    displayName: String(r.display_name),
    avatar: String(r.avatar ?? ""),
    todayLine: String(r.today_line ?? ""),
    verified: Boolean(r.verified),
    starred: Boolean(r.starred),
    founder: Boolean(r.is_founder),
    online: !r.hide_online && Date.now() - last < 45_000,
    kind: String(r.kind),
    title: String(r.title ?? ""),
    body: String(r.body ?? ""),
    topic: String(r.topic ?? ""),
    externalId: String(r.external_id ?? ""),
    ratio: String(r.ratio ?? "9:16"),
    nextId: String(r.next_id ?? ""),
    thumb: String(r.thumb ?? ""),
    pollOptions: poll,
    quoteOf: String(r.quote_of ?? ""),
    quoteTitle: String(r.quote_title ?? ""),
    collab: String(r.collab ?? ""),
    pinned: Boolean(r.pinned),
    views: Number(r.views ?? 0),
    replays: Number(r.replays ?? 0),
    likes: Number(r.like_count ?? 0),
    comments: Number(r.comment_count ?? 0),
    liked: Boolean(r.liked),
    saved: Boolean(r.saved),
    hideLikes: Boolean(r.hide_likes),
    createdAt: String(r.created_at ?? ""),
    mine: String(r.user_id) === me,
    allowDownload: r.allow_download !== false,
    aiMade: Boolean(r.ai_made),
    sound: String(r.sound ?? ""),
    volume: Number(r.volume ?? 1),
    trimStart: Number(r.trim_start ?? 0),
    trimEnd: Number(r.trim_end ?? 0),
    filter: String(r.filter ?? ""),
    branded: Boolean(r.branded),
    copyrighted: Boolean(r.copyrighted),
    overlay: String(r.overlay ?? ""),
    place: String(r.place ?? ""),
    linkUrl: String(r.link_url ?? ""),
  };
}

const postSelect = `
  p.id, p.user_id, p.kind, p.title, p.body, p.topic, p.external_id, p.ratio, p.thumb,
  (select n.id from posts n where n.sequel_of = p.id order by n.created_at asc limit 1) as next_id,
  p.poll_options, p.quote_of, p.quote_title, p.collab, p.pinned, p.views, p.replays,
  p.allow_download, p.ai_made, p.sound, p.volume, p.trim_start, p.trim_end, p.filter, p.branded, p.copyrighted, p.overlay, p.place, p.link_url,
  p.created_at::text as created_at,
  pr.username, pr.display_name, pr.avatar, pr.today_line, pr.verified, pr.starred, pr.is_founder, pr.hide_likes, pr.hide_online,
  pr.last_seen::text as last_seen,
  (select count(*)::int from likes l where l.post_id = p.id) as like_count,
  (select count(*)::int from comments c where c.post_id = p.id) as comment_count
`;

function canSeeSql() {
  return `
    pr.banned_forever = false
    and (pr.banned_until is null or pr.banned_until < now())
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = $1 and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = $1)
    )
    and not exists (select 1 from mutes m where m.muter_id = $1 and m.muted_id = p.user_id)
    and not exists (select 1 from not_interested n where n.user_id = $1 and n.post_id = p.id)
    and (p.held = false or p.user_id = $1)
    and (
      p.user_id = $1
      or (
        p.visibility = 'public'
        and pr.is_private = false
      )
    )
  `;
}

export const ensureMe = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name?: string; image?: string }) => ({
    name: clean(input?.name, 60),
    image: clean(input?.image, 800),
  }))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    if (data.name || data.image) {
      const row = await sql<{ display_name: string; avatar: string; name_hold: string }>`
        select display_name, avatar, coalesce(name_hold, '') as name_hold from profiles where user_id = ${context.userId}`;
      const stale = row[0]?.display_name === "Flare" || row[0]?.display_name === "شعلہ";
      const held = row[0]?.name_hold?.trim() || "";
      const name = held || (stale && data.name ? data.name : stale && row[0]?.display_name === "شعلہ" ? "Flare" : row[0]?.display_name);
      let image = row[0]?.avatar ?? "";
      if (!image && data.image.startsWith("https://")) image = data.image;
      await sql`update profiles set display_name = ${name ?? "Flare"}, avatar = ${image}, last_seen = now() where user_id = ${context.userId}`;
    } else {
      await sql`update profiles set last_seen = now() where user_id = ${context.userId}`;
    }
    return { ok: true };
  });

export const closeAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await gate(context.userId);
    const me = await sql<{ is_founder: boolean }>`select is_founder from profiles where user_id = ${context.userId}`;
    if (me[0]?.is_founder) throw new Error("FORBIDDEN");
    const id = context.userId;
    await sql`delete from gig_likes where gig_id in (select id from gigs where user_id = ${id}) or user_id = ${id}`;
    await sql`delete from gig_saves where gig_id in (select id from gigs where user_id = ${id}) or user_id = ${id}`;
    await sql`delete from gigs where user_id = ${id}`;
    await sql`delete from job_posts where user_id = ${id}`;
    await sql`delete from payout_methods where user_id = ${id}`;
    await sql`delete from wallets where user_id = ${id}`;
    await sql`delete from profiles where user_id = ${id} and is_founder = false`;
    return { ok: true };
  });

export const beat = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await gate(context.userId);
    await sql`update profiles set last_seen = now() where user_id = ${context.userId}`;
    await sweepGeo(sql).catch(() => undefined);
    await keepSweep(sql).catch(() => undefined);
    return { ok: true };
  });

export const myProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await gate(context.userId);
    const rows = await loadProfile(sql, context.userId, context.userId, true);
    return rows;
  });

async function loadProfile(sql: Sql, me: string, key: string, byId: boolean): Promise<Profile | null> {
  const rows = byId
    ? await sql<Record<string, unknown>>`
        select user_id, username, display_name, bio, today_line, link_url, rate_line, avatar, banner,
          is_private, hide_online, hide_likes, hide_following, comment_policy, dm_policy, read_receipts, hidden_words,
          verified, is_founder, country, starred, is_admin, streak_days, last_seen::text as last_seen,
          closed_at::text as closed_at
        from profiles where user_id = ${key} limit 1`
    : await sql<Record<string, unknown>>`
        select user_id, username, display_name, bio, today_line, link_url, rate_line, avatar, banner,
          is_private, hide_online, hide_likes, hide_following, comment_policy, dm_policy, read_receipts, hidden_words,
          verified, is_founder, country, starred, is_admin, streak_days, last_seen::text as last_seen,
          closed_at::text as closed_at
        from profiles where lower(username) = ${key.toLowerCase()} limit 1`;
  const r = rows[0];
  if (!r) return null;
  const isSelf = String(r.user_id) === me;
  if (r.closed_at && !isSelf) return null;
  let hideFollowers = false;
  try {
    const flag = await sql<{ hide_followers: boolean }>`select hide_followers from profiles where user_id = ${String(r.user_id)}`;
    hideFollowers = Boolean(flag[0]?.hide_followers);
  } catch {
    hideFollowers = false;
  }
  const userId = String(r.user_id);
  let blocked: unknown[] = [];
  try {
    blocked = await sql`select 1 from blocks where (blocker_id = ${me} and blocked_id = ${userId}) or (blocker_id = ${userId} and blocked_id = ${me}) limit 1`;
  } catch {
    blocked = [];
  }
  if (blocked.length && userId !== me) return null;
  let views = 0;
  try {
    views = (await totals(sql, userId)).views;
  } catch {
    views = 0;
  }
  let likeCount = 0;
  try {
    const liked = await sql<{ n: number }>`
      select count(*)::int as n from likes l join posts p on p.id = l.post_id where p.user_id = ${userId}`;
    likeCount = liked[0]?.n ?? 0;
  } catch {
    likeCount = 0;
  }
  const locked = Boolean(r.is_private) && !isSelf;
  const last = r.last_seen ? new Date(String(r.last_seen)).getTime() : 0;
  return {
    userId,
    username: String(r.username),
    displayName: String(r.display_name),
    bio: locked ? "" : maskContact(String(r.bio ?? "")),
    todayLine: locked ? "" : maskContact(String(r.today_line ?? "")),
    linkUrl: locked ? "" : String(r.link_url ?? ""),
    rateLine: locked ? "" : String(r.rate_line ?? ""),
    avatar: String(r.avatar ?? ""),
    banner: String(r.banner ?? ""),
    isPrivate: Boolean(r.is_private),
    hideOnline: Boolean(r.hide_online),
    hideLikes: Boolean(r.hide_likes),
    hideFollowing: Boolean(r.hide_following),
    hideFollowers,
    commentPolicy: String(r.comment_policy),
    dmPolicy: String(r.dm_policy),
    readReceipts: Boolean(r.read_receipts),
    hiddenWords: isSelf ? String(r.hidden_words ?? "") : "",
    verified: Boolean(r.verified),
    isFounder: Boolean(r.is_founder),
    country: String(r.country ?? ""),
    isAdmin: isSelf ? Boolean(r.is_admin) : false,
    streakDays: Number(r.streak_days ?? 0),
    lastSeen: String(r.last_seen ?? ""),
    online: !r.hide_online && Date.now() - last < 45_000,
    followers: 0,
    following: 0,
    likes: Boolean(r.hide_likes) && !isSelf ? -1 : likeCount,
    views: isSelf ? views : 0,
    starred: Boolean(r.starred),
    eligible: false,
    starEligible: false,
    isSelf,
    followed: false,
    requested: false,
    blocked: false,
    locked,
  };
}

export const profileByName = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((username: string) => clean(username, 32).toLowerCase())
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    return loadProfile(sql, context.userId, data, false);
  });

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Record<string, unknown>) => {
    const rawUser = String(input.username ?? "");
    const rawName = String(input.displayName ?? "");
    if (fakeBadge(rawUser) || fakeBadge(rawName)) throw new Error("FAKE_TICK");
    return {
    username: clean(input.username, 24).toLowerCase().replace(/[^a-z0-9_]/g, ""),
    displayName: clean(input.displayName, 60),
    bio: bounded(input.bio, 600, "BIO_LONG"),
    todayLine: clean(input.todayLine, 80),
    linkUrl: clean(input.linkUrl, 200),
    rateLine: clean(input.rateLine, 80),
    avatar: clean(input.avatar, 1_800_000),
    banner: clean(input.banner, 1_800_000),
    isPrivate: Boolean(input.isPrivate),
    hideOnline: Boolean(input.hideOnline),
    hideLikes: Boolean(input.hideLikes),
    hideFollowing: Boolean(input.hideFollowing),
    hideFollowers: Boolean(input.hideFollowers),
    commentPolicy: ["all", "followers", "off"].includes(String(input.commentPolicy)) ? String(input.commentPolicy) : "all",
    dmPolicy: ["all", "followers", "off"].includes(String(input.dmPolicy)) ? String(input.dmPolicy) : "all",
    readReceipts: Boolean(input.readReceipts),
    hiddenWords: clean(input.hiddenWords, 300),
    clearAvatar: Boolean(input.clearAvatar),
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const current = await sql<{ username: string; display_name: string; username_changed_at: string | null; display_name_changed_at: string | null; is_founder: boolean }>`
      select username, display_name, username_changed_at::text as username_changed_at, display_name_changed_at::text as display_name_changed_at, is_founder
      from profiles where user_id = ${context.userId}`;
    const nextName = data.displayName || "Flare";
    if (current[0] && !current[0].is_founder && current[0].username !== data.username) {
      const last = current[0].username_changed_at ? new Date(current[0].username_changed_at).getTime() : 0;
      if (last && Date.now() - last < 7 * 86_400_000) throw new Error("HANDLE_WAIT");
    }
    if (current[0] && !current[0].is_founder && current[0].display_name && current[0].display_name !== "Flare" && current[0].display_name !== nextName) {
      const last = current[0].display_name_changed_at ? new Date(current[0].display_name_changed_at).getTime() : 0;
      if (last && Date.now() - last < 30 * 86_400_000) throw new Error("NAME_WAIT");
    }
    if (data.username.length < 3) throw new Error("BAD_NAME");
    if (wordCount(data.bio) > 80) throw new Error("BIO_LONG");
    if (containsContactInfoBio(data.bio) || containsContactInfoBio(data.todayLine) || containsContactInfoBio(data.rateLine)) throw new Error("BIO_LEAK");
    const taken = await sql`select user_id from profiles where username = ${data.username} and user_id <> ${context.userId}`;
    if (taken.length) throw new Error("NAME_TAKEN");
    const avatar = data.avatar ? okHttps(data.avatar) : "";
    const banner = data.banner ? okData(data.banner, 1_800_000) : "";
    let link = "";
    if (data.linkUrl) link = profileLink(data.linkUrl);
    await sql`
      update profiles set
        username = ${data.username},
        display_name = ${nextName},
        bio = ${data.bio},
        today_line = ${data.todayLine},
        link_url = ${link},
        rate_line = ${data.rateLine},
        avatar = case when ${data.clearAvatar} then '' when ${avatar} = '' then avatar else ${avatar} end,
        banner = case when ${banner} = '' then banner else ${banner} end,
        is_private = ${data.isPrivate},
        hide_online = ${data.hideOnline},
        hide_likes = ${data.hideLikes},
        hide_following = ${data.hideFollowing},
        hide_followers = ${data.hideFollowers},
        comment_policy = ${data.commentPolicy},
        dm_policy = ${data.dmPolicy},
        read_receipts = ${data.readReceipts},
        hidden_words = ${data.hiddenWords}
      where user_id = ${context.userId}`;
    if (current[0] && current[0].username !== data.username) {
      await sql`update profiles set username_changed_at = now() where user_id = ${context.userId}`;
    }
    if (current[0] && current[0].display_name !== nextName) {
      await sql`update profiles set display_name_changed_at = now() where user_id = ${context.userId}`;
    }
    return { ok: true };
  });

export const saveLook = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { kind?: string; image?: string }) => ({
    kind: input?.kind === "banner" ? "banner" as const : "avatar" as const,
    image: String(input?.image ?? "").slice(0, 1_800_000),
  }))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const image = data.kind === "banner" ? okData(data.image, 1_800_000) : okHttps(data.image);
    if (!image) throw new Error("GIG_PHOTO");
    if (data.kind === "banner") await sql`update profiles set banner = ${image} where user_id = ${context.userId}`;
    else await sql`update profiles set avatar = ${image} where user_id = ${context.userId}`;
    return { ok: true };
  });

async function listPosts(sql: Sql, me: string, mode: "foryou" | "following" | "user" | "saved" | "liked" | "one", username = "") {
  const meRows = await sql<{ hidden_words: string }>`select hidden_words from profiles where user_id = ${me}`;
  const hidden = (meRows[0]?.hidden_words ?? "").toLowerCase().split(",").map((w) => w.trim()).filter(Boolean);
  const params: unknown[] = [me];
  let extra = "";
  if (mode === "following") {
    extra = `and p.user_id = $1`;
  }
  if (mode === "user") {
    params.push(username);
    extra = `and pr.username = $${params.length}`;
  }
  if (mode === "one") {
    params.push(username);
    extra = `and p.id = $${params.length}`;
  }
  if (mode === "saved") {
    extra = `and exists (select 1 from saves s where s.user_id = $1 and s.post_id = p.id)`;
  }
  if (mode === "liked") {
    extra = `and exists (select 1 from likes l where l.user_id = $1 and l.post_id = p.id)`;
  }
  const order = mode === "foryou"
    ? `order by p.pinned desc, (p.user_id = $1 and p.created_at > now() - interval '3 minutes') desc, p.boosted desc, (
        (select count(*) from likes l join posts mine on mine.id = l.post_id
          where l.user_id = $1 and mine.tags <> '' and p.tags <> ''
            and string_to_array(lower(mine.tags), ' ') && string_to_array(lower(p.tags), ' ')) * 8
        + (select count(*) from comments c join posts mine on mine.id = c.post_id
          where c.user_id = $1 and mine.tags <> '' and p.tags <> ''
            and string_to_array(lower(mine.tags), ' ') && string_to_array(lower(p.tags), ' ')) * 6
        + (select count(*) from view_events e join posts mine on mine.id = e.post_id
          where e.user_id = $1 and e.seconds >= 12 and mine.tags <> '' and p.tags <> ''
            and string_to_array(lower(mine.tags), ' ') && string_to_array(lower(p.tags), ' ')) * 3
        + (select count(*) from shares sh join posts mine on mine.id = sh.post_id
          where sh.user_id = $1 and mine.tags <> '' and p.tags <> ''
            and string_to_array(lower(mine.tags), ' ') && string_to_array(lower(p.tags), ' ')) * 5
        + p.views + (select count(*) from likes l2 where l2.post_id = p.id) * 4
          + (select count(*) from comments c2 where c2.post_id = p.id) * 6 + p.replays * 3
      ) / greatest(extract(epoch from (now() - p.created_at)) / 3600.0, 0.4) desc`
    : `order by p.pinned desc, p.created_at desc`;
  const rows = await sql.query<Record<string, unknown>>(
    `select ${postSelect},
      exists(select 1 from likes l where l.post_id = p.id and l.user_id = $1) as liked,
      exists(select 1 from saves s where s.post_id = p.id and s.user_id = $1) as saved
     from posts p join profiles pr on pr.user_id = p.user_id
     where ${canSeeSql()} ${extra}
     ${order}
     limit 40`,
    params,
  );
  return rows
    .map((r) => mapPost(r, me))
    .filter((p) => !hidden.some((w) => `${p.title} ${p.body}`.toLowerCase().includes(w)));
}

export const feed = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: string | { mode?: string; id?: string }) => {
    const mode = typeof input === "string" ? input : input?.mode;
    const id = typeof input === "string" ? "" : clean(input?.id, 80);
    return { mode: mode === "following" ? "following" as const : "foryou" as const, id };
  })
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const rows = await listPosts(sql, context.userId, data.mode);
    if (!data.id) return rows;
    const lead = rows.find((row) => row.id === data.id) ? [] : await listPosts(sql, context.userId, "one", data.id);
    return [...lead, ...rows.filter((row) => row.id !== data.id)].sort((a, b) => (a.id === data.id ? -1 : b.id === data.id ? 1 : 0));
  });

export const userPosts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((username: string) => clean(username, 32).toLowerCase())
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const profile = await loadProfile(sql, context.userId, data, false);
    if (!profile || profile.locked) return [];
    return listPosts(sql, context.userId, "user", data);
  });

export const savedPosts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await gate(context.userId);
    return listPosts(sql, context.userId, "saved");
  });

export const likedPosts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await gate(context.userId);
    return listPosts(sql, context.userId, "liked");
  });

export const postMedia = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => clean(id, 80))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const rows = await sql.query<Record<string, unknown>>(
      `select p.media, p.media_extra, p.kind, p.external_id, p.user_id
       from posts p join profiles pr on pr.user_id = p.user_id
       where p.id = $2 and ${canSeeSql()}
       limit 1`,
      [context.userId, data],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      media: String(r.media ?? ""),
      extra: String(r.media_extra ?? "[]"),
      kind: String(r.kind),
      externalId: String(r.external_id ?? ""),
    };
  });

async function youtubeSeconds(id: string) {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, { signal: AbortSignal.timeout(4000) });
    const html = await res.text();
    const hit = html.match(/"lengthSeconds":"(\d+)"/);
    return hit ? Number(hit[1]) : 0;
  } catch {
    return 0;
  }
}

async function strike(sql: Sql, userId: string, kind: "nsfw_warn" | "copyright") {
  const me = await sql<{ is_founder: boolean; strikes: number }>`select is_founder, strikes from profiles where user_id = ${userId}`;
  await notify(sql, userId, kind, "", "");
  if (me[0]?.is_founder) return;
  const next = (me[0]?.strikes ?? 0) + 1;
  await sql`update profiles set strikes = ${next} where user_id = ${userId}`;
  if (next >= 4) {
    await sql`update profiles set banned_until = now() + interval '1 year' where user_id = ${userId}`;
    const marks = await sql<{ fp: string; ip_hash: string }>`select fp, ip_hash from device_marks where user_id = ${userId}`;
    for (const mark of marks) {
      if (!mark.fp) continue;
      await sql`insert into hard_bans (fp, ip_hash, note) values (${mark.fp}, ${mark.ip_hash}, ${"strike"}) on conflict (fp) do nothing`;
    }
    await notify(sql, userId, "strike_ban", "", "");
  }
}

export function normalizePost(input: Record<string, unknown>) {
  if (String(input.title ?? "").length > 500) throw new Error("TITLE");
  return {
    kind: String(input.kind ?? "text"),
    title: clean(input.title, 500),
    body: clean(input.body, 500),
    topic: clean(input.topic, 40).replace(/^#/, ""),
    media: String(input.kind) === "video" ? String(input.media ?? "").replace(/\u0000/g, "") : clean(input.media, 140_000_000),
    extra: Array.isArray(input.extra) ? input.extra.map((x) => clean(x, 500_000)).slice(0, 9) : [],
    externalId: clean(input.externalId, 240),
    thumb: clean(input.thumb, 400_000),
    poll: Array.isArray(input.poll) ? input.poll.map((x) => clean(x, 40)).filter(Boolean).slice(0, 4) : [],
    quoteOf: clean(input.quoteOf, 80),
    collab: clean(input.collab, 24).toLowerCase(),
    visibility: input.visibility === "followers" ? "followers" : input.visibility === "private" ? "private" : "public",
    ratio: input.ratio === "16:9" ? "16:9" : "9:16",
    videoHash: clean(input.videoHash, 80).toLowerCase(),
    sequelOf: clean(input.sequelOf, 80),
    allowDownload: input.allowDownload !== false,
    aiMade: Boolean(input.aiMade),
    sound: clean(input.sound, 60),
    device: clean(input.device, 80),
    commentsOn: input.commentsOn !== false,
    branded: Boolean(input.branded),
    volume: input.volume == null ? 1 : Math.min(1, Math.max(0, Number(input.volume) || 0)),
    trimStart: Math.max(0, Number(input.trimStart) || 0),
    trimEnd: Math.max(0, Number(input.trimEnd) || 0),
    filter: ["", "warm", "cool", "mono", "vivid"].includes(String(input.filter)) ? String(input.filter) : "",
    overlay: clean(input.overlay, 800),
    place: clean(input.place, 80),
    linkUrl: safeLink(clean(input.linkUrl, 300)),
  };
}

function safeLink(value: string) {
  if (!value) return "";
  if (/^\/gigs\/[a-zA-Z0-9-]{8,80}$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") throw new Error("BAD_URL");
    return url.toString().slice(0, 300);
  } catch (err) {
    if (err instanceof Error && err.message === "BAD_URL") throw err;
    throw new Error("BAD_URL");
  }
}

export const createPost = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Record<string, unknown>) => normalizePost(input))
  .handler(async () => {
    throw new Error("Video posting is not available.");
  });

export const removePost = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => clean(id, 80))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const me = await sql<{ is_admin: boolean }>`select is_admin from profiles where user_id = ${context.userId}`;
    if (me[0]?.is_admin) {
      await sql`delete from posts where id = ${data}`;
    } else {
      await sql`delete from posts where id = ${data} and user_id = ${context.userId}`;
    }
    return { ok: true };
  });

export const editPost = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; title: string; body: string }) => ({
    id: clean(input.id, 80),
    title: clean(input.title, 120),
    body: clean(input.body, 500),
  }))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    await sql`update posts set title = ${data.title}, body = ${data.body} where id = ${data.id} and user_id = ${context.userId}`;
    return { ok: true };
  });

export const pinPost = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => clean(id, 80))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const row = await sql<{ pinned: boolean }>`select pinned from posts where id = ${data} and user_id = ${context.userId}`;
    if (!row[0]) throw new Error("FORBIDDEN");
    if (row[0].pinned) {
      await sql`update posts set pinned = false where id = ${data} and user_id = ${context.userId}`;
      return { ok: true };
    }
    const count = await sql<{ n: number }>`select count(*)::int as n from posts where user_id = ${context.userId} and pinned = true`;
    if ((count[0]?.n ?? 0) >= 4) throw new Error("PIN_FULL");
    await sql`update posts set pinned = true where id = ${data} and user_id = ${context.userId}`;
    return { ok: true };
  });

export const toggleLike = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => clean(id, 80))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const post = await sql<{ user_id: string }>`select user_id from posts where id = ${data}`;
    if (!post[0]) return { liked: false, mood: "sad" };
    const mark = await sql<{ stage: number }>`select stage from like_marks where user_id = ${context.userId} and post_id = ${data}`;
    const stage = mark[0]?.stage ?? 0;
    if (stage >= 3) return { liked: true, mood: "lock" };
    if (stage === 0) {
      await sql`insert into like_marks (user_id, post_id, stage) values (${context.userId}, ${data}, 1)`;
      await sql`insert into likes (user_id, post_id) values (${context.userId}, ${data}) on conflict do nothing`;
      await notify(sql, post[0].user_id, "like", context.userId, data);
      return { liked: true, mood: "love" };
    }
    if (stage === 1) {
      await sql`update like_marks set stage = 2 where user_id = ${context.userId} and post_id = ${data}`;
      await sql`delete from likes where user_id = ${context.userId} and post_id = ${data}`;
      return { liked: false, mood: "sad" };
    }
    await sql`update like_marks set stage = 3 where user_id = ${context.userId} and post_id = ${data}`;
    await sql`insert into likes (user_id, post_id) values (${context.userId}, ${data}) on conflict do nothing`;
    return { liked: true, mood: "joy" };
  });

export const toggleSave = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => clean(id, 80))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const has = await sql`select 1 from saves where user_id = ${context.userId} and post_id = ${data}`;
    if (has.length) {
      await sql`delete from saves where user_id = ${context.userId} and post_id = ${data}`;
      return { saved: false };
    }
    await sql`insert into saves (user_id, post_id) values (${context.userId}, ${data})`;
    return { saved: true };
  });

export const countView = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; replay?: boolean; seconds?: number; source?: string }) => ({
    id: clean(input.id, 80),
    replay: Boolean(input.replay),
    seconds: Math.min(600, Math.max(0, Math.floor(Number(input.seconds) || 0))),
    source: input.source === "search" || input.source === "profile" ? input.source : "foryou",
  }))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const post = await sql<{ user_id: string; kind: string; ratio: string }>`select user_id, kind, ratio from posts where id = ${data.id}`;
    if (!post[0] || post[0].user_id === context.userId) return { ok: true };
    if (post[0].kind !== "video") return { ok: true };
    const need = post[0].ratio === "16:9" ? 12 : 5;
    if (!data.replay && data.seconds < need) {
      await sql`
        insert into watch_opens (post_id, user_id, opened_at)
        values (${data.id}, ${context.userId}, now())
        on conflict (post_id, user_id) do update set opened_at = now()`;
      return { ok: true };
    }
    if (data.replay) {
      const row = await sql<{ n: number }>`select n from post_views where post_id = ${data.id} and user_id = ${context.userId}`;
      if (row[0] && row[0].n < 30) {
        await sql`update post_views set n = n + 1 where post_id = ${data.id} and user_id = ${context.userId}`;
        await sql`update posts set replays = replays + 1 where id = ${data.id}`;
      }
      return { ok: true };
    }
    const open = await sql<{ opened_at: string }>`
      select opened_at::text as opened_at from watch_opens
      where post_id = ${data.id} and user_id = ${context.userId}`;
    const age = open[0] ? Date.now() - new Date(open[0].opened_at).getTime() : 0;
    if (!open[0] || age < need * 1000 - 200) return { ok: true };
    await sql`delete from watch_opens where post_id = ${data.id} and user_id = ${context.userId}`;
    const ip = await requestHash();
    if (ip) {
      const seenIp = await sql`
        select id from view_events
        where post_id = ${data.id} and ip_hash = ${ip} and created_at > now() - interval '24 hours'
        limit 1`;
      if (seenIp.length) return { ok: true };
    }
    const inserted = await sql`
      insert into post_views (post_id, user_id, n) values (${data.id}, ${context.userId}, 1)
      on conflict (post_id, user_id) do nothing
      returning post_id`;
    if (inserted.length) {
      await sql`update posts set views = views + 1 where id = ${data.id}`;
      await sql`insert into view_events (id, post_id, user_id, seconds, source, ip_hash, event_type) values (${nid()}, ${data.id}, ${context.userId}, ${data.seconds}, ${data.source}, ${ip}, ${"video_watch"})`;
      const rpm = post[0].ratio === "16:9" ? 0.8 : 0.1;
      const cut = (rpm / 1000) * 0.4;
      const founders = await sql<{ user_id: string }>`select user_id from profiles where is_founder = true`;
      for (const founder of founders) {
        await sql`
          insert into wallets (user_id, coins, estimate_usd) values (${founder.user_id}, 0, ${cut})
          on conflict (user_id) do update set estimate_usd = wallets.estimate_usd + ${cut}`;
      }
      await afterGrowth(sql, post[0].user_id);
    }
    return { ok: true };
  });

export const watchStop = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; seconds?: number; duration?: number; source?: string }) => ({
    id: clean(input.id, 80),
    seconds: Math.min(3600, Math.max(0, Number(input.seconds) || 0)),
    duration: Math.min(3600, Math.max(0, Number(input.duration) || 0)),
    source: input.source === "search" || input.source === "profile" ? input.source : "foryou",
  }))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const post = await sql<{ user_id: string; kind: string; ratio: string; duration_s: number }>`
      select user_id, kind, ratio, duration_s from posts where id = ${data.id}`;
    if (!post[0] || post[0].kind !== "video" || post[0].user_id === context.userId) return { ok: true };
    if (data.duration >= 1 && post[0].duration_s === 0) {
      await sql`update posts set duration_s = ${Math.round(data.duration)} where id = ${data.id} and duration_s = 0`;
    }
    const open = await sql<{ opened_at: string }>`
      select opened_at::text as opened_at from watch_opens where post_id = ${data.id} and user_id = ${context.userId}`;
    const age = open[0] ? (Date.now() - new Date(open[0].opened_at).getTime()) / 1000 : 0;
    const seconds = Math.min(data.seconds, age > 0 ? age + 1 : 0);
    if (!open[0] || seconds < 0.2) return { ok: true };
    const need = post[0].ratio === "16:9" ? 12 : 5;
    const prior = await sql<{ id: string; event_type: string; seconds: number }>`
      select id, event_type, seconds from view_events
      where post_id = ${data.id} and user_id = ${context.userId} and event_type in ('video_watch', 'skip', 'partial')
      order by created_at desc limit 1`;
    if (prior[0]?.event_type === "video_watch") {
      if (seconds > prior[0].seconds) await sql`update view_events set seconds = ${Math.floor(seconds)} where id = ${prior[0].id}`;
      return { ok: true };
    }
    if (seconds < need) {
      const kind = seconds < 3 ? "skip" : "partial";
      if (prior[0]) await sql`update view_events set event_type = ${kind}, seconds = ${Math.floor(seconds)} where id = ${prior[0].id}`;
      else await sql`insert into view_events (id, post_id, user_id, seconds, source, ip_hash, event_type) values (${nid()}, ${data.id}, ${context.userId}, ${Math.floor(seconds)}, ${data.source}, ${""}, ${kind})`;
      return { ok: true };
    }
    if (age < need - 0.4) return { ok: true };
    const ip = await requestHash();
    if (ip) {
      const seenIp = await sql`
        select id from view_events
        where post_id = ${data.id} and ip_hash = ${ip} and event_type = 'video_watch' and created_at > now() - interval '24 hours'
        limit 1`;
      if (seenIp.length) return { ok: true };
    }
    const inserted = await sql`
      insert into post_views (post_id, user_id, n) values (${data.id}, ${context.userId}, 1)
      on conflict (post_id, user_id) do nothing
      returning post_id`;
    const stored = Math.floor(seconds);
    if (prior[0]) await sql`update view_events set event_type = 'video_watch', seconds = ${stored}, ip_hash = ${ip} where id = ${prior[0].id}`;
    else await sql`insert into view_events (id, post_id, user_id, seconds, source, ip_hash, event_type) values (${nid()}, ${data.id}, ${context.userId}, ${stored}, ${data.source}, ${ip}, ${"video_watch"})`;
    if (inserted.length) {
      await sql`update posts set views = views + 1 where id = ${data.id}`;
      const rpm = post[0].ratio === "16:9" ? 0.8 : 0.1;
      const cut = (rpm / 1000) * 0.4;
      const founders = await sql<{ user_id: string }>`select user_id from profiles where is_founder = true`;
      for (const founder of founders) {
        await sql`
          insert into wallets (user_id, coins, estimate_usd) values (${founder.user_id}, 0, ${cut})
          on conflict (user_id) do update set estimate_usd = wallets.estimate_usd + ${cut}`;
      }
      await afterGrowth(sql, post[0].user_id);
    }
    return { ok: true };
  });

export const videoStats = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => clean(id, 80))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const post = await sql<{ user_id: string; title: string; ratio: string; duration_s: number; views: number }>`
      select user_id, title, ratio, duration_s, views from posts where id = ${data} and kind = 'video'`;
    if (!post[0] || post[0].user_id !== context.userId) throw new Error("FORBIDDEN");
    const rows = await sql<{ event_type: string; seconds: number }>`
      select event_type, seconds from view_events
      where post_id = ${data} and event_type in ('video_watch', 'skip', 'partial')`;
    const total = rows.length;
    const watched = rows.filter((row) => row.event_type === "video_watch");
    const seconds = rows.reduce((sum, row) => sum + Number(row.seconds || 0), 0);
    const skips = rows.filter((row) => row.event_type === "skip").length;
    const duration = post[0].duration_s;
    const finished = duration > 0 ? watched.filter((row) => row.seconds >= duration * 0.98).length : 0;
    const countries = await sql<{ country: string; n: number }>`
      select coalesce(nullif(pr.country, ''), 'Unknown') as country, count(*)::int as n
      from view_events e join profiles pr on pr.user_id = e.user_id
      where e.post_id = ${data} and e.event_type = 'video_watch'
      group by 1 order by n desc limit 8`;
    const me = await sql<{ monetized: boolean; is_founder: boolean }>`select monetized, is_founder from profiles where user_id = ${context.userId}`;
    const qualified = watched.length;
    const rpm = post[0].ratio === "16:9" ? 0.8 : 0.1;
    const money = Boolean(me[0]?.monetized || me[0]?.is_founder);
    const countryTotal = countries.reduce((sum, row) => sum + row.n, 0);
    return {
      title: post[0].title,
      ratio: post[0].ratio,
      views: post[0].views,
      seconds,
      viewers: total,
      average: total ? seconds / total : 0,
      skipRate: total ? skips / total : 0,
      heldRate: total ? qualified / total : 0,
      completion: duration > 0 && watched.length ? finished / watched.length : -1,
      countries: countries.map((row) => ({ country: row.country, pct: countryTotal ? row.n / countryTotal : 0 })),
      money,
      rpm,
      estimate: money ? (qualified / 1000) * rpm * 0.6 : 0,
    };
  });

export const skipPost = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => clean(id, 80))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    await sql`insert into not_interested (user_id, post_id) values (${context.userId}, ${data}) on conflict do nothing`;
    return { ok: true };
  });

export const listComments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => clean(id, 80))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const rows = await sql<Record<string, unknown>>`
      select c.id, c.user_id, c.parent_id, c.body, c.pinned, c.created_at::text as created_at,
        pr.username, pr.display_name, pr.avatar, pr.verified, pr.starred, pr.monetized, pr.is_founder,
        (select count(*)::int from comment_likes cl where cl.comment_id = c.id) as likes
      from comments c join profiles pr on pr.user_id = c.user_id
      where c.post_id = ${data}
      order by c.pinned desc, c.created_at asc
      limit 200`;
    const me = await sql<{ is_admin: boolean; is_founder: boolean }>`select is_admin, is_founder from profiles where user_id = ${context.userId}`;
    const post = await sql<{ user_id: string }>`select user_id from posts where id = ${data}`;
    const staff = Boolean(me[0]?.is_admin || me[0]?.is_founder || post[0]?.user_id === context.userId);
    return rows.map((r) => ({
      id: String(r.id),
      userId: String(r.user_id),
      parentId: String(r.parent_id ?? ""),
      body: String(r.body),
      pinned: Boolean(r.pinned),
      createdAt: String(r.created_at),
      username: String(r.username),
      displayName: String(r.display_name),
      avatar: String(r.avatar ?? ""),
      verified: Boolean(r.verified || r.monetized || r.is_founder),
      starred: Boolean(r.starred),
      likes: Number(r.likes ?? 0),
      mine: String(r.user_id) === context.userId,
      canDelete: staff || String(r.user_id) === context.userId,
    }));
  });

export const addComment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { postId: string; body: string; parentId?: string }) => ({
    postId: clean(input.postId, 80),
    body: clean(input.body, 400),
    parentId: clean(input.parentId, 80),
  }))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    if (!data.body) throw new Error("EMPTY");
    const banned = await words(sql);
    if (hasBanned(data.body, banned)) throw new Error("WORD");
    const post = await sql<{ user_id: string; comment_policy: string; comments_on: boolean; comment_words: string }>`
      select p.user_id, pr.comment_policy, p.comments_on, p.comment_words
      from posts p join profiles pr on pr.user_id = p.user_id where p.id = ${data.postId}`;
    if (!post[0]) throw new Error("MISSING");
    if (!post[0].comments_on && post[0].user_id !== context.userId) throw new Error("CLOSED");
    const policy = post[0].comment_policy;
    if (policy === "off" && post[0].user_id !== context.userId) throw new Error("CLOSED");
    const hidden = await sql<{ hidden_words: string }>`select hidden_words from profiles where user_id = ${post[0].user_id}`;
    const ownerWords = (hidden[0]?.hidden_words ?? "").toLowerCase().split(",").map((w) => w.trim()).filter(Boolean);
    if (hasBanned(data.body, ownerWords)) throw new Error("WORD");
    const videoWords = (post[0].comment_words ?? "").toLowerCase().split(",").map((w) => w.trim()).filter(Boolean);
    if (hasBanned(data.body, videoWords)) throw new Error("WORD");
    await pace(sql, context.userId, "comment");
    const id = nid();
    await sql`insert into comments (id, post_id, user_id, parent_id, body) values (${id}, ${data.postId}, ${context.userId}, ${data.parentId}, ${data.body})`;
    await notify(sql, post[0].user_id, "comment", context.userId, data.postId);
    return { id };
  });

export const pinComment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { postId: string; commentId: string }) => ({
    postId: clean(input.postId, 80),
    commentId: clean(input.commentId, 80),
  }))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const post = await sql`select id from posts where id = ${data.postId} and user_id = ${context.userId}`;
    if (!post.length) throw new Error("FORBIDDEN");
    await sql`update comments set pinned = false where post_id = ${data.postId}`;
    await sql`update comments set pinned = true where id = ${data.commentId} and post_id = ${data.postId}`;
    return { ok: true };
  });

export const removeComment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => clean(id, 80))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const row = await sql<{ author: string; owner: string }>`
      select c.user_id as author, p.user_id as owner
      from comments c join posts p on p.id = c.post_id
      where c.id = ${data}`;
    if (!row[0]) return { ok: true };
    const me = await sql<{ is_admin: boolean; is_founder: boolean }>`select is_admin, is_founder from profiles where user_id = ${context.userId}`;
    const allowed = Boolean(me[0]?.is_admin || me[0]?.is_founder || row[0].author === context.userId || row[0].owner === context.userId);
    if (!allowed) throw new Error("FORBIDDEN");
    await sql`delete from comments where id = ${data}`;
    return { ok: true };
  });

export const votePoll = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { postId: string; option: number }) => ({
    postId: clean(input.postId, 80),
    option: Number(input.option) || 0,
  }))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    await sql`
      insert into poll_votes (post_id, user_id, option_idx) values (${data.postId}, ${context.userId}, ${data.option})
      on conflict (post_id, user_id) do update set option_idx = ${data.option}`;
    const rows = await sql<{ option_idx: number; n: number }>`
      select option_idx, count(*)::int as n from poll_votes where post_id = ${data.postId} group by option_idx`;
    return rows;
  });

export const pollCounts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => clean(id, 80))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const rows = await sql<{ option_idx: number; n: number }>`
      select option_idx, count(*)::int as n from poll_votes where post_id = ${data} group by option_idx`;
    const mine = await sql<{ option_idx: number }>`select option_idx from poll_votes where post_id = ${data} and user_id = ${context.userId}`;
    return { rows, mine: mine[0]?.option_idx ?? -1 };
  });

export const follow = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((username: string) => clean(username, 32).toLowerCase())
  .handler(async () => {
    return { state: "none" as const };
  });

export const decideRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { fromId: string; accept: boolean }) => ({
    fromId: clean(input.fromId, 80),
    accept: Boolean(input.accept),
  }))
  .handler(async () => {
    return { ok: true };
  });

export const blockUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((username: string) => clean(username, 32).toLowerCase())
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const who = await sql<{ user_id: string }>`select user_id from profiles where username = ${data}`;
    if (!who[0] || who[0].user_id === context.userId) return { ok: true };
    await sql`insert into blocks (blocker_id, blocked_id) values (${context.userId}, ${who[0].user_id}) on conflict do nothing`;
    return { ok: true };
  });

export const blockedList = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await gate(context.userId);
    return sql<{ username: string; display_name: string; avatar: string }>`
      select pr.username, pr.display_name, pr.avatar
      from blocks b join profiles pr on pr.user_id = b.blocked_id
      where b.blocker_id = ${context.userId}
      order by pr.display_name`;
  });

export const unblockUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((username: string) => clean(username, 32).toLowerCase())
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const who = await sql<{ user_id: string }>`select user_id from profiles where username = ${data}`;
    if (!who[0]) return { ok: true };
    await sql`delete from blocks where blocker_id = ${context.userId} and blocked_id = ${who[0].user_id}`;
    return { ok: true };
  });

export const muteUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((username: string) => clean(username, 32).toLowerCase())
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const who = await sql<{ user_id: string }>`select user_id from profiles where username = ${data}`;
    if (!who[0]) return { ok: true };
    await sql`insert into mutes (muter_id, muted_id) values (${context.userId}, ${who[0].user_id}) on conflict do nothing`;
    return { ok: true };
  });

export const report = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { postId?: string; username?: string; reason: string; note?: string }) => ({
    postId: clean(input.postId, 80),
    username: clean(input.username, 32).toLowerCase(),
    reason: clean(input.reason, 40),
    note: clean(input.note, 300),
  }))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    let target = "";
    if (data.username) {
      const who = await sql<{ user_id: string }>`select user_id from profiles where username = ${data.username}`;
      target = who[0]?.user_id ?? "";
    } else if (data.postId) {
      const post = await sql<{ user_id: string }>`select user_id from posts where id = ${data.postId}`;
      target = post[0]?.user_id ?? "";
    }
    await sql`insert into reports (id, reporter_id, target_user_id, post_id, reason, note) values (${nid()}, ${context.userId}, ${target}, ${data.postId}, ${data.reason}, ${data.note})`;
    if (data.postId && target && target !== context.userId) {
      const owner = await sql<{ is_founder: boolean }>`select is_founder from profiles where user_id = ${target}`;
      const votes = await sql<{ n: number }>`
        select count(distinct reporter_id)::int as n from reports where post_id = ${data.postId} and reason = ${data.reason}`;
      if (!owner[0]?.is_founder && (votes[0]?.n ?? 0) >= 3 && (data.reason === "nsfw" || data.reason === "copyright")) {
        await sql`update posts set held = true where id = ${data.postId}`;
      }
      const founders = await sql<{ user_id: string }>`select user_id from profiles where is_founder = true`;
      for (const founder of founders) await notify(sql, founder.user_id, "report_queue", context.userId, data.postId);
    }
    await sql`insert into notifications (id, user_id, kind, from_id, post_id) values (${nid()}, ${context.userId}, 'report_received', '', ${data.postId})`;
    return { ok: true };
  });

export const search = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((q: string) => clean(q, 60).toLowerCase())
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    if (!data || data === "follow" || data === "follower" || data === "followers" || data === "following") {
      if (!data) {
        const founder = await sql<{ username: string; display_name: string; avatar: string; verified: boolean; starred: boolean; is_founder: boolean }>`
          select username, display_name, avatar, verified, starred, is_founder from profiles where is_founder = true limit 1`;
        return { people: founder, topics: [], posts: [] };
      }
      return { people: [], topics: [], posts: [] };
    }
    const like = `%${data}%`;
    const people = await sql<{ username: string; display_name: string; avatar: string; verified: boolean; starred: boolean; is_founder: boolean }>`
      select username, display_name, avatar, verified, starred, is_founder
      from profiles
      where (username like ${like} or lower(display_name) like ${like})
        and banned_forever = false
        and not exists (
          select 1 from blocks b
          where (b.blocker_id = ${context.userId} and b.blocked_id = profiles.user_id)
             or (b.blocker_id = profiles.user_id and b.blocked_id = ${context.userId})
        )
      order by is_founder desc, verified desc, display_name
      limit 20`;
    const topics = await sql<{ topic: string; n: number }>`
      select topic, count(*)::int as n from posts
      where topic <> '' and lower(topic) like ${like}
      group by topic order by n desc limit 8`;
    const posts = await sql<{ id: string; title: string; username: string; views: number }>`
      select p.id, p.title, pr.username, p.views
      from posts p join profiles pr on pr.user_id = p.user_id
      where p.held = false and (
        lower(p.title) like ${like} or lower(p.body) like ${like} or lower(p.tags) like ${like} or lower(p.topic) like ${like}
      )
      order by
        (case when lower(p.tags) like ${like} or lower(p.title) like ${like} then 1 else 0 end) desc,
        p.views desc
      limit 12`;
    const founder = await sql<{ username: string; display_name: string; avatar: string; verified: boolean; starred: boolean; is_founder: boolean }>`
      select username, display_name, avatar, verified, starred, is_founder from profiles where is_founder = true limit 1`;
    const pinned = founder[0] && !people.some((p) => p.username === founder[0].username) ? [founder[0], ...people] : people;
    return {
      people: pinned,
      topics,
      posts,
    };
  });

export const trending = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await gate(context.userId);
    return sql<{ topic: string; n: number }>`
      select topic, count(*)::int as n from posts
      where topic <> '' and created_at > now() - interval '2 days'
      group by topic order by n desc limit 8`;
  });

export const notes = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await gate(context.userId);
    const rows = await sql<Record<string, unknown>>`
      select n.id, n.kind, n.post_id, n.read, n.created_at::text as created_at,
        pr.username, pr.display_name, pr.avatar,
        coalesce(g.title, j.title, '') as gig_title
      from notifications n
      left join profiles pr on pr.user_id = n.from_id
      left join gigs g on g.id = n.post_id
      left join job_posts j on j.id = n.post_id
      where n.user_id = ${context.userId}
      order by n.created_at desc
      limit 60`;
    const dm = await sql<{ n: number }>`select count(*)::int as n from messages where to_id = ${context.userId} and read = false`;
    const privateKind = new Set(["gig_inquiry", "gig_message", "gig_order", "gig_reply", "job_inquiry", "job_reply"]);
    const visible = rows.filter((r) => !String(r.kind).startsWith("follow"));
    const unread = visible.filter((r) => !r.read && String(r.kind) !== "message").length + (dm[0]?.n ?? 0);
    const inquiryUnread = visible.filter((r) => !r.read && privateKind.has(String(r.kind))).length;
    return {
      unread,
      inquiryUnread,
      items: visible.map((r) => {
        const kind = String(r.kind);
        const hidden = privateKind.has(kind);
        return {
          id: String(r.id),
          kind,
          postId: String(r.post_id ?? ""),
          read: Boolean(r.read),
          createdAt: String(r.created_at),
          username: hidden ? "" : String(r.username ?? ""),
          displayName: hidden ? "" : String(r.display_name ?? ""),
          avatar: hidden ? "" : String(r.avatar ?? ""),
          title: maskContact(String(r.gig_title ?? "")),
        };
      }),
    };
  });

export const readNotes = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await gate(context.userId);
    await sql`update notifications set read = true where user_id = ${context.userId}`;
    return { ok: true };
  });

export const markNotes = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((kinds: string) => clean(kinds, 240))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const list = data.split(",").map((k) => k.trim()).filter((k) => /^[a-z0-9_]{2,32}$/.test(k));
    for (const kind of list) {
      await sql`update notifications set read = true where user_id = ${context.userId} and kind = ${kind}`;
    }
    return { ok: true };
  });

export const requests = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    return [] as { user_id: string; username: string; display_name: string; avatar: string }[];
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { username: string; body: string; image?: string }) => ({
    username: clean(input.username, 32).toLowerCase(),
    body: clean(input.body, 500),
    image: clean(input.image, 400_000),
  }))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const image = data.image.startsWith("data:image/") ? data.image : "";
    const body = image || data.body;
    if (!body) throw new Error("EMPTY");
    if (data.body && chatLeak(data.body)) {
      await sql`insert into spam_logs (id, user_id, kind, body) values (${nid()}, ${context.userId}, ${"dm"}, ${maskContact(data.body).slice(0, 180)})`;
      throw new Error("CHAT_LEAK");
    }
    const who = await sql<{ user_id: string; dm_policy: string }>`select user_id, dm_policy from profiles where username = ${data.username}`;
    if (!who[0]) throw new Error("MISSING");
    const blocked = await sql`select 1 from blocks where (blocker_id = ${context.userId} and blocked_id = ${who[0].user_id}) or (blocker_id = ${who[0].user_id} and blocked_id = ${context.userId})`;
    if (blocked.length) throw new Error("BLOCKED_DEAL");
    if (who[0].dm_policy === "off") throw new Error("CLOSED");
    const replied = await sql`select id from messages where from_id = ${who[0].user_id} and to_id = ${context.userId} limit 1`;
    if (!replied.length) {
      if (image) throw new Error("CLOSED");
      const sent = await sql<{ n: number }>`select count(*)::int as n from messages where from_id = ${context.userId} and to_id = ${who[0].user_id}`;
      if ((sent[0]?.n ?? 0) >= 3) throw new Error("CLOSED");
    }
    await sql`insert into messages (id, from_id, to_id, body) values (${nid()}, ${context.userId}, ${who[0].user_id}, ${body})`;
    await notify(sql, who[0].user_id, "message", context.userId);
    return { ok: true };
  });

export const thread = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((username: string) => clean(username, 32).toLowerCase())
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const who = await sql<{ user_id: string; read_receipts: boolean }>`select user_id, read_receipts from profiles where username = ${data}`;
    if (!who[0]) return [];
    const blocked = await sql`select 1 from blocks where (blocker_id = ${context.userId} and blocked_id = ${who[0].user_id}) or (blocker_id = ${who[0].user_id} and blocked_id = ${context.userId}) limit 1`;
    if (blocked.length) return [];
    if (who[0].read_receipts) {
      await sql`update messages set read = true where from_id = ${who[0].user_id} and to_id = ${context.userId}`;
    }
    const rows = await sql<{ id: string; from_id: string; body: string; created_at: string; read: boolean }>`
      select id, from_id, body, created_at::text as created_at, read from messages
      where (from_id = ${context.userId} and to_id = ${who[0].user_id})
         or (from_id = ${who[0].user_id} and to_id = ${context.userId})
      order by created_at asc
      limit 200`;
    return rows.map((r) => ({ ...r, mine: r.from_id === context.userId }));
  });

export const inbox = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await gate(context.userId);
    const me = context.userId;
    const rows = await sql<Record<string, unknown>>`
      select distinct on (peer) peer, body, created_at::text as created_at, from_id, read, username, display_name, avatar
      from (
        select case when from_id = ${me} then to_id else from_id end as peer,
          body, created_at, from_id, read
        from messages
        where from_id = ${me} or to_id = ${me}
      ) m
      join profiles pr on pr.user_id = m.peer
      where not exists (
        select 1 from blocks b
        where (b.blocker_id = ${me} and b.blocked_id = m.peer) or (b.blocker_id = m.peer and b.blocked_id = ${me})
      )
      order by peer, created_at desc`;
    const unread = await sql<{ from_id: string; n: number }>`
      select from_id, count(*)::int as n from messages where to_id = ${me} and read = false group by from_id`;
    const accepted = await sql<{ peer_id: string }>`select peer_id from dm_accepts where user_id = ${me}`;
    const firsts = await sql<{ peer: string; from_id: string }>`
      select distinct on (peer) peer, from_id
      from (
        select case when from_id = ${me} then to_id else from_id end as peer, from_id, created_at
        from messages
        where from_id = ${me} or to_id = ${me}
      ) t
      order by peer, created_at asc`;
    const unreadMap = new Map(unread.map((r) => [r.from_id, r.n]));
    const followSet = new Set<string>();
    const acceptSet = new Set(accepted.map((r) => r.peer_id));
    const firstMap = new Map(firsts.map((r) => [r.peer, r.from_id]));
    return rows.map((r) => {
      const peer = String(r.peer);
      const started = firstMap.get(peer) === peer;
      const request = started && !followSet.has(peer) && !acceptSet.has(peer);
      const mine = String(r.from_id) === me;
      return {
        username: String(r.username),
        displayName: String(r.display_name),
        avatar: String(r.avatar ?? ""),
        body: String(r.body),
        createdAt: String(r.created_at),
        mine,
        seen: mine && Boolean(r.read),
        unread: unreadMap.get(peer) ?? 0,
        folder: request ? "request" as const : "main" as const,
      };
    }).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  });

export const chatMeta = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((username: string) => clean(username, 32).toLowerCase())
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const who = await sql<{ user_id: string }>`select user_id from profiles where username = ${data}`;
    if (!who[0]) return { request: false };
    const peer = who[0].user_id;
    const accepted = await sql`select 1 from dm_accepts where user_id = ${context.userId} and peer_id = ${peer}`;
    const first = await sql<{ from_id: string }>`
      select from_id from messages
      where (from_id = ${context.userId} and to_id = ${peer}) or (from_id = ${peer} and to_id = ${context.userId})
      order by created_at asc limit 1`;
    const request = Boolean(first[0] && first[0].from_id === peer && !accepted.length);
    return { request };
  });

export const acceptDm = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((username: string) => clean(username, 32).toLowerCase())
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const who = await sql<{ user_id: string }>`select user_id from profiles where username = ${data}`;
    if (!who[0]) throw new Error("MISSING");
    await sql`insert into dm_accepts (user_id, peer_id) values (${context.userId}, ${who[0].user_id}) on conflict do nothing`;
    return { ok: true };
  });

export const declineDm = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((username: string) => clean(username, 32).toLowerCase())
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const who = await sql<{ user_id: string }>`select user_id from profiles where username = ${data}`;
    if (!who[0]) return { ok: true };
    const peer = who[0].user_id;
    const accepted = await sql`select 1 from dm_accepts where user_id = ${context.userId} and peer_id = ${peer}`;
    const first = await sql<{ from_id: string }>`
      select from_id from messages
      where (from_id = ${context.userId} and to_id = ${peer}) or (from_id = ${peer} and to_id = ${context.userId})
      order by created_at asc limit 1`;
    const request = Boolean(first[0] && first[0].from_id === peer && !accepted.length);
    if (!request) return { ok: true };
    await sql`delete from messages where (from_id = ${context.userId} and to_id = ${peer}) or (from_id = ${peer} and to_id = ${context.userId})`;
    await sql`delete from dm_accepts where user_id = ${context.userId} and peer_id = ${peer}`;
    return { ok: true };
  });

export const addStory = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { body?: string; media?: string; closeOnly?: boolean }) => ({
    body: clean(input.body, 140),
    media: clean(input.media, 700_000),
    closeOnly: Boolean(input.closeOnly),
  }))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const media = data.media ? okData(data.media, 700_000) : "";
    if (!media && !data.body) throw new Error("EMPTY");
    await sql`insert into stories (id, user_id, media, body, close_only) values (${nid()}, ${context.userId}, ${media}, ${data.body}, ${data.closeOnly})`;
    return { ok: true };
  });

export const storyTray = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await gate(context.userId);
    const rows = await sql<{ username: string; display_name: string; avatar: string; n: number }>`
      select pr.username, pr.display_name, pr.avatar, count(*)::int as n
      from stories s join profiles pr on pr.user_id = s.user_id
      where (s.created_at > now() - interval '24 hours' or s.highlight = true)
        and (
          s.user_id = ${context.userId}
          or (
            s.close_only = false
            or exists (select 1 from close_friends c where c.user_id = s.user_id and c.friend_id = ${context.userId})
          )
        )
        and (
          pr.is_private = false or s.user_id = ${context.userId}
        )
        and not exists (
          select 1 from blocks b
          where (b.blocker_id = ${context.userId} and b.blocked_id = s.user_id)
             or (b.blocker_id = s.user_id and b.blocked_id = ${context.userId})
        )
      group by pr.username, pr.display_name, pr.avatar
      order by max(s.created_at) desc
      limit 30`;
    return rows;
  });

export const openStories = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((username: string) => clean(username, 32).toLowerCase())
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const who = await sql<{ user_id: string }>`select user_id from profiles where username = ${data}`;
    if (!who[0]) return [];
    const rows = await sql<{ id: string; media: string; body: string; highlight: boolean; created_at: string }>`
      select id, media, body, highlight, created_at::text as created_at from stories
      where user_id = ${who[0].user_id}
        and (created_at > now() - interval '24 hours' or highlight = true)
        and (
          user_id = ${context.userId}
          or close_only = false
          or exists (select 1 from close_friends c where c.user_id = ${who[0].user_id} and c.friend_id = ${context.userId})
        )
      order by created_at asc`;
    for (const s of rows) {
      if (who[0].user_id !== context.userId) {
        await sql`insert into story_views (story_id, user_id) values (${s.id}, ${context.userId}) on conflict do nothing`;
      }
    }
    return rows;
  });

export const highlightStory = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => clean(id, 80))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    await sql`update stories set highlight = true where id = ${data} and user_id = ${context.userId}`;
    return { ok: true };
  });

export const storyViewers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => clean(id, 80))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    return sql<{ username: string; display_name: string; avatar: string }>`
      select pr.username, pr.display_name, pr.avatar
      from story_views v
      join stories s on s.id = v.story_id
      join profiles pr on pr.user_id = v.user_id
      where v.story_id = ${data} and s.user_id = ${context.userId}`;
  });

export const insights = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await gate(context.userId);
    const row = await sql<{ views: number; likes: number; comments: number }>`
      select
        coalesce(sum(p.views),0)::int as views,
        (select count(*)::int from likes l join posts p2 on p2.id = l.post_id where p2.user_id = ${context.userId} and l.created_at > now() - interval '7 days') as likes,
        (select count(*)::int from comments c join posts p3 on p3.id = c.post_id where p3.user_id = ${context.userId} and c.created_at > now() - interval '7 days') as comments
      from posts p
      where p.user_id = ${context.userId} and p.created_at > now() - interval '7 days'`;
    return row[0] ?? { views: 0, likes: 0, comments: 0 };
  });

export const applyVerify = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((note: string) => clean(note, 400))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const bar = await qualified30(sql, context.userId);
    const me = await sql<{ verified: boolean }>`select verified from profiles where user_id = ${context.userId}`;
    if (me[0]?.verified) return { ok: true };
    if (bar.views < 100000 || bar.followers < 6000) throw new Error("NOT_YET");
    await sql`
      insert into verify_requests (user_id, note, status) values (${context.userId}, ${data}, 'open')
      on conflict (user_id) do update set note = ${data}, status = 'open', created_at = now()`;
    const admins = await sql<{ user_id: string }>`select user_id from profiles where is_admin = true`;
    for (const a of admins) await notify(sql, a.user_id, "verify_apply", context.userId);
    return { ok: true };
  });

export const applyStar = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((note: string) => clean(note, 400))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const bar = await qualified30(sql, context.userId);
    const me = await sql<{ starred: boolean }>`select starred from profiles where user_id = ${context.userId}`;
    if (me[0]?.starred) return { ok: true };
    if (bar.views < 100000 || bar.followers < 6000) throw new Error("NOT_YET");
    await sql`
      insert into star_requests (user_id, note, status) values (${context.userId}, ${data}, 'open')
      on conflict (user_id) do update set note = ${data}, status = 'open', created_at = now()`;
    const admins = await sql<{ user_id: string }>`select user_id from profiles where is_admin = true`;
    for (const a of admins) await notify(sql, a.user_id, "star_apply", context.userId);
    return { ok: true };
  });

async function adminOnly(sql: Sql, userId: string) {
  const me = await sql<{ is_admin: boolean }>`select is_admin from profiles where user_id = ${userId}`;
  if (!me[0]?.is_admin) throw new Error("FORBIDDEN");
}

export const adminDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await gate(context.userId);
    await adminOnly(sql, context.userId);
    const reports = await sql<{
      id: string;
      reason: string;
      note: string;
      post_id: string;
      status: string;
      created_at: string;
      reporter: string;
      target: string | null;
    }>`
      select r.id, r.reason, r.note, r.post_id, r.status, r.created_at::text as created_at,
        pr.username as reporter, tg.username as target
      from reports r
      join profiles pr on pr.user_id = r.reporter_id
      left join profiles tg on tg.user_id = r.target_user_id
      where r.status = 'open'
      order by r.created_at desc limit 40`;
    const verifies = await sql<{
      user_id: string;
      note: string;
      created_at: string;
      username: string;
      display_name: string;
      followers: number;
      views: number;
    }>`
      select v.user_id, v.note, v.created_at::text as created_at, pr.username, pr.display_name,
        0 as followers,
        (select coalesce(sum(views),0)::int from posts p where p.user_id = v.user_id) as views
      from verify_requests v join profiles pr on pr.user_id = v.user_id
      where v.status = 'open'`;
    const stars = await sql<{
      user_id: string;
      note: string;
      username: string;
      views: number;
    }>`
      select s.user_id, s.note, pr.username,
        (select coalesce(sum(views),0)::int from posts p where p.user_id = s.user_id) as views
      from star_requests s join profiles pr on pr.user_id = s.user_id
      where s.status = 'open'`;
    const banned = await sql<{ word: string }>`select word from banned_words order by word`;
    const held = await sql<{ id: string; title: string; username: string }>`
      select p.id, p.title, pr.username
      from posts p join profiles pr on pr.user_id = p.user_id
      where p.held = true
      order by p.created_at desc limit 40`;
    const tickets = await sql<{ id: string; subject: string; body: string; username: string; user_id: string; device: string; created_at: string }>`
      select t.id, t.subject, t.body, t.user_id, t.device, t.created_at::text as created_at, pr.username
      from tickets t join profiles pr on pr.user_id = t.user_id
      where t.status = 'open'
      order by t.created_at desc limit 40`;
    const videoRow = await sql.query<{ views: number; coins: number }>(
      `select
         (select count(*)::int from view_events e
          join posts p on p.id = e.post_id
          where e.created_at > now() - interval '30 days' and ${clipRule()}) as views,
         (select coalesce(sum(coins), 0)::int from wallets) as coins`,
    );
    const gigRow = await sql<{ gigs: number; views: number; likes: number }>`
      select count(*)::int as gigs, coalesce(sum(views), 0)::int as views, coalesce(sum(likes), 0)::int as likes from gigs`;
    return {
      reports: reports.map((r) => ({ ...r, target: r.target ?? "" })),
      verifies,
      stars,
      words: banned,
      held,
      tickets,
      videoEarnings: {
        qualifiedViews: videoRow[0]?.views ?? 0,
        coins: videoRow[0]?.coins ?? 0,
        usd: (videoRow[0]?.coins ?? 0) / 100,
      },
      gigPromo: {
        gigs: gigRow[0]?.gigs ?? 0,
        views: gigRow[0]?.views ?? 0,
        likes: gigRow[0]?.likes ?? 0,
      },
    };
  });

export const adminAct = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { kind: string; id?: string; username?: string; days?: number; word?: string; note?: string }) => ({
    kind: clean(input.kind, 40),
    id: clean(input.id, 80),
    username: clean(input.username, 32).toLowerCase(),
    days: Math.min(200000, Math.max(0, Number(input.days) || 0)),
    word: clean(input.word, 40).toLowerCase(),
    note: clean(input.note, 800),
  }))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    await adminOnly(sql, context.userId);
    if (data.kind === "reply_ticket" && data.id && data.note) {
      const row = await sql<{ user_id: string }>`select user_id from tickets where id = ${data.id}`;
      await sql`update tickets set status = 'answered', reply = ${data.note} where id = ${data.id}`;
      if (row[0]) await notify(sql, row[0].user_id, "ticket_reply", "", data.id);
    }
    if (data.kind === "dismiss") {
      await sql`update reports set status = 'closed' where id = ${data.id}`;
    }
    if (data.kind === "remove_post") {
      const post = await sql<{ user_id: string; title: string; copyrighted: boolean }>`select user_id, title, copyrighted from posts where id = ${data.id}`;
      if (post[0]) {
        await sql`
          insert into removed_posts (id, post_id, user_id, title, copyrighted)
          values (${nid()}, ${data.id}, ${post[0].user_id}, ${post[0].title}, ${post[0].copyrighted})`;
        await notify(sql, post[0].user_id, "takedown", "", data.id);
      }
      await sql`delete from posts where id = ${data.id}`;
      await sql`update reports set status = 'closed' where post_id = ${data.id}`;
      await sql`delete from removed_posts where removed_at < now() - interval '30 days'`;
    }
    if (data.kind === "ban" || data.kind === "ban_forever" || data.kind === "unban" || data.kind === "verify" || data.kind === "unverify" || data.kind === "star" || data.kind === "unstars") {
      const who = await sql<{ user_id: string }>`select user_id from profiles where username = ${data.username}`;
      if (!who[0] || who[0].user_id === context.userId) throw new Error("FORBIDDEN");
      if (data.kind === "ban") {
        const days = Math.min(30, data.days || 7);
        await sql`update profiles set banned_until = now() + (${days} * interval '1 day'), banned_forever = false where user_id = ${who[0].user_id}`;
      }
      if (data.kind === "ban_forever") {
        await sql`update profiles set banned_forever = true where user_id = ${who[0].user_id}`;
        const marks = await sql<{ fp: string; ip_hash: string }>`select fp, ip_hash from device_marks where user_id = ${who[0].user_id}`;
        for (const mark of marks) {
          if (!mark.fp) continue;
          await sql`insert into hard_bans (fp, ip_hash, note) values (${mark.fp}, ${mark.ip_hash}, ${data.username}) on conflict (fp) do nothing`;
        }
      }
      if (data.kind === "unban") {
        const marks = await sql<{ fp: string }>`select fp from device_marks where user_id = ${who[0].user_id}`;
        for (const mark of marks) {
          if (mark.fp) await sql`delete from hard_bans where fp = ${mark.fp}`;
        }
        await sql`update profiles set banned_forever = false, banned_until = null, payout_locked = false, payout_strikes = 0 where user_id = ${who[0].user_id}`;
      }
      if (data.kind === "verify") {
        await sql`update profiles set verified = true where user_id = ${who[0].user_id}`;
        await sql`update verify_requests set status = 'yes' where user_id = ${who[0].user_id}`;
        await notify(sql, who[0].user_id, "verify_yes", context.userId);
      }
      if (data.kind === "unverify") {
        await sql`update profiles set verified = false where user_id = ${who[0].user_id}`;
        await notify(sql, who[0].user_id, "verify_no", context.userId);
      }
      if (data.kind === "star") {
        await sql`update profiles set starred = true where user_id = ${who[0].user_id}`;
        await sql`update star_requests set status = 'yes' where user_id = ${who[0].user_id}`;
        await notify(sql, who[0].user_id, "star_yes", context.userId);
      }
      if (data.kind === "unstars") {
        await sql`update profiles set starred = false where user_id = ${who[0].user_id}`;
        await notify(sql, who[0].user_id, "star_no", context.userId);
      }
    }
    if (data.kind === "reject_verify") {
      const who = await sql<{ user_id: string }>`select user_id from profiles where username = ${data.username}`;
      if (who[0]) {
        await sql`update verify_requests set status = 'no' where user_id = ${who[0].user_id}`;
        await notify(sql, who[0].user_id, "verify_no", context.userId);
      }
    }
    if (data.kind === "reject_star") {
      const who = await sql<{ user_id: string }>`select user_id from profiles where username = ${data.username}`;
      if (who[0]) {
        await sql`update star_requests set status = 'no' where user_id = ${who[0].user_id}`;
        await notify(sql, who[0].user_id, "star_no", context.userId);
      }
    }
    if (data.kind === "clear_mark" && data.id) {
      await sql`update posts set copyrighted = false where id = ${data.id}`;
    }
    if (data.kind === "reset_strikes" && data.username) {
      const who = await sql<{ user_id: string; is_founder: boolean }>`select user_id, is_founder from profiles where username = ${data.username}`;
      if (!who[0] || who[0].is_founder) throw new Error("FORBIDDEN");
      await sql`update profiles set strikes = 0 where user_id = ${who[0].user_id}`;
    }
    if (data.kind === "add_word" && data.word) {
      await sql`insert into banned_words (word) values (${data.word}) on conflict do nothing`;
    }
    if (data.kind === "del_word" && data.word) {
      await sql`delete from banned_words where word = ${data.word}`;
    }
    if (data.kind === "release_post" && data.id) {
      await sql`update posts set held = false where id = ${data.id}`;
      await sql`update reports set status = 'closed' where post_id = ${data.id}`;
    }
    if (data.kind === "credit" && data.username && data.days > 0) {
      const who = await sql<{ user_id: string }>`select user_id from profiles where username = ${data.username}`;
      if (who[0]) {
        await sql`insert into wallets (user_id, coins) values (${who[0].user_id}, 0) on conflict (user_id) do nothing`;
        await sql`update wallets set coins = coins + ${data.days} where user_id = ${who[0].user_id}`;
      }
    }
    return { ok: true };
  });

export const sendGift = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { postId: string; kind: string }) => ({
    postId: clean(input.postId, 80),
    kind: clean(input.kind, 20),
  }))
  .handler(async ({ context, data }) => {
    const gift = giftById(data.kind);
    if (!gift) throw new Error("BAD_KIND");
    const cost = gift.coins;
    const sql = await gate(context.userId);
    const post = await sql<{ user_id: string; kind: string }>`select user_id, kind from posts where id = ${data.postId}`;
    if (!post[0] || post[0].user_id === context.userId || post[0].kind !== "live") throw new Error("FORBIDDEN");
    const { followers } = await totals(sql, post[0].user_id);
    const host = await sql<{ is_founder: boolean }>`select is_founder from profiles where user_id = ${post[0].user_id}`;
    if (!host[0]?.is_founder && followers < 6000) throw new Error("LIVE_LOCK");
    await sql`insert into wallets (user_id, coins) values (${context.userId}, 0) on conflict (user_id) do nothing`;
    await sql`insert into wallets (user_id, coins) values (${post[0].user_id}, 0) on conflict (user_id) do nothing`;
    const mine = await sql<{ coins: number }>`select coins from wallets where user_id = ${context.userId}`;
    if ((mine[0]?.coins ?? 0) < cost) throw new Error("POOR");
    await sql`update wallets set coins = coins - ${cost} where user_id = ${context.userId}`;
    await sql`update wallets set coins = coins + ${cost} where user_id = ${post[0].user_id}`;
    await sql`insert into gifts (id, from_id, to_id, post_id, kind) values (${nid()}, ${context.userId}, ${post[0].user_id}, ${data.postId}, ${data.kind})`;
    await notify(sql, post[0].user_id, "gift", context.userId, data.postId);
    return { ok: true, tier: gift.tier };
  });

export const startLive = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await gate(context.userId);
    const me = await sql<{ is_founder: boolean; monetized: boolean }>`select is_founder, monetized from profiles where user_id = ${context.userId}`;
    const { followers } = await totals(sql, context.userId);
    const openLive = Boolean(me[0]?.is_founder || (me[0]?.monetized && followers >= 6000));
    if (!openLive) throw new Error("LIVE_LOCK");
    const existing = await sql<{ id: string }>`
      select id from posts where user_id = ${context.userId} and kind = 'live' and created_at > now() - interval '3 hours' order by created_at desc limit 1`;
    if (existing[0]) return { id: existing[0].id };
    const id = nid();
    await sql`insert into posts (id, user_id, kind, title, body) values (${id}, ${context.userId}, ${"live"}, ${"Live"}, ${""})`;
    return { id };
  });

export const tapLive = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => clean(id, 80))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const post = await sql`select id from posts where id = ${data} and kind = 'live'`;
    if (!post.length) throw new Error("FORBIDDEN");
    const row = await sql<{ n: number }>`select n from live_taps where post_id = ${data} and user_id = ${context.userId}`;
    if ((row[0]?.n ?? 0) >= 150) return { n: 150, capped: true };
    await sql`
      insert into live_taps (post_id, user_id, n) values (${data}, ${context.userId}, 1)
      on conflict (post_id, user_id) do update set n = least(150, live_taps.n + 1)`;
    const next = await sql<{ n: number }>`select n from live_taps where post_id = ${data} and user_id = ${context.userId}`;
    const n = next[0]?.n ?? 1;
    return { n, capped: n >= 150 };
  });

export const studio = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await gate(context.userId);
    const earned = await calculateEarnings(sql, context.userId);
    const { followers } = await totals(sql, context.userId);
    const me = await sql<{ country: string; is_founder: boolean; monetized: boolean }>`select country, is_founder, monetized from profiles where user_id = ${context.userId}`;
    const country = me[0]?.country ?? "";
    const countries = await sql<{ country: string; n: number }>`
      select coalesce(nullif(pr.country, ''), 'Unknown') as country, count(*)::int as n
      from view_events e
      join posts p on p.id = e.post_id
      join profiles pr on pr.user_id = e.user_id
      where p.user_id = ${context.userId} and p.kind = 'video' and e.seconds >= case when p.ratio = '16:9' then 12 else 5 end and e.created_at > now() - interval '30 days'
      group by 1 order by n desc limit 6`;
    const sources = await sql<{ source: string; n: number }>`
      select source, count(*)::int as n
      from view_events e join posts p on p.id = e.post_id
      where p.user_id = ${context.userId} and p.kind = 'video' and e.seconds >= case when p.ratio = '16:9' then 12 else 5 end and e.created_at > now() - interval '30 days'
      group by source`;
    const likes30 = await sql<{ n: number }>`
      select count(*)::int as n from likes l
      join posts p on p.id = l.post_id
      where p.user_id = ${context.userId} and l.created_at > now() - interval '30 days'`;
    const follows30 = [{ n: 0 }];
    const watched = await sql<{ seconds: number }>`
      select coalesce(sum(e.seconds), 0)::int as seconds
      from view_events e join posts p on p.id = e.post_id
      where p.user_id = ${context.userId} and p.kind = 'video' and p.ratio = '16:9' and e.event_type = 'video_watch' and e.seconds >= 12`;
    const wallet = await sql<{ coins: number; estimate_usd: string }>`select coins, estimate_usd::text as estimate_usd from wallets where user_id = ${context.userId}`;
    const founder = Boolean(me[0]?.is_founder);
    const band = regionOf(country);
    const views30 = earned.qualifiedViews;
    const paused = await sql`
      select country from geo_blocks
      where country = ${country} and (forever = true or (until is not null and until > now()))
      limit 1`;
    const pending = await sql`select id from payouts where user_id = ${context.userId} and method = 'review' and status = 'open' limit 1`;
    const monetized = founder || Boolean(me[0]?.monetized);
    const ready = followers >= 6000 && views30 >= 100000;
    return {
      followers,
      views30,
      followerGoal: 6000,
      viewGoal: 100000,
      coins: earned.coins,
      country,
      sources,
      countries,
      giftsOpen: founder || followers >= 6000,
      cashOpen: founder || (monetized && band === "full" && paused.length === 0),
      showMoney: monetized,
      monetized,
      ready,
      pending: pending.length > 0,
      liveOpen: founder || followers >= 6000,
      likes30: likes30[0]?.n ?? 0,
      follows30: follows30[0]?.n ?? 0,
      watchHours: (watched[0]?.seconds ?? 0) / 3600,
      founderEstimate: founder ? Number(wallet[0]?.estimate_usd ?? 0) : 0,
      countryPaused: !founder && paused.length > 0,
      partial: !founder && band !== "full",
    };
  });

export const applyMonetization = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { note?: string }) => ({ note: clean(input?.note, 400) }))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const me = await sql<{ is_founder: boolean; monetized: boolean }>`select is_founder, monetized from profiles where user_id = ${context.userId}`;
    if (me[0]?.is_founder || me[0]?.monetized) return { ok: true };
    const bar = await qualified30(sql, context.userId);
    if (bar.followers < 6000 || bar.views < 100000) throw new Error("MIN");
    const open = await sql`select id from payouts where user_id = ${context.userId} and method = 'review' and status = 'open' limit 1`;
    if (open.length) throw new Error("ONE_TICKET");
    if (secretNote(data.note)) throw new Error("WORD");
    const detail = `followers ${bar.followers}, qualified views ${bar.views}, user ${context.userId}. ${data.note}`.slice(0, 500);
    await sql`insert into payouts (id, user_id, method, amount_usd, detail) values (${nid()}, ${context.userId}, 'review', 0, ${detail})`;
    const admins = await sql<{ user_id: string }>`select user_id from profiles where is_founder = true or is_admin = true`;
    for (const admin of admins) await notify(sql, admin.user_id, "pay_apply", context.userId);
    return { ok: true };
  });

export const myHandle = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await gate(context.userId);
    const row = await sql<{ username: string; welcomed: boolean; is_founder: boolean }>`
      select username, welcomed, is_founder from profiles where user_id = ${context.userId}`;
    return { username: row[0]?.username ?? "", welcomed: Boolean(row[0]?.welcomed), founder: Boolean(row[0]?.is_founder) };
  });

export const openTicket = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { subject: string; body: string; device?: string }) => ({
    subject: clean(input.subject, 80),
    body: clean(input.body, 800),
    device: clean(input.device, 180),
  }))
  .handler(async ({ context, data }) => {
    if (!data.subject || !data.body) throw new Error("EMPTY");
    const sql = await gate(context.userId);
    if (secretNote(data.body) || secretNote(data.subject)) throw new Error("WORD");
    const open = await sql`select id from tickets where user_id = ${context.userId} and status = 'open' limit 1`;
    if (open.length) throw new Error("ONE_TICKET");
    await pace(sql, context.userId, "ticket");
    await sql`insert into tickets (id, user_id, subject, body, device) values (${nid()}, ${context.userId}, ${data.subject}, ${data.body}, ${data.device})`;
    const admins = await sql<{ user_id: string }>`select user_id from profiles where is_admin = true or is_founder = true`;
    for (const a of admins) await notify(sql, a.user_id, "ticket", context.userId);
    return { ok: true };
  });

export const myTicket = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await gate(context.userId);
    const row = await sql<{ status: string; reply: string }>`
      select status, reply from tickets where user_id = ${context.userId} order by created_at desc limit 1`;
    return { locked: row[0]?.status === "open", reply: row[0]?.status === "answered" ? row[0].reply : "" };
  });

async function sweepGeo(sql: Sql) {
  const gone = await sql<{ name: string }>`
    delete from geo_blocks
    where forever = false and until is not null and until <= now()
    returning coalesce(nullif(name, ''), country) as name`;
  for (const row of gone) {
    await sql`insert into geo_log (id, body) values (${nid()}, ${`${row.name} auto-unbanned after expiry`})`;
  }
}

function requestCountry() {
  try {
    const headers = getRequest().headers;
    const code = (headers.get("x-vercel-ip-country") || headers.get("cf-ipcountry") || "").toUpperCase();
    return /^[A-Z]{2}$/.test(code) && code !== "XX" && code !== "T1" ? code : "";
  } catch {
    return "";
  }
}

async function activeGeo(sql: Sql, code: string) {
  if (!/^[A-Z]{2}$/.test(code)) return null;
  const block = await sql<{ name: string; flag: string; country: string }>`
    select coalesce(nullif(name, ''), '') as name, coalesce(flag, '') as flag, country
    from geo_blocks
    where country = ${code} and (forever = true or (until is not null and until > now()))
    limit 1`;
  return block[0] ?? null;
}

async function founderOnly(sql: Sql, userId: string) {
  const row = await sql<{ is_founder: boolean }>`select is_founder from profiles where user_id = ${userId}`;
  if (!row[0]?.is_founder) throw new Error("FORBIDDEN");
}

export const founderOffer = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await gate(context.userId);
    const me = await sql<{ welcomed: boolean; is_founder: boolean }>`
      select welcomed, is_founder from profiles where user_id = ${context.userId}`;
    if (!me[0] || me[0].is_founder || me[0].welcomed) return null;
    return null;
  });

export const markWelcome = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await gate(context.userId);
    await sql`update profiles set welcomed = true where user_id = ${context.userId}`;
    return { ok: true };
  });

export const siteStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await gate(context.userId);
    await sweepGeo(sql);
    const me = await sql<{ country: string; is_founder: boolean }>`select country, is_founder from profiles where user_id = ${context.userId}`;
    if (me[0]?.is_founder) return { ok: true, message: "", name: "", flag: "", country: "" };
    const codes = [(me[0]?.country ?? "").toUpperCase(), requestCountry()].filter((code, index, all) => /^[A-Z]{2}$/.test(code) && all.indexOf(code) === index);
    for (const code of codes) {
      const block = await activeGeo(sql, code);
      if (!block) continue;
      const known = countryByCode(block.country);
      const name = block.name || known?.name || block.country;
      return { ok: false, message: banCopy(name), name, flag: block.flag || known?.flag || "", country: block.country };
    }
    return { ok: true, message: "", name: "", flag: "", country: "" };
  });

export const geoGate = createServerFn({ method: "GET" })
  .handler(async () => {
    const sql = await getSql();
    await sweepGeo(sql);
    const block = await activeGeo(sql, requestCountry());
    if (!block) return { ok: true, message: "", name: "" };
    const name = block.name || countryByCode(block.country)?.name || block.country;
    return { ok: false, message: banCopy(name), name };
  });

export const accessCheck = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    return { vpn: false };
  });

export const setPostTalk = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; commentsOn: boolean; words: string }) => ({
    id: clean(input.id, 80),
    commentsOn: Boolean(input.commentsOn),
    words: clean(input.words, 200),
  }))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    await sql`update posts set comments_on = ${data.commentsOn}, comment_words = ${data.words} where id = ${data.id} and user_id = ${context.userId}`;
    return { ok: true };
  });

export const ownerDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await gate(context.userId);
    await founderOnly(sql, context.userId);
    await sweepGeo(sql);
    const rules = await sql<{ key: string; value: string }>`select key, value from app_rules`;
    const blocks = await sql<{ country: string; forever: boolean; message: string; name: string; flag: string; phone: string; continent: string; duration: string; banned_at: string | null; until: string | null }>`
      select country, forever, message,
        coalesce(name, '') as name,
        coalesce(flag, '') as flag,
        coalesce(phone, '') as phone,
        coalesce(continent, '') as continent,
        coalesce(duration, '') as duration,
        banned_at::text as banned_at,
        until::text as until
      from geo_blocks
      order by coalesce(nullif(name, ''), country)`;
    const geoNotes = await sql<{ body: string; at: string }>`select body, created_at::text as at from geo_log order by created_at desc limit 5`;
    const payouts = await sql<{ id: string; method: string; amount_usd: string; detail: string; username: string; ai: number; youtube: number; copies: number; strikes: number }>`
      select y.id, y.method, y.amount_usd::text as amount_usd, y.detail, pr.username, pr.strikes,
        (select count(*)::int from posts p where p.user_id = y.user_id and p.ai_made = true) as ai,
        (select count(*)::int from posts p where p.user_id = y.user_id and p.kind = 'youtube') as youtube,
        (select count(*)::int from posts p where p.user_id = y.user_id and p.copyrighted = true and p.created_at > now() - interval '30 days') as copies
      from payouts y join profiles pr on pr.user_id = y.user_id
      where y.status = 'open' order by y.created_at desc limit 20`;
    const removed = await sql<{ post_id: string; title: string; copyrighted: boolean; removed_at: string }>`
      select post_id, title, copyrighted, removed_at::text as removed_at
      from removed_posts
      where removed_at > now() - interval '30 days'
      order by removed_at desc
      limit 30`;
    const flagged = await sql<{ username: string; strikes: number }>`
      select username, strikes from profiles where review_flag = true and is_founder = false order by username limit 20`;
    return { rules, blocks, payouts, removed, flagged, launch: founderLaunch, geoNotes };
  });

export const ownerAct = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { kind: string; value?: string; country?: string; hours?: number; message?: string; id?: string; name?: string; flag?: string; phone?: string; continent?: string; duration?: string }) => ({
    kind: clean(input.kind, 20),
    value: clean(input.value, 40),
    country: clean(input.country, 2).toUpperCase(),
    hours: Math.min(2200, Math.max(0, Math.floor(Number(input.hours) || 0))),
    message: clean(input.message, 180),
    id: clean(input.id, 80),
    name: clean(input.name, 80),
    flag: clean(input.flag, 16),
    phone: clean(input.phone, 8),
    continent: clean(input.continent, 24),
    duration: clean(input.duration, 20),
  }))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    await founderOnly(sql, context.userId);
    if (data.kind === "cash_gate") {
      const value = data.value === "off" ? "off" : "on";
      await sql`insert into app_rules (key, value) values ('cash_open', ${value}) on conflict (key) do update set value = ${value}`;
    }
    if (data.kind === "pay_test") {
      const value = data.value === "on" ? "on" : "off";
      await sql`insert into app_rules (key, value) values ('pay_test', ${value}) on conflict (key) do update set value = ${value}`;
    }
    if (data.kind === "maintenance") {
      const value = data.value === "on" ? "on" : "off";
      await sql`insert into app_rules (key, value) values ('maintenance', ${value}) on conflict (key) do update set value = ${value}`;
    }
    if (data.kind === "upload") {
      const mb = String(Math.min(100, Math.max(5, Number(data.value) || 100)));
      await sql`insert into app_rules (key, value) values ('upload_mb', ${mb}) on conflict (key) do update set value = ${mb}`;
    }
    if (data.kind === "geo" && /^[A-Z]{2}$/.test(data.country)) {
      const forever = data.hours === 0;
      const place = data.name || countryByCode(data.country)?.name || data.country;
      const message = (data.message || banCopy(place)).slice(0, 180);
      await sql`
        insert into geo_blocks (country, until, forever, message, name, flag, phone, continent, banned_at, duration)
        values (
          ${data.country},
          case when ${forever} then null else now() + (${data.hours} * interval '1 hour') end,
          ${forever},
          ${message},
          ${data.name || place},
          ${data.flag || countryByCode(data.country)?.flag || ""},
          ${data.phone || countryByCode(data.country)?.phone || ""},
          ${data.continent || countryByCode(data.country)?.continent || ""},
          now(),
          ${data.duration || (forever ? "Permanent" : "")}
        )
        on conflict (country) do update set
          until = excluded.until,
          forever = excluded.forever,
          message = excluded.message,
          name = excluded.name,
          flag = excluded.flag,
          phone = excluded.phone,
          continent = excluded.continent,
          banned_at = excluded.banned_at,
          duration = excluded.duration`;
    }
    if (data.kind === "clear" && data.country) await sql`delete from geo_blocks where country = ${data.country}`;
    if (data.kind === "note" && data.message) {
      await sql`insert into broadcasts (id, user_id, body) values (${nid()}, ${context.userId}, ${data.message})`;
    }
    if (data.kind === "boost" && data.id) {
      await sql`update posts set boosted = not boosted where id = ${data.id}`;
    }
    if (data.kind === "pin" && data.id) {
      await sql`update posts set pinned = not pinned where id = ${data.id}`;
    }
    if (data.kind === "pay_yes" && data.id) {
      const row = await sql<{ user_id: string; method: string }>`select user_id, method from payouts where id = ${data.id}`;
      await sql`update payouts set status = 'yes' where id = ${data.id}`;
      if (row[0]) {
        if (row[0].method === "review") {
          await sql`update profiles set monetized = true, starred = true where user_id = ${row[0].user_id}`;
        }
        await notify(sql, row[0].user_id, "pay_yes", "", "");
      }
    }
    if (data.kind === "pay_no" && data.id) {
      const row = await sql<{ user_id: string }>`select user_id from payouts where id = ${data.id}`;
      await sql`update payouts set status = 'no' where id = ${data.id}`;
      if (row[0]) await notify(sql, row[0].user_id, "pay_no", "", "");
    }
    if (data.kind === "tick" && data.id) {
      await sql`update profiles set verified = not verified where lower(username) = ${data.id.toLowerCase()} and is_founder = false`;
    }
    if (data.kind === "money" && data.id) {
      await sql`update profiles set monetized = true, starred = true where lower(username) = ${data.id.toLowerCase()} and is_founder = false`;
    }
    if (data.kind === "year" && data.id) {
      const who = await sql<{ user_id: string }>`select user_id from profiles where lower(username) = ${data.id.toLowerCase()} and is_founder = false`;
      if (who[0]) {
        await sql`update profiles set banned_until = now() + interval '1 year' where user_id = ${who[0].user_id}`;
        const marks = await sql<{ fp: string; ip_hash: string }>`select fp, ip_hash from device_marks where user_id = ${who[0].user_id}`;
        for (const mark of marks) {
          if (mark.fp) await sql`insert into hard_bans (fp, ip_hash, note) values (${mark.fp}, ${mark.ip_hash}, ${data.id}) on conflict (fp) do nothing`;
        }
      }
    }
    if (data.kind === "purge" && data.id) {
      const who = await sql<{ user_id: string }>`select user_id from profiles where lower(username) = ${data.id.toLowerCase()} and is_founder = false`;
      if (who[0]) {
        await sql`update profiles set banned_forever = true, review_flag = false, bio = '' where user_id = ${who[0].user_id}`;
        await sql`update posts set held = true where user_id = ${who[0].user_id}`;
        const marks = await sql<{ fp: string; ip_hash: string }>`select fp, ip_hash from device_marks where user_id = ${who[0].user_id}`;
        for (const mark of marks) {
          if (mark.fp) await sql`insert into hard_bans (fp, ip_hash, note) values (${mark.fp}, ${mark.ip_hash}, ${data.id}) on conflict (fp) do nothing`;
        }
      }
    }
    if (data.kind === "restrict" && data.id) {
      const who = await sql<{ user_id: string }>`select user_id from profiles where lower(username) = ${data.id.toLowerCase()} and is_founder = false`;
      if (!who[0]) throw new Error("MISSING");
      const forever = data.hours === 0;
      if (forever) {
        await sql`update profiles set banned_forever = true, banned_until = null where user_id = ${who[0].user_id}`;
      } else {
        await sql`
          update profiles
          set banned_forever = false, banned_until = now() + (${data.hours} * interval '1 hour')
          where user_id = ${who[0].user_id}`;
      }
      const span = forever ? "permanently" : data.hours <= 24 ? "for 24 hours" : "for 7 days";
      const reason = data.message || "a community guideline violation";
      await postSystem(sql, {
        userId: who[0].user_id,
        kind: "banned",
        body: `Your account has been restricted ${span} for ${reason}. You can no longer post listings during this ban. Contact support@flare.app for external review. No in-app appeal is available.`,
        ref: `restrict:${who[0].user_id}:${nid()}`,
      });
      await notify(sql, who[0].user_id, "banned", context.userId, "");
    }
    if (data.kind === "strike" && data.id) {
      const post = await sql<{ user_id: string }>`select user_id from posts where id = ${data.id}`;
      await sql`update posts set copyrighted = true, held = true where id = ${data.id}`;
      if (post[0]) await strike(sql, post[0].user_id, "copyright");
    }
    if (data.kind === "clearstrike" && data.id) {
      const post = await sql<{ user_id: string }>`select user_id from posts where id = ${data.id}`;
      await sql`update posts set copyrighted = false, held = false where id = ${data.id}`;
      if (post[0]) await sql`update profiles set strikes = greatest(0, strikes - 1) where user_id = ${post[0].user_id} and is_founder = false`;
    }
    return { ok: true };
  });

export const ownerFind = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((q: string) => clean(q, 32).toLowerCase())
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    await founderOnly(sql, context.userId);
    if (data.length < 2) return [];
    return sql<{ username: string; display_name: string; strikes: number; verified: boolean; monetized: boolean; banned_forever: boolean; review_flag: boolean }>`
      select username, display_name, strikes, verified, monetized, banned_forever, review_flag
      from profiles
      where is_founder = false and (username like ${"%" + data + "%"} or lower(display_name) like ${"%" + data + "%"})
      order by username
      limit 8`;
  });

export const recordShare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => clean(id, 80))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    await sql`insert into shares (user_id, post_id) values (${context.userId}, ${data}) on conflict (user_id, post_id) do nothing`;
    return { ok: true };
  });

export const askPayout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { method: string; detail: string }) => ({
    method: ["easypaisa", "jazzcash", "nayapay", "iban", "applepay", "stcpay", "card", "paypal", "stripe", "payoneer", "wise", "swift"].includes(String(input.method)) ? String(input.method) : "",
    detail: clean(input.detail, 120),
  }))
  .handler(async ({ context, data }) => {
    if (!data.method || data.detail.length < 4) throw new Error("EMPTY");
    const sql = await gate(context.userId);
    if (secretNote(data.detail)) throw new Error("WORD");
    const me = await sql<{ is_founder: boolean; country: string; payout_locked: boolean; monetized: boolean }>`
      select is_founder, country, payout_locked, monetized from profiles where user_id = ${context.userId}`;
    if (me[0]?.is_founder) {
      const wallet = await sql<{ coins: number }>`select coins from wallets where user_id = ${context.userId}`;
      const coins = wallet[0]?.coins ?? 0;
      await sql`insert into payouts (id, user_id, method, amount_usd, detail) values (${nid()}, ${context.userId}, ${data.method}, ${Math.max(1, Math.floor(coins / 100))}, ${data.detail})`;
      return { message: "Your request has been received. A person will look at it within 24-48 hours." };
    }
    if (regionOf(me[0]?.country ?? "") !== "full") throw new Error("REGION");
    if (!me[0]?.monetized) throw new Error("MIN");
    if (me[0]?.payout_locked) throw new Error("VPN_LOCK");
    if (await tunneled()) {
      await sql`update profiles set payout_strikes = payout_strikes + 1 where user_id = ${context.userId}`;
      const strikes = await sql<{ payout_strikes: number }>`select payout_strikes from profiles where user_id = ${context.userId}`;
      if ((strikes[0]?.payout_strikes ?? 0) >= 3) {
        await sql`update profiles set payout_locked = true where user_id = ${context.userId}`;
        const admins = await sql<{ user_id: string }>`select user_id from profiles where is_founder = true`;
        for (const admin of admins) await notify(sql, admin.user_id, "ticket", context.userId);
        throw new Error("VPN_LOCK");
      }
      throw new Error("VPN");
    }
    const open = await sql`select id from payouts where user_id = ${context.userId} and status = 'open' limit 1`;
    if (open.length) throw new Error("ONE_TICKET");
    const bar = await qualified30(sql, context.userId);
    const wallet = await sql<{ coins: number }>`select coins from wallets where user_id = ${context.userId}`;
    const coins = wallet[0]?.coins ?? 0;
    if (bar.followers < 6000 || bar.views < 100000 || coins < 6000) throw new Error("MIN");
    await sql`insert into payouts (id, user_id, method, amount_usd, detail) values (${nid()}, ${context.userId}, ${data.method}, ${Math.floor(coins / 100)}, ${data.detail})`;
    return { message: "Your request has been received. A person will look at it within 24-48 hours." };
  });

export const newsFeed = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await gate(context.userId);
    return sql<{ id: string; body: string; likes: number; liked: boolean }>`
      select b.id, b.body,
        (select count(*)::int from broadcast_likes l where l.broadcast_id = b.id) as likes,
        exists(select 1 from broadcast_likes l where l.broadcast_id = b.id and l.user_id = ${context.userId}) as liked
      from broadcasts b order by b.created_at desc limit 30`;
  });

export const newsLike = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => clean(id, 80))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    const has = await sql`select 1 from broadcast_likes where user_id = ${context.userId} and broadcast_id = ${data}`;
    if (has.length) await sql`delete from broadcast_likes where user_id = ${context.userId} and broadcast_id = ${data}`;
    else await sql`insert into broadcast_likes (user_id, broadcast_id) values (${context.userId}, ${data})`;
    return { ok: true };
  });

export const newsComment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; body: string }) => ({ id: clean(input.id, 80), body: clean(input.body, 300) }))
  .handler(async ({ context, data }) => {
    const sql = await gate(context.userId);
    if (!data.body) throw new Error("EMPTY");
    const exists = await sql`select id from broadcast_comments where broadcast_id = ${data.id} and user_id = ${context.userId}`;
    if (exists.length) throw new Error("ONE_NOTE");
    await sql`insert into broadcast_comments (id, broadcast_id, user_id, body) values (${nid()}, ${data.id}, ${context.userId}, ${data.body})`;
    return { ok: true };
  });



