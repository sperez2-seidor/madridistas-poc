import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  attachStripeSubscriptionToLead,
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

function getInvoiceClientSecret(subscription: Stripe.Subscription) {
  const latestInvoice = subscription.latest_invoice as
    | {
        confirmation_secret?: {
          client_secret?: string | null;
        } | null;
      }
    | null
    | undefined;

  return latestInvoice?.confirmation_secret?.client_secret;
}

function getSubscriptionPriceIds(subscription: Stripe.Subscription) {
  const price = subscription.items.data[0]?.price;
  const product = price?.product;

  return {
    priceId: price?.id,
    productId: typeof product === "string" ? product : product?.id,
  };
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

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [
        {
          price: priceId,
        },
      ],
      billing_mode: {
        type: "flexible",
      },
      payment_behavior: "default_incomplete",
      payment_settings: {
        payment_method_types: ["card"],
        save_default_payment_method: "on_subscription",
      },
      metadata: {
        lead_id: lead.id,
        billing_cycle: normalized.billingCycle,
        jersey_tier: normalized.jerseyTier,
        source: "madridista-platinum-poc",
      },
      expand: ["latest_invoice.confirmation_secret"],
    });

    const clientSecret = getInvoiceClientSecret(subscription);
    const { priceId: stripePriceId, productId: stripeProductId } =
      getSubscriptionPriceIds(subscription);

    if (!clientSecret) {
      return NextResponse.json(
        { error: "Stripe no devolvió el client secret de la suscripción." },
        { status: 400 },
      );
    }

    await attachStripeSubscriptionToLead({
      id: lead.id,
      stripeCustomerId: customer.id,
      stripeSubscriptionId: subscription.id,
      stripeSubscriptionStatus: subscription.status,
      stripePriceId,
      stripeProductId,
    });

    return NextResponse.json({
      id: lead.id,
      clientSecret,
      subscriptionId: subscription.id,
      customerId: customer.id,
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
