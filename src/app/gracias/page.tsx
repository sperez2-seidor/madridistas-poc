import Image from "next/image";
import Link from "next/link";

type ThankYouPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

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

export default async function ThankYouPage({
  searchParams,
}: ThankYouPageProps) {
  const params = searchParams ? await searchParams : {};
  const lead = getParam(params, "lead");
  const subscription = getParam(params, "subscription");
  const redirectStatus = getParam(params, "redirect_status");
  const needsReview = redirectStatus === "failed";

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
            : "Tu alta está en marcha."}
        </h1>
        <p>
          {needsReview
            ? "Revisa el método de pago para completar tu suscripción Platinum."
            : "Te enviaremos la confirmación y los próximos pasos al email indicado durante el alta."}
        </p>
        <div className="thank-you-reference">
          <span>Referencia</span>
          <strong>{getShortReference(subscription || lead)}</strong>
        </div>
        <div className="thank-you-actions">
          <Link className="flow-action thank-you-action" href="/">
            Volver al inicio
          </Link>
          {needsReview ? (
            <Link className="text-button thank-you-link" href="/alta">
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
