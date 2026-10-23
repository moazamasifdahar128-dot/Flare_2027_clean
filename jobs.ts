// @ts-nocheck
type ServerCall = (input?: any) => Promise<any>;
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { containsContactInfoBio, maskContact, chatLeak } from "@/lib/shola/gig-text";

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
export const jobBoard: ServerCall = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	return (await (await open(context.userId))`
      select j.id, j.title, j.body, j.user_id, pr.username, pr.display_name
      from job_posts j
      join profiles pr on pr.user_id = j.user_id
      where not exists (
        select 1 from blocks b
        where (b.blocker_id = ${context.userId} and b.blocked_id = j.user_id)
           or (b.blocked_id = ${context.userId} and b.blocker_id = j.user_id)
      )
        and j.hidden_at is null
       
      order by j.created_at desc
      limit 40`).map((row) => ({
		id: row.id,
		title: maskContact(row.title),
		body: maskContact(row.body),
		mine: row.user_id === context.userId,
		username: row.username,
		displayName: row.display_name
	}));
});
export const saveJob: ServerCall = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => ({
	title: clean(input?.title, 140),
	body: clean(input?.body, 2e3)
})).handler(async ({ context, data }) => {
	if (data.title.length < 3 || data.body.length < 3) throw new Error("GIG_TITLE");
	if (containsContactInfoBio(data.title) || containsContactInfoBio(data.body)) throw new Error("GIG_LEAK");
	const sql = await open(context.userId);
	const id = nid();
	await sql`insert into job_posts (id, user_id, title, body) values (${id}, ${context.userId}, ${data.title}, ${data.body})`;
	return { id };
});
export const jobInbox: ServerCall = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
	const sql = await open(context.userId);
	const me = context.userId;
	const owned = await sql`
      select j.id as job_id, j.title, pr.username, pr.display_name,
        exists(select 1 from job_messages m where m.job_id = j.id and m.from_id = people.uid and m.to_id = ${me}) as started
      from (
        select job_id, from_id as uid from job_messages where to_id = ${me}
        union
        select job_id, to_id as uid from job_messages where from_id = ${me}
      ) people
      join job_posts j on j.id = people.job_id and j.user_id = ${me}
      join profiles pr on pr.user_id = people.uid
      where people.uid <> ${me}`;
	const applying = await sql`
      select j.id as job_id, j.title, pr.username, pr.display_name,
        exists(select 1 from job_messages m where m.job_id = j.id and m.from_id = ${me} and m.to_id = j.user_id) as started
      from (
        select job_id from job_messages where from_id = ${me}
        union
        select job_id from job_messages where to_id = ${me}
      ) mine
      join job_posts j on j.id = mine.job_id and j.user_id <> ${me}
      join profiles pr on pr.user_id = j.user_id`;
	const map = (row, role) => ({
		id: row.job_id,
		title: maskContact(row.title),
		role,
		withUsername: row.username,
		withName: row.display_name,
		started: Boolean(row.started)
	});
	return { threads: [...owned.map((row) => map(row, "owner")), ...applying.map((row) => map(row, "buyer"))] };
});
export const jobTalk: ServerCall = createServerFn({ method: "GET" }).middleware([authMiddleware]).validator((input) => ({
	id: clean(input?.id, 80),
	withUser: clean(input?.with, 32).toLowerCase()
})).handler(async ({ context, data }) => {
	const sql = await open(context.userId);
	const job = await sql`select user_id, title from job_posts where id = ${data.id}`;
	if (!job[0]) return {
		title: "",
		mine: false,
		peer: "",
		messages: []
	};
	let other = "";
	if (job[0].user_id === context.userId) {
		if (!data.withUser) return {
			title: maskContact(job[0].title),
			mine: true,
			peer: "",
			messages: []
		};
		other = (await sql`select user_id from profiles where username = ${data.withUser}`)[0]?.user_id ?? "";
	} else other = job[0].user_id;
	if (!other || other === context.userId) return {
		title: maskContact(job[0].title),
		mine: job[0].user_id === context.userId,
		peer: "",
		messages: []
	};
	if ((await sql`select 1 from blocks where (blocker_id = ${context.userId} and blocked_id = ${other}) or (blocker_id = ${other} and blocked_id = ${context.userId})`).length) return {
		title: "",
		mine: false,
		peer: "",
		messages: []
	};
	const left = job[0].user_id === context.userId ? job[0].user_id : context.userId;
	const messages = await sql`
      select id, from_id, body from job_messages
      where job_id = ${data.id}
        and ((from_id = ${left} and to_id = ${other}) or (from_id = ${other} and to_id = ${left}))
      order by created_at`;
	const peer = job[0].user_id === context.userId ? data.withUser : (await sql`select username from profiles where user_id = ${job[0].user_id}`)[0]?.username ?? "";
	return {
		title: maskContact(job[0].title),
		mine: job[0].user_id === context.userId,
		peer,
		messages: messages.map((row) => ({
			id: row.id,
			body: maskContact(row.body),
			mine: row.from_id === context.userId
		}))
	};
});
export const jobPeople: ServerCall = createServerFn({ method: "GET" }).middleware([authMiddleware]).validator((id) => clean(id, 80)).handler(async ({ context, data }) => {
	const sql = await open(context.userId);
	const job = await sql`select user_id from job_posts where id = ${data}`;
	if (!job[0] || job[0].user_id !== context.userId) return [];
	return (await sql`
      select pr.username, pr.display_name,
        exists(select 1 from job_messages m where m.job_id = ${data} and m.from_id = people.uid and m.to_id = ${context.userId}) as started
      from (
        select from_id as uid from job_messages where job_id = ${data} and to_id = ${context.userId}
        union
        select to_id as uid from job_messages where job_id = ${data} and from_id = ${context.userId}
      ) people
      join profiles pr on pr.user_id = people.uid
      where people.uid <> ${context.userId}`).map((row) => ({
		username: row.username,
		displayName: row.display_name,
		started: Boolean(row.started)
	}));
});
export const jobSend: ServerCall = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => ({
	id: clean(input?.id, 80),
	body: clean(input?.body, 500),
	to: clean(input?.to ?? "", 32).toLowerCase()
})).handler(async ({ context, data }) => {
	if (!data.body) throw new Error("EMPTY");
	const sql = await open(context.userId);
	if (chatLeak(data.body)) {
		await sql`insert into spam_logs (id, user_id, kind, body) values (${nid()}, ${context.userId}, ${"job"}, ${maskContact(data.body).slice(0, 180)})`;
		throw new Error("CHAT_LEAK");
	}
	const job = await sql`select user_id from job_posts where id = ${data.id}`;
	if (!job[0]) throw new Error("FORBIDDEN");
	const posterId = job[0].user_id;
	let other = "";
	if (posterId === context.userId) {
		if (!data.to) throw new Error("FORBIDDEN");
		const who = await sql`select user_id from profiles where username = ${data.to}`;
		if (!who[0] || who[0].user_id === context.userId) throw new Error("FORBIDDEN");
		if (!(await sql`
        select 1 from job_messages
        where job_id = ${data.id} and from_id = ${who[0].user_id} and to_id = ${context.userId}
        limit 1`).length) throw new Error("JOB_FIRST");
		other = who[0].user_id;
	} else other = posterId;
	if ((await sql`select 1 from blocks where (blocker_id = ${context.userId} and blocked_id = ${other}) or (blocker_id = ${other} and blocked_id = ${context.userId})`).length) throw new Error("BLOCKED");
	const messageId = nid();
	if (posterId === context.userId) await sql`
        insert into job_messages (id, job_id, from_id, to_id, body)
        values (${messageId}, ${data.id}, ${context.userId}, ${other}, ${data.body})`;
	else if (!(await sql`
        insert into job_messages (id, job_id, from_id, to_id, body)
        select ${messageId}, ${data.id}, ${context.userId}, ${other}, ${data.body}
        where (
          exists (
            select 1 from job_messages
            where job_id = ${data.id} and from_id = ${posterId} and to_id = ${context.userId}
          )
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
        returning id`).length) throw new Error("BOARD_WAIT");
	await sql`
      insert into notifications (id, user_id, kind, from_id, post_id)
      values (${nid()}, ${other}, ${posterId === context.userId ? "job_reply" : "job_inquiry"}, ${""}, ${data.id})`;
	return { ok: true };
});
//#endregion
