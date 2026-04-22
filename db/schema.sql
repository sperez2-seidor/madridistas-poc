create extension if not exists pgcrypto;

create table if not exists platinum_customers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  first_name text not null default '',
  last_name text not null default '',
  billing_cycle text
    check (billing_cycle in ('monthly', 'yearly')),
  jersey_tier text
    check (jersey_tier in ('fan', 'authentic')),
  amount_cents integer,
  currency text,
  stripe_customer_id text unique,
  stripe_payment_method_id text,
  card_brand text,
  card_last4 text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platinum_customers_stripe_customer_idx
  on platinum_customers (stripe_customer_id);

create table if not exists platinum_charges (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references platinum_customers(id) on delete set null,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  kind text not null default 'recurring'
    check (kind in ('initial', 'recurring')),
  amount_cents integer not null,
  currency text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'succeeded', 'failed', 'requires_action')),
  failure_code text,
  failure_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platinum_charges_customer_idx on platinum_charges (customer_id);
create index if not exists platinum_charges_payment_intent_idx on platinum_charges (stripe_payment_intent_id);
create index if not exists platinum_charges_created_at_idx on platinum_charges (created_at desc);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists platinum_customers_set_updated_at on platinum_customers;

create trigger platinum_customers_set_updated_at
before update on platinum_customers
for each row
execute function set_updated_at();

drop trigger if exists platinum_charges_set_updated_at on platinum_charges;

create trigger platinum_charges_set_updated_at
before update on platinum_charges
for each row
execute function set_updated_at();

-- cleanup: drop legacy leads table from earlier iterations
drop table if exists platinum_leads cascade;
alter table platinum_charges drop column if exists lead_id;
