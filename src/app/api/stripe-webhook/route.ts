import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  updateLeadCheckoutStatus,
  updateLeadStripeSubscriptionStatus,
} from "@/lib/platinum-leads";

const stripe =
  process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith("sk_")
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : undefined;

function getSubscriptionId(value: unknown) {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : undefined;
  }

  return undefined;
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice) {
  const invoiceWithLegacySubscription = invoice as Stripe.Invoice & {
    subscription?: unknown;
    parent?: {
      subscription_details?: {
        subscription?: unknown;
      } | null;
    } | null;
  };

  return (
    getSubscriptionId(invoiceWithLegacySubscription.subscription) ||
    getSubscriptionId(
      invoiceWithLegacySubscription.parent?.subscription_details?.subscription,
    )
  );
}

function getProductId(price?: Stripe.Price) {
  if (!price) {
    return undefined;
  }

  return typeof price.product === "string" ? price.product : price.product.id;
}

function getLeadStatus(subscriptionStatus: Stripe.Subscription.Status) {
  if (subscriptionStatus === "active" || subscriptionStatus === "trialing") {
    return "paid";
  }

  if (
    subscriptionStatus === "canceled" ||
    subscriptionStatus === "incomplete_expired" ||
    subscriptionStatus === "unpaid"
  ) {
    return "cancelled";
  }

  return "checkout_started";
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const price = subscription.items.data[0]?.price;
  const latestInvoiceId = getSubscriptionId(subscription.latest_invoice);

  await updateLeadStripeSubscriptionStatus({
    leadId: subscription.metadata.lead_id,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: getSubscriptionId(subscription.customer),
    stripeSubscriptionStatus: subscription.status,
    stripePriceId: price?.id,
    stripeProductId: getProductId(price),
    stripeLatestInvoiceId: latestInvoiceId,
    status: getLeadStatus(subscription.status),
  });
}

async function syncCheckoutSession(session: Stripe.Checkout.Session) {
  const subscriptionId = getSubscriptionId(session.subscription);

  if (!subscriptionId) {
    return;
  }

  const subscription = await retrieveSubscription(subscriptionId);
  const customerId = getSubscriptionId(session.customer) || getSubscriptionId(subscription.customer);
  const price = subscription.items.data[0]?.price;
  const latestInvoiceId = getSubscriptionId(subscription.latest_invoice);
  const leadId = session.client_reference_id || session.metadata?.lead_id;

  await updateLeadStripeSubscriptionStatus({
    leadId,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: customerId,
    stripeCheckoutSessionId: session.id,
    stripeSubscriptionStatus: subscription.status,
    stripePriceId: price?.id,
    stripeProductId: getProductId(price),
    stripeLatestInvoiceId: latestInvoiceId,
    status: getLeadStatus(subscription.status),
  });
}

async function retrieveSubscription(subscriptionId: string) {
  if (!stripe) {
    throw new Error("Stripe no está configurado.");
  }

  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price.product", "latest_invoice"],
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

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    await syncSubscription(event.data.object as Stripe.Subscription);
    return NextResponse.json({ received: true });
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

  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = getInvoiceSubscriptionId(invoice);

    if (subscriptionId) {
      await syncSubscription(await retrieveSubscription(subscriptionId));
    }

    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true });
}
