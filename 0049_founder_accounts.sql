create table if not exists founder_payment_accounts (
  method text primary key,
  account_number text not null default '',
  title text not null default '',
  is_active boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table gig_boosts add column if not exists route_hint text not null default '';
alter table board_payments add column if not exists route_hint text not null default '';
alter table manual_orders add column if not exists route_hint text not null default '';
alter table verify_requests add column if not exists route_hint text not null default '';

insert into founder_payment_accounts (method, account_number, title, is_active)
select 'easypaisa', trim(payee_easypaisa), left(trim(payee_title), 80), true
from board_settings
where id = 'main' and length(trim(payee_easypaisa)) >= 4
on conflict (method) do nothing;

insert into founder_payment_accounts (method, account_number, title, is_active)
select 'jazzcash', trim(payee_jazzcash), left(trim(payee_title), 80), true
from board_settings
where id = 'main' and length(trim(payee_jazzcash)) >= 4
on conflict (method) do nothing;

insert into founder_payment_accounts (method, account_number, title, is_active)
select 'bank', trim(payee_bank), left(trim(payee_title), 80), true
from board_settings
where id = 'main' and length(trim(payee_bank)) >= 6
on conflict (method) do nothing;

insert into founder_payment_accounts (method, account_number, title, is_active)
select 'card',
  case when length(trim(payee_payoneer)) >= 4 then trim(payee_payoneer) else trim(payee_wise) end,
  left(trim(payee_title), 80),
  true
from board_settings
where id = 'main' and (length(trim(payee_payoneer)) >= 4 or length(trim(payee_wise)) >= 4)
on conflict (method) do nothing;
