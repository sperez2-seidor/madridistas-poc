import { randomUUID } from "node:crypto";
import { getPool } from "./db";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type BillingCycle = "monthly" | "yearly";
export type JerseyTier = "fan" | "authentic";
export type PaymentMethod = "paypal" | "card";

export type PlatinumLeadInput = {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  cardFirstName?: string;
  cardLastName?: string;
  billingCycle?: BillingCycle;
  jerseyTier?: JerseyTier;
  addressLine1?: string;
  postalCode?: string;
  city?: string;
  region?: string;
  country?: string;
  paymentMethod?: PaymentMethod;
  legalTermsAccepted?: boolean;
};

export type PlatinumLead = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  billingCycle: BillingCycle;
  jerseyTier: JerseyTier;
};

export type PlatinumLeadRecord = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  billingCycle: BillingCycle;
  jerseyTier: JerseyTier;
  status: "draft" | "checkout_started" | "paid" | "cancelled";
  stripeCustomerId: string | null;
  stripePaymentMethodId: string | null;
  stripeCheckoutSessionId: string | null;
  amountCents: number | null;
  currency: string | null;
  createdAt: string;
};

type NormalizedPlatinumLeadInput = {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  cardFirstName: string;
  cardLastName: string;
  billingCycle: BillingCycle;
  jerseyTier: JerseyTier;
  addressLine1: string;
  postalCode: string;
  city: string;
  region: string;
  country: string;
  paymentMethod: PaymentMethod;
  legalTermsAccepted: boolean;
};

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function canUseDatabase() {
  return Boolean(process.env.DATABASE_URL) || process.env.VERCEL !== "1";
}

export function normalizeLeadInput(
  input: PlatinumLeadInput,
): NormalizedPlatinumLeadInput {
  const firstName = asText(input.firstName);
  const lastName = asText(input.lastName);
  const email = asText(input.email).toLowerCase();
  const billingCycle = input.billingCycle === "yearly" ? "yearly" : "monthly";
  const jerseyTier = input.jerseyTier === "authentic" ? "authentic" : "fan";
  const paymentMethod = input.paymentMethod === "paypal" ? "paypal" : "card";
  const id = input.id && uuidPattern.test(input.id) ? input.id : undefined;

  if (!firstName) {
    throw new Error("El nombre es obligatorio.");
  }

  if (!emailPattern.test(email)) {
    throw new Error("Introduce un email válido.");
  }

  return {
    id,
    firstName,
    lastName,
    email,
    cardFirstName: asText(input.cardFirstName) || firstName,
    cardLastName: asText(input.cardLastName) || lastName,
    billingCycle,
    jerseyTier,
    addressLine1: asText(input.addressLine1),
    postalCode: asText(input.postalCode),
    city: asText(input.city),
    region: asText(input.region),
    country: asText(input.country) || "España",
    paymentMethod,
    legalTermsAccepted: Boolean(input.legalTermsAccepted),
  };
}

export async function savePlatinumLead(
  input: PlatinumLeadInput,
  status: "draft" | "checkout_started" = "draft",
  stripeCheckoutSessionId?: string,
  customerId?: string,
) {
  const lead = normalizeLeadInput(input);

  if (!canUseDatabase()) {
    return {
      id: lead.id ?? randomUUID(),
      email: lead.email,
      firstName: lead.firstName,
      lastName: lead.lastName,
      billingCycle: lead.billingCycle,
      jerseyTier: lead.jerseyTier,
    };
  }

  const pool = getPool();

  const result = await pool.query<PlatinumLead>(
    `
      insert into platinum_leads (
        id,
        email,
        first_name,
        last_name,
        card_first_name,
        card_last_name,
        billing_cycle,
        jersey_tier,
        payment_method_preference,
        address_line1,
        postal_code,
        city,
        region,
        country,
        legal_terms_accepted,
        status,
        stripe_checkout_session_id,
        customer_id,
        metadata
      )
      values (
        coalesce($1::uuid, gen_random_uuid()),
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13,
        $14,
        $15,
        $16,
        $17,
        $18::uuid,
        $19::jsonb
      )
      on conflict (id) do update set
        email = excluded.email,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        card_first_name = excluded.card_first_name,
        card_last_name = excluded.card_last_name,
        billing_cycle = excluded.billing_cycle,
        jersey_tier = excluded.jersey_tier,
        payment_method_preference = excluded.payment_method_preference,
        address_line1 = excluded.address_line1,
        postal_code = excluded.postal_code,
        city = excluded.city,
        region = excluded.region,
        country = excluded.country,
        legal_terms_accepted = excluded.legal_terms_accepted,
        status = excluded.status,
        stripe_checkout_session_id = coalesce(
          excluded.stripe_checkout_session_id,
          platinum_leads.stripe_checkout_session_id
        ),
        customer_id = coalesce(excluded.customer_id, platinum_leads.customer_id),
        metadata = excluded.metadata,
        updated_at = now()
      returning
        id,
        email,
        first_name as "firstName",
        last_name as "lastName",
        billing_cycle as "billingCycle",
        jersey_tier as "jerseyTier"
    `,
    [
      lead.id ?? null,
      lead.email,
      lead.firstName,
      lead.lastName,
      lead.cardFirstName,
      lead.cardLastName,
      lead.billingCycle,
      lead.jerseyTier,
      lead.paymentMethod,
      lead.addressLine1,
      lead.postalCode,
      lead.city,
      lead.region,
      lead.country,
      lead.legalTermsAccepted,
      status,
      stripeCheckoutSessionId ?? null,
      customerId ?? null,
      JSON.stringify({
        source: "madridista-platinum-poc",
        savedAt: new Date().toISOString(),
      }),
    ],
  );

  return result.rows[0];
}

