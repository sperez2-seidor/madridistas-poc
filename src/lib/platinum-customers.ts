import { getPool } from "./db";
import type { BillingCycle, JerseyTier } from "./platinum-pricing";

export type PlatinumCustomer = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  billingCycle: BillingCycle | null;
  jerseyTier: JerseyTier | null;
  amountCents: number | null;
  currency: string | null;
  stripeCustomerId: string | null;
  stripePaymentMethodId: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  createdAt: string;
  updatedAt: string;
};

function canUseDatabase() {
  return Boolean(process.env.DATABASE_URL) || process.env.VERCEL !== "1";
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function upsertLocalCustomer({
  email,
  firstName,
  lastName,
  billingCycle,
  jerseyTier,
  amountCents,
  currency,
}: {
  email: string;
  firstName: string;
  lastName: string;
  billingCycle?: BillingCycle;
  jerseyTier?: JerseyTier;
  amountCents?: number;
  currency?: string;
}) {
  if (!canUseDatabase()) {
    return null;
  }

  const pool = getPool();
  const result = await pool.query<PlatinumCustomer>(
    `
      insert into platinum_customers (
        email, first_name, last_name,
        billing_cycle, jersey_tier,
        amount_cents, currency
      )
      values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (email) do update set
        first_name = coalesce(nullif(excluded.first_name, ''), platinum_customers.first_name),
        last_name = coalesce(nullif(excluded.last_name, ''), platinum_customers.last_name),
        billing_cycle = coalesce(excluded.billing_cycle, platinum_customers.billing_cycle),
        jersey_tier = coalesce(excluded.jersey_tier, platinum_customers.jersey_tier),
        amount_cents = coalesce(excluded.amount_cents, platinum_customers.amount_cents),
        currency = coalesce(excluded.currency, platinum_customers.currency),
        updated_at = now()
      returning
        id,
        email,
        first_name as "firstName",
        last_name as "lastName",
        billing_cycle as "billingCycle",
        jersey_tier as "jerseyTier",
        amount_cents as "amountCents",
        currency,
        stripe_customer_id as "stripeCustomerId",
        stripe_payment_method_id as "stripePaymentMethodId",
        card_brand as "cardBrand",
        card_last4 as "cardLast4",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `,
    [
      normalizeEmail(email),
      firstName,
      lastName,
      billingCycle ?? null,
      jerseyTier ?? null,
      amountCents ?? null,
      currency ?? null,
    ],
  );

  return result.rows[0] ?? null;
}

export async function getCustomerByEmail(email: string) {
  if (!canUseDatabase()) {
    return null;
  }

  const pool = getPool();
  const result = await pool.query<PlatinumCustomer>(
    `
      select
        id,
        email,
        first_name as "firstName",
        last_name as "lastName",
        billing_cycle as "billingCycle",
        jersey_tier as "jerseyTier",
        amount_cents as "amountCents",
        currency,
        stripe_customer_id as "stripeCustomerId",
        stripe_payment_method_id as "stripePaymentMethodId",
        card_brand as "cardBrand",
        card_last4 as "cardLast4",
        created_at as "createdAt",
        updated_at as "updatedAt"
      from platinum_customers
      where email = $1
      limit 1
    `,
    [normalizeEmail(email)],
  );

  return result.rows[0] ?? null;
}

export async function getCustomerById(id: string) {
  if (!canUseDatabase()) {
    return null;
  }

  const pool = getPool();
  const result = await pool.query<PlatinumCustomer>(
    `
      select
        id,
        email,
        first_name as "firstName",
        last_name as "lastName",
        billing_cycle as "billingCycle",
        jersey_tier as "jerseyTier",
        amount_cents as "amountCents",
        currency,
        stripe_customer_id as "stripeCustomerId",
        stripe_payment_method_id as "stripePaymentMethodId",
        card_brand as "cardBrand",
        card_last4 as "cardLast4",
        created_at as "createdAt",
        updated_at as "updatedAt"
      from platinum_customers
      where id = $1::uuid
      limit 1
    `,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function getCustomerByStripeId(stripeCustomerId: string) {
  if (!canUseDatabase()) {
    return null;
  }

  const pool = getPool();
  const result = await pool.query<PlatinumCustomer>(
    `
      select
        id,
        email,
        first_name as "firstName",
        last_name as "lastName",
        billing_cycle as "billingCycle",
        jersey_tier as "jerseyTier",
        amount_cents as "amountCents",
        currency,
        stripe_customer_id as "stripeCustomerId",
        stripe_payment_method_id as "stripePaymentMethodId",
        card_brand as "cardBrand",
        card_last4 as "cardLast4",
        created_at as "createdAt",
        updated_at as "updatedAt"
      from platinum_customers
      where stripe_customer_id = $1
      limit 1
    `,
    [stripeCustomerId],
  );

  return result.rows[0] ?? null;
}

export async function attachStripeCustomerId({
  id,
  stripeCustomerId,
}: {
  id: string;
  stripeCustomerId: string;
}) {
  if (!canUseDatabase()) {
    return;
  }

  const pool = getPool();
  await pool.query(
    `
      update platinum_customers
      set stripe_customer_id = $2, updated_at = now()
      where id = $1::uuid
    `,
    [id, stripeCustomerId],
  );
}

export async function attachPaymentMethodToCustomer({
  stripeCustomerId,
  stripePaymentMethodId,
  cardBrand,
  cardLast4,
  amountCents,
  currency,
}: {
  stripeCustomerId: string;
  stripePaymentMethodId: string;
  cardBrand?: string | null;
  cardLast4?: string | null;
  amountCents?: number;
  currency?: string;
}) {
  if (!canUseDatabase()) {
    return;
  }

  const pool = getPool();
  await pool.query(
    `
      update platinum_customers
      set
        stripe_payment_method_id = $2,
        card_brand = coalesce($3, card_brand),
        card_last4 = coalesce($4, card_last4),
        amount_cents = coalesce($5, amount_cents),
        currency = coalesce($6, currency),
        updated_at = now()
      where stripe_customer_id = $1
    `,
    [
      stripeCustomerId,
      stripePaymentMethodId,
      cardBrand ?? null,
      cardLast4 ?? null,
      amountCents ?? null,
      currency ?? null,
    ],
  );
}

export async function listCustomersWithPaymentMethod() {
  if (!canUseDatabase()) {
    return [] as PlatinumCustomer[];
  }

  const pool = getPool();
  const result = await pool.query<PlatinumCustomer>(
    `
      select
        id,
        email,
        first_name as "firstName",
        last_name as "lastName",
        billing_cycle as "billingCycle",
        jersey_tier as "jerseyTier",
        amount_cents as "amountCents",
        currency,
        stripe_customer_id as "stripeCustomerId",
        stripe_payment_method_id as "stripePaymentMethodId",
        card_brand as "cardBrand",
        card_last4 as "cardLast4",
        created_at as "createdAt",
        updated_at as "updatedAt"
      from platinum_customers
      where stripe_payment_method_id is not null
        and stripe_customer_id is not null
      order by updated_at desc
      limit 100
    `,
  );

  return result.rows;
}

export async function listAllCustomers() {
  if (!canUseDatabase()) {
    return [] as PlatinumCustomer[];
  }

  const pool = getPool();
  const result = await pool.query<PlatinumCustomer>(
    `
      select
        id,
        email,
        first_name as "firstName",
        last_name as "lastName",
        billing_cycle as "billingCycle",
        jersey_tier as "jerseyTier",
        amount_cents as "amountCents",
        currency,
        stripe_customer_id as "stripeCustomerId",
        stripe_payment_method_id as "stripePaymentMethodId",
        card_brand as "cardBrand",
        card_last4 as "cardLast4",
        created_at as "createdAt",
        updated_at as "updatedAt"
      from platinum_customers
      order by updated_at desc
      limit 100
    `,
  );

  return result.rows;
}
