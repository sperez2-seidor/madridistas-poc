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

export function normalizeLeadInput(
  input: PlatinumLeadInput,
): NormalizedPlatinumLeadInput {
  const firstName = asText(input.firstName);
  const lastName = asText(input.lastName);
  const email = asText(input.email).toLowerCase();
  const billingCycle = input.billingCycle === "yearly" ? "yearly" : "monthly";
  const jerseyTier = input.jerseyTier === "authentic" ? "authentic" : "fan";
  const paymentMethod = input.paymentMethod === "card" ? "card" : "paypal";
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
) {
  const lead = normalizeLeadInput(input);
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
        $18::jsonb
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
      JSON.stringify({
        source: "madridista-platinum-poc",
        savedAt: new Date().toISOString(),
      }),
    ],
  );

  return result.rows[0];
}
