import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  attachStripePaymentToLead,
  updateLeadCheckoutStatus,
} from "@/lib/platinum-leads";
import { upsertChargeByPaymentIntent } from "@/lib/platinum-charges";

const stripe =
  process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith("sk_")
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : undefined;

function toId(value: unknown) {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

async function retrievePaymentIntent(paymentIntentId: string) {
  if (!stripe) {
    throw new Error("Stripe no está configurado.");
  }

  return stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["payment_method", "latest_charge"],
  });
}

async function syncCheckoutSession(session: Stripe.Checkout.Session) {
  const leadId = session.client_reference_id || session.metadata?.lead_id;
  if (!leadId) return;

  const paymentIntentId = toId(session.payment_intent);
  if (!paymentIntentId) {
    await updateLeadCheckoutStatus({
      leadId,
      stripeCheckoutSessionId: session.id,
      status: session.payment_status === "paid" ? "paid" : "checkout_started",
    });
    return;
  }

  const paymentIntent = await retrievePaymentIntent(paymentIntentId);
  const customerId = toId(session.customer) || toId(paymentIntent.customer);
  const paymentMethodId = toId(paymentIntent.payment_method);
  const chargeId = toId(paymentIntent.latest_charge);
  const amountCents = paymentIntent.amount_received || paymentIntent.amount;
  const currency = paymentIntent.currency;

  await attachStripePaymentToLead({
    leadId,
    stripeCustomerId: customerId,
    stripePaymentMethodId: paymentMethodId,
    stripeCheckoutSessionId: session.id,
    amountCents,
    currency,
    status: paymentIntent.status === "succeeded" ? "paid" : "checkout_started",
  });

  await upsertChargeByPaymentIntent({
    leadId,
    stripePaymentIntentId: paymentIntent.id,
    stripeChargeId: chargeId ?? null,
    kind: "initial",
    amountCents,
    currency,
    status: mapPaymentIntentStatus(paymentIntent.status),
    failureCode: paymentIntent.last_payment_error?.code ?? null,
    failureMessage: paymentIntent.last_payment_error?.message ?? null,
  });
}

function mapPaymentIntentStatus(
  status: Stripe.PaymentIntent.Status,
): "succeeded" | "failed" | "requires_action" | "processing" | "pending" {
  switch (status) {
    case "succeeded":
      return "succeeded";
    case "processing":
      return "processing";
    case "canceled":
      return "failed";
    case "requires_action":
    case "requires_confirmation":
    case "requires_payment_method":
      return "requires_action";
    default:
      return "pending";
  }
}

async function syncPaymentIntent(paymentIntent: Stripe.PaymentIntent) {
  const leadId = paymentIntent.metadata?.lead_id;
  const chargeId = toId(paymentIntent.latest_charge);

  await upsertChargeByPaymentIntent({
    leadId: leadId ?? null,
    stripePaymentIntentId: paymentIntent.id,
    stripeChargeId: chargeId ?? null,
    amountCents: paymentIntent.amount_received || paymentIntent.amount,
    currency: paymentIntent.currency,
    status: mapPaymentIntentStatus(paymentIntent.status),
    failureCode: paymentIntent.last_payment_error?.code ?? null,
    failureMessage: paymentIntent.last_payment_error?.message ?? null,
  });
}

export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json(
      { error: "Configura STRIPE_SECRET_KEY para recibir webhooks." },
      { status: 400 },
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Configura STRIPE_WEBHOOK_SECRET para verificar webhooks." },
      { status: 400 },
    );
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Falta la firma de Stripe." },
      { status: 400 },
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      await request.text(),
      signature,
      webhookSecret,
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo verificar el webhook.",
      },
      { status: 400 },
    );
  }

  if (event.type === "checkout.session.completed") {
    await syncCheckoutSession(event.data.object as Stripe.Checkout.Session);
    return NextResponse.json({ received: true });
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    const leadId = session.client_reference_id || session.metadata?.lead_id;

    if (leadId) {
      await updateLeadCheckoutStatus({
        leadId,
        stripeCheckoutSessionId: session.id,
        status: "cancelled",
      });
    }

    return NextResponse.json({ received: true });
  }

  if (
    event.type === "payment_intent.succeeded" ||
    event.type === "payment_intent.payment_failed" ||
    event.type === "payment_intent.processing" ||
    event.type === "payment_intent.canceled"
  ) {
    await syncPaymentIntent(event.data.object as Stripe.PaymentIntent);
    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true });
}
