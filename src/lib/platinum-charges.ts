import { getPool } from "./db";

export type ChargeKind = "initial" | "recurring";
export type ChargeStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "requires_action";

export type PlatinumCharge = {
  id: string;
  leadId: string;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
  kind: ChargeKind;
  amountCents: number;
  currency: string;
  status: ChargeStatus;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

function canUseDatabase() {
  return Boolean(process.env.DATABASE_URL) || process.env.VERCEL !== "1";
}

export async function insertCharge({
  leadId,
  stripePaymentIntentId,
  kind,
  amountCents,
  currency,
  status,
  failureCode,
  failureMessage,
}: {
  leadId: string;
  stripePaymentIntentId?: string | null;
  kind: ChargeKind;
  amountCents: number;
  currency: string;
  status: ChargeStatus;
  failureCode?: string | null;
  failureMessage?: string | null;
}) {
  if (!canUseDatabase()) {
    return null;
  }

  const pool = getPool();

  const result = await pool.query<{ id: string }>(
    `
      insert into platinum_charges (
        lead_id,
        stripe_payment_intent_id,
        kind,
        amount_cents,
        currency,
        status,
        failure_code,
        failure_message
      )
      values ($1::uuid, $2, $3, $4, $5, $6, $7, $8)
      returning id
    `,
    [
      leadId,
      stripePaymentIntentId ?? null,
      kind,
      amountCents,
      currency,
      status,
      failureCode ?? null,
      failureMessage ?? null,
    ],
  );

  return result.rows[0]?.id ?? null;
}

export async function upsertChargeByPaymentIntent({
  leadId,
  stripePaymentIntentId,
  stripeChargeId,
  kind,
  amountCents,
  currency,
  status,
  failureCode,
  failureMessage,
}: {
  leadId?: string | null;
  stripePaymentIntentId: string;
  stripeChargeId?: string | null;
  kind?: ChargeKind;
  amountCents: number;
  currency: string;
  status: ChargeStatus;
  failureCode?: string | null;
  failureMessage?: string | null;
}) {
  if (!canUseDatabase()) {
    return;
  }

  const pool = getPool();

  const existing = await pool.query<{ id: string }>(
    `select id from platinum_charges where stripe_payment_intent_id = $1 limit 1`,
    [stripePaymentIntentId],
  );

  if (existing.rows[0]) {
    await pool.query(
      `
        update platinum_charges
        set
          status = $2,
          stripe_charge_id = coalesce($3, stripe_charge_id),
          failure_code = $4,
          failure_message = $5,
          updated_at = now()
        where id = $1::uuid
      `,
      [
        existing.rows[0].id,
        status,
        stripeChargeId ?? null,
        failureCode ?? null,
        failureMessage ?? null,
      ],
    );
    return;
  }

  if (!leadId) {
    return;
  }

  await pool.query(
    `
      insert into platinum_charges (
        lead_id,
        stripe_payment_intent_id,
        stripe_charge_id,
        kind,
        amount_cents,
        currency,
        status,
        failure_code,
        failure_message
      )
      values ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      leadId,
      stripePaymentIntentId,
      stripeChargeId ?? null,
      kind ?? "recurring",
      amountCents,
      currency,
      status,
      failureCode ?? null,
      failureMessage ?? null,
    ],
  );
}

export async function listChargesByLead(leadId: string) {
  if (!canUseDatabase()) {
    return [] as PlatinumCharge[];
  }

  const pool = getPool();

  const result = await pool.query<PlatinumCharge>(
    `
      select
        id,
        lead_id as "leadId",
        stripe_payment_intent_id as "stripePaymentIntentId",
        stripe_charge_id as "stripeChargeId",
        kind,
        amount_cents as "amountCents",
        currency,
        status,
        failure_code as "failureCode",
        failure_message as "failureMessage",
        created_at as "createdAt",
        updated_at as "updatedAt"
      from platinum_charges
      where lead_id = $1::uuid
      order by created_at desc
      limit 50
    `,
    [leadId],
  );

  return result.rows;
}

export async function listRecentCharges(limit = 200) {
  if (!canUseDatabase()) {
    return [] as PlatinumCharge[];
  }

  const pool = getPool();

  const result = await pool.query<PlatinumCharge>(
    `
      select
        id,
        lead_id as "leadId",
        stripe_payment_intent_id as "stripePaymentIntentId",
        stripe_charge_id as "stripeChargeId",
        kind,
        amount_cents as "amountCents",
        currency,
        status,
        failure_code as "failureCode",
        failure_message as "failureMessage",
        created_at as "createdAt",
        updated_at as "updatedAt"
      from platinum_charges
      order by created_at desc
      limit $1
    `,
    [limit],
  );

  return result.rows;
}
