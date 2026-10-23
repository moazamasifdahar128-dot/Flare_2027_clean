// @ts-nocheck
type ServerCall = (input?: any) => Promise<any>;
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { maskContact } from "@/lib/shola/gig-text";
import { postSystem } from "@/lib/shola/system-notes";
import { blockContactLeak } from "@/lib/shola/chat-privacy";

var CAP = 3;
function nid() {
	return crypto.randomUUID();
}
function clean(value, max) {
	return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}
async function open(userId) {
	const sql = await getSql();
	if ((await sql`select 1 from profiles where user_id = ${userId} and (banned_forever or (banned_until is not null and banned_until > now()))`).length) throw new Error("BANNED");
	return sql;
}
async function listing(sql, id, kind) {
	if (kind === "job") return (await sql`
      select user_id, title, (hidden_at is not null) as hidden from job_posts
      where id = ${id}`)[0] ?? null;
	return (await sql`
    select user_id, title, hidden from gigs
    where id = ${id} and removed_at is null`)[0] ?? null;
}
function pair(me, other, ownerId) {
	if (other === me || me !== ownerId && other !== ownerId) return null;
	const seller = ownerId;
	const buyer = me === ownerId ? other : me;
	if (buyer === seller) return null;
	return {
		buyer,
		seller
	};
}
async function blocked(sql, a, b) {
	return (await sql`select 1 from blocks where (blocker_id = ${a} and blocked_id = ${b}) or (blocker_id = ${b} and blocked_id = ${a}) limit 1`).length > 0;
}
async function deliverMine(sql, me, conversationId = "") {
	const only = conversationId || "";
	await sql`
    update conversation_messages m
    set status = 'delivered', delivered_at = coalesce(m.delivered_at, now())
    from conversations c
    join profiles peer on peer.user_id = case when c.participant1 = ${me} then c.participant2 else c.participant1 end
    where m.conversation_id = c.id
      and m.sender_id = ${me}
      and m.status = 'sent'
      and (c.participant1 = ${me} or c.participant2 = ${me})
      and (${only} = '' or c.id = ${only})
      and peer.hide_online = false
      and peer.last_seen > now() - interval '45 seconds'`;
}
function mapMsg(row, me) {
	const status = row.status === "seen" || row.status === "delivered" ? row.status : "sent";
	return {
		id: row.id,
		text: row.body,
		mine: row.sender_id === me,
		status,
		at: row.created_at
	};
}
export const chatThread: ServerCall = createServerFn({ method: "GET" }).middleware([authMiddleware]).validator((input) => ({
	userId: clean(input?.userId, 80),
	gigId: clean(input?.gigId, 80),
	box: input?.box === "job" ? "job" : "gig",
	before: clean(input?.before, 40)
})).handler(async ({ context, data }) => {
	const sql = await open(context.userId);
	const post = await listing(sql, data.gigId, data.box);
	if (!post) return null;
	if (post.hidden && context.userId !== post.user_id) {
		if (!(await sql`select 1 from conversations where gig_id = ${data.gigId} and kind = ${data.box} and (participant1 = ${context.userId} or participant2 = ${context.userId}) limit 1`).length) return null;
	}
	const who = pair(context.userId, data.userId, post.user_id);
	if (!who) return null;
	if (await blocked(sql, who.buyer, who.seller)) return null;
	const conv = (await sql`
      select id, status from conversations
      where participant1 = ${who.buyer} and participant2 = ${who.seller} and gig_id = ${data.gigId} and kind = ${data.box}
      limit 1`)[0];
	const peerId = context.userId === who.seller ? who.buyer : who.seller;
	const peer = (await sql`
      select username, display_name, avatar, is_founder, hide_online, last_seen::text as last_seen
      from profiles where user_id = ${peerId}`)[0];
	if (!peer) return null;
	const last = peer.last_seen ? new Date(peer.last_seen).getTime() : 0;
	const sent = conv ? (await sql`select count(*)::int as n from conversation_messages where conversation_id = ${conv.id} and sender_id = ${who.buyer}`)[0]?.n ?? 0 : 0;
	let messages = [];
	let hasMore = false;
	if (conv) {
		await deliverMine(sql, context.userId, conv.id);
		const rows = data.before ? await sql`
            select id, sender_id, body, status, created_at::text as created_at
            from conversation_messages
            where conversation_id = ${conv.id} and created_at < ${data.before}::timestamptz
            order by created_at desc
            limit 50` : await sql`
            select id, sender_id, body, status, created_at::text as created_at
            from conversation_messages
            where conversation_id = ${conv.id}
            order by created_at desc
            limit 50`;
		hasMore = rows.length === 50;
		messages = rows.reverse().map((row) => mapMsg(row, context.userId));
	}
	return {
		conversationId: conv?.id ?? "",
		status: conv?.status ?? "new",
		role: context.userId === who.seller ? "seller" : "buyer",
		title: maskContact(post.title),
		gigId: data.gigId,
		box: data.box,
		peer: {
			id: peerId,
			name: peer.display_name || peer.username,
			username: peer.username,
			avatar: peer.avatar || "",
			founder: Boolean(peer.is_founder),
			online: !peer.hide_online && Date.now() - last < 45e3
		},
		messages,
		sent,
		cap: CAP,
		hasMore
	};
});
export const chatSend: ServerCall = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => ({
	userId: clean(input?.userId, 80),
	gigId: clean(input?.gigId, 80),
	box: input?.box === "job" ? "job" : "gig",
	raw: String(input?.body ?? "").slice(0, 500)
})).handler(async ({ context, data }) => {
	const body = data.raw.replace(/\s+/g, " ").trim();
	if (!body) throw new Error("EMPTY");
	const sql = await open(context.userId);
	const post = await listing(sql, data.gigId, data.box);
	if (!post) throw new Error("FORBIDDEN");
	if (post.hidden && context.userId !== post.user_id) {
		if (!(await sql`select 1 from conversations where gig_id = ${data.gigId} and kind = ${data.box} and participant1 = ${context.userId} limit 1`).length) throw new Error("FORBIDDEN");
	}
	const who = pair(context.userId, data.userId, post.user_id);
	if (!who) throw new Error("FORBIDDEN");
	if (await blocked(sql, who.buyer, who.seller)) throw new Error("BLOCKED");
	if (blockContactLeak(data.raw) || blockContactLeak(body)) {
		await sql`
        insert into chat_leak_logs (id, user_id, gig_id, body)
        values (${nid()}, ${context.userId}, ${data.gigId}, ${body.slice(0, 180)})`;
		throw new Error("CHAT_PRIVACY");
	}
	let conv = (await sql`
      select id, status from conversations
      where participant1 = ${who.buyer} and participant2 = ${who.seller} and gig_id = ${data.gigId} and kind = ${data.box}
      limit 1`)[0];
	if (conv?.status === "rejected") throw new Error("CHAT_REJECTED");
	if (!conv) {
		if (context.userId !== who.buyer) throw new Error("CHAT_WAIT");
		await sql`
        insert into conversations (id, participant1, participant2, gig_id, kind, status)
        values (${nid()}, ${who.buyer}, ${who.seller}, ${data.gigId}, ${data.box}, ${"pending"})
        on conflict (participant1, participant2, gig_id, kind) do nothing`;
		conv = (await sql`
        select id, status from conversations
        where participant1 = ${who.buyer} and participant2 = ${who.seller} and gig_id = ${data.gigId} and kind = ${data.box}
        limit 1`)[0];
	}
	if (!conv) throw new Error("FORBIDDEN");
	if (conv.status === "pending") {
		if (context.userId !== who.buyer) throw new Error("CHAT_WAIT");
		if (((await sql`select count(*)::int as n from conversation_messages where conversation_id = ${conv.id} and sender_id = ${who.buyer}`)[0]?.n ?? 0) >= CAP) throw new Error("CHAT_CAP");
	} else if (conv.status !== "accepted") throw new Error("FORBIDDEN");
	const id = nid();
	await sql`
      insert into conversation_messages (id, conversation_id, sender_id, body, status)
      values (${id}, ${conv.id}, ${context.userId}, ${body}, ${"sent"})`;
	await deliverMine(sql, context.userId, conv.id);
	if (conv.status === "pending" && context.userId === who.buyer) {
		const sent = (await sql`select count(*)::int as n from conversation_messages where conversation_id = ${conv.id} and sender_id = ${who.buyer}`)[0]?.n ?? 0;
		if (sent === 1) {
			const buyer = (await sql`select username from profiles where user_id = ${context.userId}`)[0];
			await postSystem(sql, {
				userId: who.seller,
				kind: "chat_in",
				body: `New message request from @${buyer?.username || "buyer"}`,
				ref: `chat-req:${conv.id}`
			});
			await sql`insert into notifications (id, user_id, kind, from_id, post_id) values (${nid()}, ${who.seller}, ${"chat_in"}, ${context.userId}, ${data.gigId})`;
		}
	}
	const row = (await sql`select id, sender_id, body, status, created_at::text as created_at from conversation_messages where id = ${id}`)[0];
	return {
		ok: true,
		conversationId: conv.id,
		message: row ? mapMsg(row, context.userId) : null
	};
});
export const chatSeen: ServerCall = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => ({
	conversationId: clean(input?.conversationId, 80),
	ids: Array.isArray(input?.ids) ? input.ids.map((id) => clean(id, 80)).filter(Boolean).slice(0, 50) : [],
	all: Boolean(input?.all)
})).handler(async ({ context, data }) => {
	if (!data.conversationId) return { ok: true };
	const sql = await open(context.userId);
	if (!(await sql`select 1 from conversations where id = ${data.conversationId} and (participant1 = ${context.userId} or participant2 = ${context.userId}) limit 1`).length) return { ok: true };
	if (data.all) {
		await sql`
        update conversation_messages
        set status = 'seen', seen_at = coalesce(seen_at, now()), delivered_at = coalesce(delivered_at, now())
        where conversation_id = ${data.conversationId} and sender_id <> ${context.userId} and status <> 'seen'`;
		return { ok: true };
	}
	for (const id of data.ids) await sql`
        update conversation_messages
        set status = 'seen', seen_at = coalesce(seen_at, now()), delivered_at = coalesce(delivered_at, now())
        where id = ${id} and conversation_id = ${data.conversationId} and sender_id <> ${context.userId} and status <> 'seen'`;
	return { ok: true };
});
export const chatAct: ServerCall = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => ({
	id: clean(input?.id, 80),
	accept: Boolean(input?.accept)
})).handler(async ({ context, data }) => {
	const sql = await open(context.userId);
	const conv = (await sql`
      select id, participant1, participant2, gig_id, status from conversations where id = ${data.id} limit 1`)[0];
	if (!conv || conv.participant2 !== context.userId || conv.status !== "pending") throw new Error("FORBIDDEN");
	if (data.accept) {
		await sql`update conversations set status = 'accepted' where id = ${conv.id}`;
		return { ok: true };
	}
	await sql`delete from conversation_messages where conversation_id = ${conv.id}`;
	await sql`delete from conversations where id = ${conv.id}`;
	await postSystem(sql, {
		userId: conv.participant1,
		kind: "chat_no",
		body: "Request rejected",
		ref: `chat-reject:${conv.id}`
	});
	return { ok: true };
});
export const chatDesk: ServerCall = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const sql = await open(context.userId);
	const me = context.userId;
	await deliverMine(sql, me);
	const requests = await sql`
      select c.id, c.gig_id, c.kind, c.created_at::text as at,
        pr.user_id, pr.username, pr.display_name, pr.avatar, pr.verified, pr.is_founder,
        coalesce(g.title, j.title, '') as title
      from conversations c
      join profiles pr on pr.user_id = c.participant1
      left join gigs g on c.kind = 'gig' and g.id = c.gig_id
      left join job_posts j on c.kind = 'job' and j.id = c.gig_id
      where c.participant2 = ${me} and c.status = 'pending'
      order by c.created_at desc
      limit 40`;
	const lines = requests.length ? await sql`
          select m.conversation_id, m.body
          from conversation_messages m
          join conversations c on c.id = m.conversation_id
          where c.participant2 = ${me} and c.status = 'pending'
          order by m.created_at asc` : [];
	const preview = /* @__PURE__ */ new Map();
	for (const line of lines) {
		const list = preview.get(line.conversation_id) ?? [];
		if (list.length < 3) list.push(line.body);
		preview.set(line.conversation_id, list);
	}
	const chats = await sql`
      select c.id, c.gig_id, c.kind,
        coalesce((select max(m.created_at)::text from conversation_messages m where m.conversation_id = c.id), c.created_at::text) as last_at,
        pr.user_id, pr.username, pr.display_name, pr.avatar, pr.verified, pr.is_founder,
        coalesce(g.title, j.title, '') as title,
        coalesce((select m.body from conversation_messages m where m.conversation_id = c.id order by m.created_at desc limit 1), '') as preview,
        (select count(*)::int from conversation_messages m where m.conversation_id = c.id and m.sender_id <> ${me} and m.status <> 'seen') as unread
      from conversations c
      join profiles pr on pr.user_id = case when c.participant1 = ${me} then c.participant2 else c.participant1 end
      left join gigs g on c.kind = 'gig' and g.id = c.gig_id
      left join job_posts j on c.kind = 'job' and j.id = c.gig_id
      where c.status = 'accepted' and (c.participant1 = ${me} or c.participant2 = ${me})
      order by last_at desc
      limit 40`;
	return {
		requestCount: (await sql`select count(*)::int as n from conversations where participant2 = ${me} and status = 'pending'`)[0]?.n ?? 0,
		unreadCount: (await sql`
      select count(*)::int as n
      from conversation_messages m
      join conversations c on c.id = m.conversation_id
      where c.status = 'accepted'
        and (c.participant1 = ${me} or c.participant2 = ${me})
        and m.sender_id <> ${me}
        and m.status <> 'seen'`)[0]?.n ?? 0,
		requests: requests.map((row) => ({
			id: row.id,
			gigId: row.gig_id,
			box: row.kind === "job" ? "job" : "gig",
			userId: row.user_id,
			name: row.display_name || row.username,
			username: row.username,
			avatar: row.avatar || "",
			verified: Boolean(row.verified),
			founder: Boolean(row.is_founder),
			title: maskContact(row.title),
			previews: preview.get(row.id) ?? [],
			at: row.at || ""
		})),
		chats: chats.map((row) => ({
			id: row.id,
			gigId: row.gig_id,
			box: row.kind === "job" ? "job" : "gig",
			userId: row.user_id,
			name: row.display_name || row.username,
			username: row.username,
			avatar: row.avatar || "",
			verified: Boolean(row.verified),
			founder: Boolean(row.is_founder),
			title: maskContact(row.title),
			preview: row.preview || "",
			unread: Number(row.unread) || 0,
			at: row.last_at || ""
		}))
	};
});
export const chatLeaks: ServerCall = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const sql = await getSql();
	const me = await sql`select is_admin, is_founder from profiles where user_id = ${context.userId}`;
	if (!me[0]?.is_admin && !me[0]?.is_founder) return [];
	return (await sql`
      select l.id, coalesce(pr.username, '') as username, l.body, l.created_at::text as at, l.gig_id
      from chat_leak_logs l
      left join profiles pr on pr.user_id = l.user_id
      order by l.created_at desc
      limit 12`).map((row) => ({
		id: row.id,
		username: row.username,
		body: row.body,
		at: row.at,
		gigId: row.gig_id
	}));
});
//#endregion
