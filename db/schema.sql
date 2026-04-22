create extension if not exists pgcrypto;

create table if not exists platinum_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  first_name text not null,
  last_name text not null default '',
  card_first_name text,
  card_last_name text,
  billing_cycle text not null default 'monthly'
    check (billing_cycle in ('monthly', 'yearly')),
  jersey_tier text not null default 'fan'
    check (jersey_tier in ('fan', 'authentic')),
  payment_method_preference text
    check (payment_method_preference in ('paypal', 'card')),
  address_line1 text,
  postal_code text,
  city text,
  region text,
  country text,
  legal_terms_accepted boolean not null default false,
  source text not null default 'madridista-platinum-poc',
  status text not null default 'draft'
    check (status in ('draft', 'checkout_started', 'paid', 'cancelled')),
  stripe_checkout_session_id text,
  stripe_customer_id text,
  stripe_payment_method_id text,
  amount_cents integer,
  currency text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platinum_leads_email_idx on platinum_leads (email);
create index if not exists platinum_leads_status_idx on platinum_leads (status);
create index if not exists platinum_leads_created_at_idx on platinum_leads (created_at desc);

alter table platinum_leads
  add column if not exists stripe_payment_method_id text,
  add column if not exists amount_cents integer,
  add column if not exists currency text;

alter table platinum_leads
  drop column if exists stripe_subscription_id,
  drop column if exists stripe_subscription_status,
  drop column if exists stripe_price_id,
  drop column if exists stripe_product_id,
  drop column if exists stripe_latest_invoice_id;

create table if not exists platinum_charges (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references platinum_leads(id) on delete cascade,
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

create index if not exists platinum_charges_lead_idx on platinum_charges (lead_id);
create index if not exists platinum_charges_payment_intent_idx on platinum_charges (stripe_payment_intent_id);
create index if not exists platinum_charges_created_at_idx on platinum_charges (created_at desc);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists platinum_leads_set_updated_at on platinum_leads;

create trigger platinum_leads_set_updated_at
before update on platinum_leads
for each row
execute function set_updated_at();

drop trigger if exists platinum_charges_set_updated_at on platinum_charges;

create trigger platinum_charges_set_updated_at
before update on platinum_charges
for each row
execute function set_updated_at();
