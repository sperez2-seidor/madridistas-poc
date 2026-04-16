import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  normalizeLeadInput,
  savePlatinumLead,
  type BillingCycle,
  type JerseyTier,
  type PlatinumLeadInput,
} from "@/lib/platinum-leads";

const stripe =
  process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith("sk_")
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : undefined;

function getSelectionKey(billingCycle: BillingCycle, jerseyTier: JerseyTier) {
  return `${billingCycle}_${jerseyTier}` as const;
}

function getPriceId(billingCycle: BillingCycle, jerseyTier: JerseyTier) {
  const key = getSelectionKey(billingCycle, jerseyTier);
  const priceIds: Record<ReturnType<typeof getSelectionKey>, string | undefined> = {
    monthly_fan: process.env.STRIPE_MONTHLY_PRICE_ID,
    yearly_fan: process.env.STRIPE_YEARLY_PRICE_ID,
    monthly_authentic: process.env.STRIPE_MONTHLY_AUTHENTIC_PRICE_ID,
    yearly_authentic: process.env.STRIPE_YEARLY_AUTHENTIC_PRICE_ID,
  };

  return priceIds[key];
}

function getCountryCode(country: string) {
  const countries: Record<string, string> = {
    alemania: "DE",
    españa: "ES",
    espana: "ES",
    "estados unidos": "US",
    francia: "FR",
    italia: "IT",
    "reino unido": "GB",
  };

  return countries[country.trim().toLowerCase()] || undefined;
}

function shouldEnableAutomaticTax() {
  return process.env.STRIPE_AUTOMATIC_TAX_ENABLED !== "false";
}

export async function POST(request: Request) {
  try {
    if (!stripe) {
      return NextResponse.json(
        { error: "Configura STRIPE_SECRET_KEY para preparar el pago." },
        { status: 400 },
      );
    }

    const payload = (await request.json()) as PlatinumLeadInput;
    const normalized = normalizeLeadInput(payload);
    const priceId = getPriceId(normalized.billingCycle, normalized.jerseyTier);

    if (!priceId) {
      return NextResponse.json(
        {
          error:
            "No hay Price ID configurado para la combinación seleccionada.",
        },
        { status: 400 },
      );
    }

    const lead = await savePlatinumLead(
      { ...payload, paymentMethod: "card" },
      "checkout_started",
    );

    const customer = await stripe.customers.create({
      email: normalized.email,
      name: `${normalized.firstName} ${normalized.lastName}`.trim(),
      address: {
        city: normalized.city || undefined,
        country: getCountryCode(normalized.country),
        line1: normalized.addressLine1 || undefined,
        postal_code: normalized.postalCode || undefined,
        state: normalized.region || undefined,
      },
      shipping: {
        name: `${normalized.firstName} ${normalized.lastName}`.trim(),
        address: {
          city: normalized.city || undefined,
          country: getCountryCode(normalized.country),
          line1: normalized.addressLine1 || undefined,
          postal_code: normalized.postalCode || undefined,
          state: normalized.region || undefined,
        },
      },
      metadata: {
        lead_id: lead.id,
        billing_cycle: normalized.billingCycle,
        card_name: `${normalized.cardFirstName} ${normalized.cardLastName}`.trim(),
        jersey_tier: normalized.jerseyTier,
        source: "madridista-platinum-poc",
      },
    });

    const origin =
      request.headers.get("origin") ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded_page",
      mode: "subscription",
      customer: customer.id,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      client_reference_id: lead.id,
      metadata: {
        lead_id: lead.id,
        billing_cycle: normalized.billingCycle,
        jersey_tier: normalized.jerseyTier,
        source: "madridista-platinum-poc",
      },
      subscription_data: {
        metadata: {
          lead_id: lead.id,
          billing_cycle: normalized.billingCycle,
          jersey_tier: normalized.jerseyTier,
          source: "madridista-platinum-poc",
        },
      },
      return_url: `${origin}/gracias?session_id={CHECKOUT_SESSION_ID}`,
      ...(shouldEnableAutomaticTax()
        ? {
            automatic_tax: {
              enabled: true,
            },
          }
        : {}),
    });

    if (!session.client_secret) {
      return NextResponse.json(
        { error: "Stripe no devolvió el client secret de Checkout." },
        { status: 400 },
      );
    }

    await savePlatinumLead(
      { ...payload, id: lead.id, paymentMethod: "card" },
      "checkout_started",
      session.id,
    );

    return NextResponse.json({
      id: lead.id,
      clientSecret: session.client_secret,
      checkoutSessionId: session.id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo preparar el pago.",
      },
      { status: 400 },
    );
  }
}
