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
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platinum_leads_email_idx on platinum_leads (email);
create index if not exists platinum_leads_status_idx on platinum_leads (status);
create index if not exists platinum_leads_created_at_idx on platinum_leads (created_at desc);

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
