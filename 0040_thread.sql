create table if not exists thread_flags (
  kind text not null,
  listing_id text not null,
  owner_id text not null,
  other_id text not null,
  accepted boolean not null default false,
  declined boolean not null default false,
  primary key (kind, listing_id, owner_id, other_id)
);
