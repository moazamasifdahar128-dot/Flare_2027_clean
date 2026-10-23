import { getSql } from "@/lib/db";
import { noteBoostEnd } from "@/lib/shola/system-notes";

function blobIds(value: string) {
  return value.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? [];
}

async function due(sql: Awaited<ReturnType<typeof getSql>>) {
  try {
    const clock = await sql<{ ran_at: string }>`select ran_at::text as ran_at from sweep_clock where name = 'keep'`;
    if (clock[0] && Date.now() - new Date(clock[0].ran_at).getTime() < 15 * 60 * 1000) return false;
    await sql`
      insert into sweep_clock (name, ran_at) values ('keep', now())
      on conflict (name) do update set ran_at = now()`;
    return true;
  } catch {
    return true;
  }
}

export async function eraseGig(sql: Awaited<ReturnType<typeof getSql>>, id: string) {
  const row = (await sql<{ videos: string }>`select videos from gigs where id = ${id}`)[0];
  for (const blob of blobIds(row?.videos || "")) {
    const live = await sql`select 1 from gigs where id <> ${id} and videos like ${"%" + blob + "%"} limit 1`;
    if (live.length) continue;
    await sql`delete from gig_blob_parts where blob_id = ${blob}`;
    await sql`delete from gig_blobs where id = ${blob}`;
  }
  await sql`delete from gig_messages where gig_id = ${id}`;
  await sql`delete from gig_orders where gig_id = ${id}`;
  await sql`delete from gig_likes where gig_id = ${id}`;
  await sql`delete from gig_views where gig_id = ${id}`;
  await sql`delete from gig_saves where gig_id = ${id}`;
  await sql`delete from listing_views where listing_id = ${id}`;
  try { await sql`delete from thread_flags where listing_id = ${id}`; } catch { /* older database */ }
  try {
    await sql`delete from conversation_messages where conversation_id in (select id from conversations where gig_id = ${id})`;
    await sql`delete from conversations where gig_id = ${id}`;
  } catch { /* older database */ }
  await sql`delete from gigs where id = ${id}`;
}

export async function eraseJob(sql: Awaited<ReturnType<typeof getSql>>, id: string) {
  await sql`delete from job_messages where job_id = ${id}`;
  try { await sql`delete from job_likes where job_id = ${id}`; } catch { /* older database */ }
  try { await sql`delete from job_saves where job_id = ${id}`; } catch { /* older database */ }
  try { await sql`delete from board_reports where post_id = ${id}`; } catch { /* older database */ }
  try { await sql`delete from thread_flags where listing_id = ${id}`; } catch { /* older database */ }
  try { await sql`delete from listing_views where listing_id = ${id}`; } catch { /* older database */ }
  try {
    await sql`delete from conversation_messages where conversation_id in (select id from conversations where gig_id = ${id})`;
    await sql`delete from conversations where gig_id = ${id}`;
  } catch { /* older database */ }
  await sql`delete from job_posts where id = ${id}`;
}

export async function keepSweep(sql: Awaited<ReturnType<typeof getSql>>) {
  if (!(await due(sql))) return;
  try {
    await sql`delete from system_messages where kind in ('expiry_soon', 'expiry_final', 'expired')`;
  } catch { /* notice table */ }

  const faded = await sql<{ id: string; user_id: string; title: string; until: string; kind: string }>`
    select g.id, g.user_id, g.title, g.boost_until::text as until,
      coalesce((select b.kind from gig_boosts b where b.gig_id = g.id and b.status = 'approved' order by b.created_at desc limit 1), 'day') as kind
    from gigs g
    where g.boost_until is not null and g.boost_until < now() and g.boost_until > now() - interval '2 days'`;
  for (const row of faded) {
    try { await noteBoostEnd(sql, row.user_id, row.id, row.title, row.kind, row.until); } catch { /* notice table */ }
  }

  try {
    await sql`delete from gig_saves s where not exists (
      select 1 from gigs g where g.id = s.gig_id and g.removed_at is null
    )`;
  } catch { /* older database */ }
  try {
    await sql`delete from job_saves s where not exists (
      select 1 from job_posts j where j.id = s.job_id and j.hidden_at is null
    )`;
  } catch { /* older database */ }

  const deadShops = await sql<{ id: string }>`select id from shops where expires_at is not null and expires_at < now()`;
  for (const row of deadShops) {
    await sql`delete from shop_orders where shop_id = ${row.id}`;
    await sql`delete from shop_products where shop_id = ${row.id}`;
    await sql`delete from shops where id = ${row.id}`;
  }
}
