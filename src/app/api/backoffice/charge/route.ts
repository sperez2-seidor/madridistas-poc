import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getLeadById } from "@/lib/platinum-leads";
import {
  insertCharge,
  upsertChargeByPaymentIntent,
} from "@/lib/platinum-charges";
import { getPricing } from "@/lib/platinum-pricing";

const stripe =
  process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith("sk_")
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : undefined;

type ChargeRequest = {
  leadId?: string;
  amountCents?: number;
  currency?: string;
};

export async function POST(request: Request) {
  try {
    if (!stripe) {
      return NextResponse.json(
        { error: "Configura STRIPE_SECRET_KEY para ejecutar cobros." },
        { status: 400 },
      );
    }

    const payload = (await request.json()) as ChargeRequest;
    const leadId = payload.leadId;

    if (!leadId) {
      return NextResponse.json(
        { error: "Falta leadId." },
        { status: 400 },
      );
    }

    const lead = await getLeadById(leadId);
    if (!lead) {
      return NextResponse.json(
        { error: "Lead no encontrado." },
        { status: 404 },
      );
    }

    if (!lead.stripeCustomerId || !lead.stripePaymentMethodId) {
      return NextResponse.json(
        { error: "El lead no tiene método de pago guardado." },
        { status: 400 },
      );
    }

    const pricing = getPricing(lead.billingCycle, lead.jerseyTier);
    const amountCents =
      payload.amountCents ?? lead.amountCents ?? pricing?.amountCents;
    const currency =
      payload.currency ?? lead.currency ?? pricing?.currency;

    if (!amountCents || !currency) {
      return NextResponse.json(
        { error: "No se pudo determinar importe o divisa del cobro." },
        { status: 400 },
      );
    }

    const pendingChargeId = await insertCharge({
      leadId: lead.id,
      kind: "recurring",
      amountCents,
      currency,
      status: "processing",
    });

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency,
        customer: lead.stripeCustomerId,
        payment_method: lead.stripePaymentMethodId,
        off_session: true,
        confirm: true,
        metadata: {
          lead_id: lead.id,
          kind: "recurring",
          billing_cycle: lead.billingCycle,
          jersey_tier: lead.jerseyTier,
          source: "madridista-backoffice",
          charge_id: pendingChargeId ?? "",
        },
      });

      await upsertChargeByPaymentIntent({
        leadId: lead.id,
        stripePaymentIntentId: paymentIntent.id,
        stripeChargeId:
          typeof paymentIntent.latest_charge === "string"
            ? paymentIntent.latest_charge
            : paymentIntent.latest_charge?.id ?? null,
        kind: "recurring",
        amountCents,
        currency,
        status:
          paymentIntent.status === "succeeded"
            ? "succeeded"
            : paymentIntent.status === "processing"
              ? "processing"
              : paymentIntent.status === "requires_action"
                ? "requires_action"
                : "pending",
      });

      return NextResponse.json({
        ok: true,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
      });
    } catch (error) {
      const stripeError = error as {
        code?: string;
        message?: string;
        payment_intent?: { id?: string };
      };
      const paymentIntentId = stripeError.payment_intent?.id ?? null;

      if (paymentIntentId) {
        await upsertChargeByPaymentIntent({
          leadId: lead.id,
          stripePaymentIntentId: paymentIntentId,
          kind: "recurring",
          amountCents,
          currency,
          status: "failed",
          failureCode: stripeError.code ?? null,
          failureMessage: stripeError.message ?? null,
        });
      }

      return NextResponse.json(
        {
          ok: false,
          error: stripeError.message ?? "El cobro ha fallado.",
          code: stripeError.code,
          paymentIntentId,
        },
        { status: 402 },
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo ejecutar el cobro.",
      },
      { status: 400 },
    );
  }
}
