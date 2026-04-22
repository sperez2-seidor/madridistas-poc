import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  getCustomerByEmail,
  getCustomerById,
} from "@/lib/platinum-customers";

const stripe =
  process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith("sk_")
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : undefined;

type UpdateRequest = {
  customerId?: string;
  email?: string;
  pendingChargeId?: string;
};

export async function POST(request: Request) {
  try {
    if (!stripe) {
      return NextResponse.json(
        { error: "Configura STRIPE_SECRET_KEY para emitir el link." },
        { status: 400 },
      );
    }

    const payload = (await request.json()) as UpdateRequest;

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

    if (!customer.stripeCustomerId) {
      return NextResponse.json(
        { error: "El cliente todavía no tiene Stripe customer asociado." },
        { status: 400 },
      );
    }

    const origin =
      request.headers.get("origin") ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: customer.stripeCustomerId,
      payment_method_types: ["card"],
      success_url: `${origin}/backoffice?card_updated=${customer.id}`,
      cancel_url: `${origin}/backoffice?card_update_cancelled=${customer.id}`,
      metadata: {
        customer_id: customer.id,
        reason: "card_update",
        pending_charge_id: payload.pendingChargeId ?? "",
        source: "madridista-backoffice",
      },
    });

    if (!session.url) {
      throw new Error("Stripe no devolvió URL de Checkout.");
    }

    return NextResponse.json({
      ok: true,
      url: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo emitir el link de cambio de tarjeta.",
      },
      { status: 400 },
    );
  }
}
