create table if not exists job_likes (
  user_id text not null,
  job_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

create table if not exists job_saves (
  user_id text not null,
  job_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

create index if not exists job_likes_job on job_likes (job_id);
create index if not exists job_saves_job on job_saves (job_id);
create index if not exists job_saves_user on job_saves (user_id, created_at desc);

alter table job_posts add column if not exists deadline text not null default '';
alter table board_reports add column if not exists reason text not null default '';
alter table board_reports add column if not exists note text not null default '';
