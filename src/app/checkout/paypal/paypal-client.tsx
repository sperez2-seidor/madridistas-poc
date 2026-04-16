"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

function buildThankYouHref(details: {
  email: string;
  lead: string;
}) {
  const params = new URLSearchParams({
    redirect_status: "succeeded",
    paymentMethod: "paypal",
  });

  if (details.lead) {
    params.set("lead", details.lead);
  }

  if (details.email) {
    params.set("email", details.email);
  }

  return `/gracias?${params.toString()}`;
}

export default function PaypalCheckoutClient({
  email,
  firstName,
  lead,
}: {
  email: string;
  firstName: string;
  lead: string;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const thankYouHref = useMemo(
    () => buildThankYouHref({ email, lead }),
    [email, lead],
  );

  function handlePayPalMock() {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    window.setTimeout(() => {
      router.push(thankYouHref);
    }, 900);
  }

  return (
    <main className="paypal-mock-page">
      <header className="paypal-header">
        <Link className="paypal-back" href="/checkout">
          ← Volver
        </Link>
        <Image
          className="paypal-logo"
          src="/madridistas-logo-white.svg"
          alt="Madridistas"
          width={128}
          height={37}
          priority
        />
        <span />
      </header>

      <section className="paypal-shell" aria-label="Pago con PayPal">
        <div className="paypal-card">
          <p className="step-kicker">PayPal mock</p>
          <h1>Confirma el pago de tu suscripción</h1>
          <p className="step-copy">
            Esta pantalla simula la experiencia de PayPal antes de volver a la
            página de agradecimiento.
          </p>

          <div className="paypal-summary">
            <div>
              <span>Cliente</span>
              <strong>{firstName}</strong>
            </div>
            <div>
              <span>Email</span>
              <strong>{email}</strong>
            </div>
          </div>

          <button
            className="flow-action paypal-action"
            disabled={isSubmitting}
            onClick={handlePayPalMock}
            type="button"
          >
            {isSubmitting ? "Redirigiendo..." : "Pagar con PayPal"}
          </button>

          <Link className="text-button paypal-link" href={thankYouHref}>
            Ir directamente al thank you page
          </Link>
        </div>
      </section>
    </main>
  );
}
