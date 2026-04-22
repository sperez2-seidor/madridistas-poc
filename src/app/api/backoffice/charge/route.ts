import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  getCustomerById,
  getCustomerByEmail,
} from "@/lib/platinum-customers";
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
  customerId?: string;
  email?: string;
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

    if (!payload.customerId && !payload.email) {
      return NextResponse.json(
        { error: "Falta customerId o email." },
        { status: 400 },
      );
    }

    const customer = payload.customerId
      ? await getCustomerById(payload.customerId)
      : await getCustomerByEmail(payload.email as string);

    if (!customer) {
      return NextResponse.json(
        { error: "Cliente no encontrado en la BBDD intermedia." },
        { status: 404 },
      );
    }

    if (!customer.stripeCustomerId || !customer.stripePaymentMethodId) {
      return NextResponse.json(
        { error: "El cliente no tiene método de pago guardado." },
        { status: 400 },
      );
    }

    const pricing =
      customer.billingCycle && customer.jerseyTier
        ? getPricing(customer.billingCycle, customer.jerseyTier)
        : null;
    const amountCents =
      payload.amountCents ?? customer.amountCents ?? pricing?.amountCents;
    const currency =
      payload.currency ?? customer.currency ?? pricing?.currency;

    if (!amountCents || !currency) {
      return NextResponse.json(
        { error: "No se pudo determinar importe o divisa del cobro." },
        { status: 400 },
      );
    }

    const pendingChargeId = await insertCharge({
      customerId: customer.id,
      kind: "recurring",
      amountCents,
      currency,
      status: "processing",
    });

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency,
        customer: customer.stripeCustomerId,
        payment_method: customer.stripePaymentMethodId,
        off_session: true,
        confirm: true,
        metadata: {
          customer_id: customer.id,
          kind: "recurring",
          billing_cycle: customer.billingCycle ?? "",
          jersey_tier: customer.jerseyTier ?? "",
          source: "madridista-backoffice",
          charge_id: pendingChargeId ?? "",
        },
      });

      await upsertChargeByPaymentIntent({
        customerId: customer.id,
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
          customerId: customer.id,
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
