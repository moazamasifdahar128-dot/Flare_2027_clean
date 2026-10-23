create table if not exists shops (
  id text primary key,
  user_id text not null,
  name text not null,
  category text not null default 'Other',
  about text not null default '',
  cover text not null default '',
  logo text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists shops_user_idx on shops (user_id, created_at desc);

create table if not exists shop_products (
  id text primary key,
  shop_id text not null,
  user_id text not null,
  title text not null,
  detail text not null default '',
  price_cents integer not null default 0,
  currency text not null default 'USD',
  photo text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists shop_products_shop_idx on shop_products (shop_id, created_at desc);

create table if not exists shop_orders (
  id text primary key,
  code text not null,
  buyer_id text not null,
  shop_id text not null,
  product_id text not null,
  title text not null,
  qty integer not null,
  amount_cents integer not null,
  currency text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists shop_orders_buyer_idx on shop_orders (buyer_id, created_at desc);
