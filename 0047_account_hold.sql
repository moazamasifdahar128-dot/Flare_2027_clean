alter table profiles add column if not exists closed_at timestamptz;
alter table profiles add column if not exists name_hold text not null default '';