export async function attachStripePaymentToLead({
  leadId,
  stripeCustomerId,
  stripePaymentMethodId,
  stripeCheckoutSessionId,
  amountCents,
  currency,
  status,
}: {
  leadId: string;
  stripeCustomerId?: string;
  stripePaymentMethodId?: string;
  stripeCheckoutSessionId?: string;
  amountCents?: number;
  currency?: string;
  status?: "checkout_started" | "paid" | "cancelled";
}) {
  if (!canUseDatabase()) {
    return;
  }

  const pool = getPool();

  await pool.query(
    `
      update platinum_leads
      set
        stripe_customer_id = coalesce($2, stripe_customer_id),
        stripe_payment_method_id = coalesce($3, stripe_payment_method_id),
        stripe_checkout_session_id = coalesce($4, stripe_checkout_session_id),
        amount_cents = coalesce($5, amount_cents),
        currency = coalesce($6, currency),
        status = coalesce($7, status),
        updated_at = now()
      where id = $1::uuid
    `,
    [
      leadId,
      stripeCustomerId ?? null,
      stripePaymentMethodId ?? null,
      stripeCheckoutSessionId ?? null,
      amountCents ?? null,
      currency ?? null,
      status ?? null,
    ],
  );
}

export async function setLeadCustomerId({
  leadId,
  customerId,
}: {
  leadId: string;
  customerId: string;
}) {
  if (!canUseDatabase()) {
    return;
  }

  const pool = getPool();

  await pool.query(
    `update platinum_leads set customer_id = $2::uuid, updated_at = now() where id = $1::uuid`,
    [leadId, customerId],
  );
}

export async function getLeadById(leadId: string) {
  if (!canUseDatabase()) {
    return null;
  }

  const pool = getPool();

  const result = await pool.query<PlatinumLeadRecord>(
    `
      select
        id,
        email,
        first_name as "firstName",
        last_name as "lastName",
        billing_cycle as "billingCycle",
        jersey_tier as "jerseyTier",
        status,
        stripe_customer_id as "stripeCustomerId",
        stripe_payment_method_id as "stripePaymentMethodId",
        stripe_checkout_session_id as "stripeCheckoutSessionId",
        amount_cents as "amountCents",
        currency,
        created_at as "createdAt"
      from platinum_leads
      where id = $1::uuid
      limit 1
    `,
    [leadId],
  );

  return result.rows[0] ?? null;
}

export async function listLeadsWithPaymentMethod() {
  if (!canUseDatabase()) {
    return [] as PlatinumLeadRecord[];
  }

  const pool = getPool();

  const result = await pool.query<PlatinumLeadRecord>(
    `
      select
        id,
        email,
        first_name as "firstName",
        last_name as "lastName",
        billing_cycle as "billingCycle",
        jersey_tier as "jerseyTier",
        status,
        stripe_customer_id as "stripeCustomerId",
        stripe_payment_method_id as "stripePaymentMethodId",
        stripe_checkout_session_id as "stripeCheckoutSessionId",
        amount_cents as "amountCents",
        currency,
        created_at as "createdAt"
      from platinum_leads
      where stripe_payment_method_id is not null
        and stripe_customer_id is not null
      order by created_at desc
      limit 100
    `,
  );

  return result.rows;
}

export async function updateLeadCheckoutStatus({
  leadId,
  stripeCheckoutSessionId,
  status,
}: {
  leadId: string;
  stripeCheckoutSessionId?: string;
  status?: "checkout_started" | "paid" | "cancelled";
}) {
  if (!canUseDatabase()) {
    return;
  }

  const pool = getPool();

  await pool.query(
    `
      update platinum_leads
      set
        stripe_checkout_session_id = coalesce($2, stripe_checkout_session_id),
        status = coalesce($3, status),
        updated_at = now()
      where id = $1::uuid
    `,
    [leadId, stripeCheckoutSessionId ?? null, status ?? null],
  );
}
