import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  normalizeLeadInput,
  savePlatinumLead,
  type BillingCycle,
  type JerseyTier,
  type PlatinumLeadInput,
} from "@/lib/platinum-leads";
import { getPricing } from "@/lib/platinum-pricing";

const stripe =
  process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith("sk_")
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : undefined;

function getSelectionKey(billingCycle: BillingCycle, jerseyTier: JerseyTier) {
  return `${billingCycle}_${jerseyTier}` as const;
}

function getFallbackPaymentLink(
  billingCycle: BillingCycle,
  jerseyTier: JerseyTier,
) {
  const key = getSelectionKey(billingCycle, jerseyTier);
  const links: Record<ReturnType<typeof getSelectionKey>, string | undefined> = {
    monthly_fan: process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PAYMENT_LINK_URL,
    yearly_fan: process.env.NEXT_PUBLIC_STRIPE_YEARLY_PAYMENT_LINK_URL,
    monthly_authentic:
      process.env.NEXT_PUBLIC_STRIPE_MONTHLY_AUTHENTIC_PAYMENT_LINK_URL,
    yearly_authentic:
      process.env.NEXT_PUBLIC_STRIPE_YEARLY_AUTHENTIC_PAYMENT_LINK_URL,
  };

  return links[key];
}

function addEmailToPaymentLink(url: string, email: string) {
  const paymentUrl = new URL(url);
  paymentUrl.searchParams.set("prefilled_email", email);
  return paymentUrl.toString();
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as PlatinumLeadInput;
    const normalized = normalizeLeadInput(payload);
    const lead = await savePlatinumLead(payload, "checkout_started");
    const pricing = getPricing(normalized.billingCycle, normalized.jerseyTier);
    const fallbackLink = getFallbackPaymentLink(
      normalized.billingCycle,
      normalized.jerseyTier,
    );

    if (stripe && pricing) {
      const origin =
        request.headers.get("origin") ||
        process.env.NEXT_PUBLIC_SITE_URL ||
        "http://localhost:3000";

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: normalized.email,
        client_reference_id: lead.id,
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
            lead_id: lead.id,
            billing_cycle: normalized.billingCycle,
            jersey_tier: normalized.jerseyTier,
            kind: "initial",
            source: "madridista-platinum-poc",
          },
        },
        metadata: {
          lead_id: lead.id,
          billing_cycle: normalized.billingCycle,
          jersey_tier: normalized.jerseyTier,
          payment_method_preference: normalized.paymentMethod,
          amount_cents: String(pricing.amountCents),
          currency: pricing.currency,
          source: "madridista-platinum-poc",
        },
        success_url: `${origin}/gracias?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?checkout=cancelled&lead=${lead.id}`,
      });

      if (!session.url) {
        throw new Error("Stripe no devolvió URL de Checkout.");
      }

      await savePlatinumLead(
        { ...payload, id: lead.id },
        "checkout_started",
        session.id,
      );

      return NextResponse.json({ id: lead.id, url: session.url });
    }

    if (fallbackLink) {
      return NextResponse.json({
        id: lead.id,
        url: addEmailToPaymentLink(fallbackLink, normalized.email),
      });
    }

    return NextResponse.json(
      {
        error:
          "No hay configuración de precios ni Payment Link para la combinación seleccionada.",
      },
      { status: 400 },
    );
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
