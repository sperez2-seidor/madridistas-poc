import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  attachStripeCustomerId,
  upsertLocalCustomer,
} from "@/lib/platinum-customers";
import {
  getPricing,
  type BillingCycle,
  type JerseyTier,
} from "@/lib/platinum-pricing";

const stripe =
  process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith("sk_")
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : undefined;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type CheckoutInput = {
  firstName?: string;
  lastName?: string;
  email?: string;
  billingCycle?: BillingCycle;
  jerseyTier?: JerseyTier;
};

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(input: CheckoutInput) {
  const firstName = asText(input.firstName);
  const lastName = asText(input.lastName);
  const email = asText(input.email).toLowerCase();
  const billingCycle: BillingCycle =
    input.billingCycle === "yearly" ? "yearly" : "monthly";
  const jerseyTier: JerseyTier =
    input.jerseyTier === "authentic" ? "authentic" : "fan";

  if (!firstName) {
    throw new Error("El nombre es obligatorio.");
  }

  if (!emailPattern.test(email)) {
    throw new Error("Introduce un email válido.");
  }

  return { firstName, lastName, email, billingCycle, jerseyTier };
}

export async function POST(request: Request) {
  try {
    if (!stripe) {
      return NextResponse.json(
        { error: "Configura STRIPE_SECRET_KEY para iniciar el pago." },
        { status: 400 },
      );
    }

    const payload = (await request.json()) as CheckoutInput;
    const normalized = normalize(payload);
    const pricing = getPricing(normalized.billingCycle, normalized.jerseyTier);

    if (!pricing) {
      return NextResponse.json(
        { error: "Plan no disponible." },
        { status: 400 },
      );
    }

    const customer = await upsertLocalCustomer({
      email: normalized.email,
      firstName: normalized.firstName,
      lastName: normalized.lastName,
      billingCycle: normalized.billingCycle,
      jerseyTier: normalized.jerseyTier,
      amountCents: pricing.amountCents,
      currency: pricing.currency,
    });

    let stripeCustomerId = customer?.stripeCustomerId ?? null;

    if (!stripeCustomerId) {
      const stripeCustomer = await stripe.customers.create({
        email: normalized.email,
        name: `${normalized.firstName} ${normalized.lastName}`.trim(),
        metadata: {
          local_customer_id: customer?.id ?? "",
          source: "madridista-platinum-poc",
        },
      });
      stripeCustomerId = stripeCustomer.id;
      if (customer?.id) {
        await attachStripeCustomerId({
          id: customer.id,
          stripeCustomerId,
        });
      }
    }

    const origin =
      request.headers.get("origin") ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: stripeCustomerId,
      line_items: [
        {
          price_data: {
            currency: pricing.currency,
            product_data: {
              name: pricing.label,
            },
            unit_amount: pricing.amountCents,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        setup_future_usage: "off_session",
        metadata: {
          customer_id: customer?.id ?? "",
          billing_cycle: normalized.billingCycle,
          jersey_tier: normalized.jerseyTier,
          kind: "initial",
          source: "madridista-platinum-poc",
        },
      },
      saved_payment_method_options: {
        payment_method_save: "enabled",
      },
      metadata: {
        customer_id: customer?.id ?? "",
        billing_cycle: normalized.billingCycle,
        jersey_tier: normalized.jerseyTier,
        amount_cents: String(pricing.amountCents),
        currency: pricing.currency,
        source: "madridista-platinum-poc",
      },
      success_url: `${origin}/gracias?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancelled`,
    });

    if (!session.url) {
      throw new Error("Stripe no devolvió URL de Checkout.");
    }

    return NextResponse.json({ id: customer?.id ?? null, url: session.url });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo iniciar el pago.",
      },
      { status: 400 },
    );
  }
}
