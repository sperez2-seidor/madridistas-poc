import Stripe from "stripe";
import Image from "next/image";
import Link from "next/link";

type ThankYouPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const stripe =
  process.env.STRIPE_SECRET_KEY &&
  process.env.STRIPE_SECRET_KEY.startsWith("sk_")
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : undefined;

function getParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function getShortReference(value?: string) {
  if (!value) {
    return "Madridista Platinum";
  }

  return value.slice(-8).toUpperCase();
}

function toId(value: unknown) {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

export default async function ThankYouPage({
  searchParams,
}: ThankYouPageProps) {
  const params = searchParams ? await searchParams : {};
  const lead = getParam(params, "lead");
  const sessionId = getParam(params, "session_id");
  const redirectStatus = getParam(params, "redirect_status");

  let checkoutSession: Stripe.Checkout.Session | null | undefined;

  if (stripe && sessionId) {
    try {
      checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["payment_intent"],
      });
    } catch {
      checkoutSession = null;
    }
  }

  const paymentIntentId = toId(checkoutSession?.payment_intent);
  const referenceSource =
    paymentIntentId || lead || sessionId;
  const isConfirmed =
    checkoutSession?.payment_status === "paid" ||
    checkoutSession?.status === "complete" ||
    redirectStatus === "succeeded" ||
    redirectStatus === "paid";
  const needsReview =
    redirectStatus === "failed" ||
    checkoutSession?.status === "open" ||
    checkoutSession?.payment_status === "unpaid";

  return (
    <main className="thank-you-page">
      <header className="thank-you-header">
        <Link className="thank-you-brand" href="/" aria-label="Madridistas">
          <Image
            src="/madridistas-logo-white.svg"
            alt="Madridistas"
            width={128}
            height={37}
            priority
          />
        </Link>
        <nav className="language-switch" aria-label="Idioma">
          <span>ES</span>
          <i />
          <span>EN</span>
        </nav>
      </header>

      <section className="thank-you-hero" aria-label="Alta completada">
        <p className="step-kicker">Madridista Platinum</p>
        <h1>
          {needsReview
            ? "No hemos podido confirmar el pago."
            : isConfirmed
              ? "Tu primer pago está confirmado."
              : "Tu alta está en marcha."}
        </h1>
        <p>
          {needsReview
            ? "Revisa el método de pago para completar tu alta Platinum."
            : isConfirmed
              ? "Hemos guardado tu tarjeta para los próximos cobros. Te enviaremos la confirmación al email del alta."
              : "Estamos revisando la confirmación de Stripe y te mandaremos el detalle al email del alta."}
        </p>
        <div className="thank-you-reference">
          <span>Referencia</span>
          <strong>{getShortReference(referenceSource)}</strong>
        </div>
        {checkoutSession?.customer_details?.email ? (
          <p className="thank-you-email">
            Email: {checkoutSession.customer_details.email}
          </p>
        ) : null}
        <div className="thank-you-actions">
          <Link className="flow-action thank-you-action" href="/">
            Volver al inicio
          </Link>
          {needsReview ? (
            <Link className="text-button thank-you-link" href="/checkout">
              Intentarlo de nuevo
            </Link>
          ) : null}
        </div>
      </section>

      {!needsReview ? (
        <section className="thank-you-next" aria-label="Próximos pasos">
          <div>
            <span>01</span>
            <h2>Confirmación</h2>
            <p>Recibirás el detalle de tu suscripción Platinum.</p>
          </div>
          <div>
            <span>02</span>
            <h2>Welcome Pack</h2>
            <p>Prepararemos el envío al domicilio seleccionado.</p>
          </div>
          <div>
            <span>03</span>
            <h2>Camiseta</h2>
            <p>Podrás seguir el progreso desde tu área privada.</p>
          </div>
        </section>
      ) : null}
    </main>
  );
}
