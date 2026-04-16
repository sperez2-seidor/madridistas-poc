"use client";

import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import Image from "next/image";
import { FormEvent, useMemo, useState } from "react";

type BillingCycle = "monthly" | "yearly";
type JerseyTier = "fan" | "authentic";
type PaymentMethod = "paypal" | "card";
type Step =
  | "profile"
  | "plan"
  | "card"
  | "card-name"
  | "address"
  | "delivery"
  | "payment";

type LeadForm = {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  cardFirstName: string;
  cardLastName: string;
  billingCycle: BillingCycle;
  jerseyTier: JerseyTier;
  addressLine1: string;
  postalCode: string;
  city: string;
  region: string;
  country: string;
  paymentMethod: PaymentMethod;
  legalTermsAccepted: boolean;
};

type PlanOption = {
  billingCycle: BillingCycle;
  label: string;
  price: string;
  help: string;
};

type JerseyOption = {
  jerseyTier: JerseyTier;
  title: string;
  description: string;
  monthly: string;
  yearly: string;
};

const initialForm: LeadForm = {
  firstName: "",
  lastName: "",
  email: "",
  cardFirstName: "",
  cardLastName: "",
  billingCycle: "monthly",
  jerseyTier: "fan",
  addressLine1: "",
  postalCode: "",
  city: "",
  region: "",
  country: "España",
  paymentMethod: "card",
  legalTermsAccepted: false,
};

const mainSteps: Step[] = [
  "profile",
  "plan",
  "card",
  "address",
  "delivery",
  "payment",
];

const planOptions: PlanOption[] = [
  {
    billingCycle: "monthly",
    label: "Suscripción mensual",
    price: "Desde 12,90 €/mes",
    help: "Elige ahora tu camiseta y te la enviamos en el mes 12.",
  },
  {
    billingCycle: "yearly",
    label: "Suscripción anual",
    price: "Desde 149,90 €/año",
    help: "Elige ahora tu camiseta y personalízala en los próximos pasos.",
  },
];

const jerseyOptions: JerseyOption[] = [
  {
    jerseyTier: "fan",
    title: "Suscripción + Camiseta*",
    description: "La camiseta oficial de los aficionados.",
    monthly: "12,90 €/mes",
    yearly: "149,90 €/año",
  },
  {
    jerseyTier: "authentic",
    title: "Suscripción + Camiseta Authentic*",
    description:
      "La camiseta idéntica a la que usan los jugadores en cada partido.",
    monthly: "16,90 €/mes",
    yearly: "194,90 €/año",
  },
];

const stepLabels: Record<Step, string> = {
  profile: "Datos",
  plan: "Plan",
  card: "Carnet",
  "card-name": "Nombre",
  address: "Envío",
  delivery: "Camiseta",
  payment: "Pago",
};

function stepIndex(step: Step) {
  return mainSteps.indexOf(step);
}

function getDisplayName(form: LeadForm) {
  const firstName = form.cardFirstName || form.firstName || "Tu nombre";
  const lastName = form.cardLastName || form.lastName || "Apellidos";
  return `${firstName} ${lastName}`.trim();
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || "No se pudo completar la operación.");
  }

  return payload;
}

function ShirtVisual({ authentic = false }: { authentic?: boolean }) {
  return (
    <div className={authentic ? "shirt-visual authentic" : "shirt-visual"}>
      <span className="shirt-neck" />
      <span className="shirt-crest">RM</span>
      <span className="shirt-sponsor">Emirates</span>
      <span className="shirt-badge">Ejemplo ilustrativo</span>
    </div>
  );
}

function WelcomePackVisual() {
  return (
    <div className="welcome-pack-visual" aria-hidden="true">
      <span className="pack-card" />
      <span className="pack-letter" />
      <span className="pack-shirt" />
    </div>
  );
}

function Progress({ currentStep }: { currentStep: Step }) {
  const activeStep = currentStep === "card-name" ? "card" : currentStep;
  const current = stepIndex(activeStep);

  return (
    <ol className="flow-progress" aria-label="Progreso del alta">
      {mainSteps.map((step, index) => (
        <li
          className={index <= current ? "is-active" : undefined}
          key={step}
          aria-current={index === current ? "step" : undefined}
        >
          {stepLabels[step]}
        </li>
      ))}
    </ol>
  );
}

function FlowHeader({
  currentStep,
  onBack,
}: {
  currentStep: Step;
  onBack: () => void;
}) {
  return (
    <header className="flow-header">
      {currentStep !== "profile" ? (
        <button className="back-button" type="button" onClick={onBack}>
          ← Volver
        </button>
      ) : (
        <span />
      )}
      <Image
        className="flow-logo"
        src="/madridistas-logo-white.svg"
        alt="Madridistas"
        width={128}
        height={37}
        priority
      />
      <nav className="language-switch" aria-label="Idioma">
        <span>ES</span>
        <i />
        <span>EN</span>
      </nav>
    </header>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  type = "text",
  autoComplete,
  required = true,
}: {
  label: string;
  name: keyof LeadForm;
  value: string;
  onChange: (name: keyof LeadForm, value: string) => void;
  type?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        autoComplete={autoComplete}
        name={name}
        onChange={(event) => onChange(name, event.target.value)}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}

function EmbeddedCheckoutPane({
  form,
  isSaving,
  stripePromise,
  checkoutClientSecret,
  onPrepareCheckout,
  onLegalTermsChange,
  onPaymentError,
}: {
  form: LeadForm;
  isSaving: boolean;
  stripePromise: ReturnType<typeof loadStripe>;
  checkoutClientSecret: string;
  onPrepareCheckout: () => void;
  onLegalTermsChange: (accepted: boolean) => void;
  onPaymentError: (message: string) => void;
}) {
  return (
    <div className="checkout-stage">
      {!checkoutClientSecret ? (
        <div className="checkout-preflight">
          <p className="step-kicker">Stripe Checkout</p>
          <h2>Completa el pago dentro de Madridistas</h2>
          <p className="step-copy">
            Stripe gestiona el cobro, la suscripción y los métodos de pago
            compatibles para tu país.
          </p>
          <label className="checkbox-row">
            <input
              checked={form.legalTermsAccepted}
              onChange={(event) => onLegalTermsChange(event.target.checked)}
              required
              type="checkbox"
            />
            <span>
              Acepto las condiciones de venta y el tratamiento de datos
              necesario para gestionar mi suscripción.
            </span>
          </label>
          <button
            className="flow-action"
            disabled={isSaving || !form.legalTermsAccepted || !stripePromise}
            onClick={() => {
              if (!form.legalTermsAccepted) {
                onPaymentError(
                  "Acepta las condiciones de venta para continuar al pago.",
                );
                return;
              }

              onPrepareCheckout();
            }}
            type="button"
          >
            {isSaving ? "Preparando checkout" : "Abrir pago seguro"}
          </button>
          <p className="checkout-note">
            Al finalizar volverás a una página de confirmación con tu
            referencia.
          </p>
        </div>
      ) : (
        <div className="embedded-checkout-shell">
          <EmbeddedCheckoutProvider
            key={checkoutClientSecret}
            options={{
              clientSecret: checkoutClientSecret,
            }}
            stripe={stripePromise}
          >
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      )}
    </div>
  );
}

export default function PlatinumFlow({
  publishableKey,
}: {
  publishableKey: string;
}) {
  const [form, setForm] = useState<LeadForm>(initialForm);
  const [currentStep, setCurrentStep] = useState<Step>("profile");
  const [isSaving, setIsSaving] = useState(false);
  const [checkoutClientSecret, setCheckoutClientSecret] = useState("");
  const [error, setError] = useState("");
  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey) : null),
    [publishableKey],
  );

  function updateField(name: keyof LeadForm, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
    setCheckoutClientSecret("");
  }

  function updateProfile(name: keyof LeadForm, value: string) {
    setCheckoutClientSecret("");
    setForm((current) => {
      const next = { ...current, [name]: value };

      if (name === "firstName" && !current.cardFirstName) {
        next.cardFirstName = value;
      }

      if (name === "lastName" && !current.cardLastName) {
        next.cardLastName = value;
      }

      return next;
    });
  }

  async function persistDraft(nextStep: Step) {
    setIsSaving(true);
    setError("");

    try {
      const payload = await postJson<{ id: string }>(
        "/api/platinum-leads",
        form,
      );
      setForm((current) => ({ ...current, id: payload.id }));
      setCurrentStep(nextStep);
    } catch (draftError) {
      setError(
        draftError instanceof Error
          ? draftError.message
          : "No se pudo guardar el avance.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function next() {
    const index = stepIndex(currentStep);

    if (index < mainSteps.length - 1) {
      await persistDraft(mainSteps[index + 1]);
    }
  }

  function back() {
    if (currentStep === "card-name") {
      setCurrentStep("card");
      setError("");
      return;
    }

    const index = stepIndex(currentStep);

    if (index > 0) {
      setCurrentStep(mainSteps[index - 1]);
      setError("");
    }
  }

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await next();
  }

  async function preparePaymentStep() {
    if (checkoutClientSecret) {
      setCurrentStep("payment");
      setError("");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const payload = await postJson<{
        id: string;
        clientSecret: string;
      }>("/api/platinum-subscription", { ...form, paymentMethod: "card" });
      setForm((current) => ({
        ...current,
        id: payload.id,
        paymentMethod: "card",
      }));
      setCheckoutClientSecret(payload.clientSecret);
      setCurrentStep("payment");
    } catch (paymentError) {
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : "No se pudo preparar el pago.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="platinum-app">
      <FlowHeader currentStep={currentStep} onBack={back} />
      <Progress currentStep={currentStep} />

      {currentStep === "profile" ? (
        <section className="flow-panel narrow">
          <p className="step-kicker">Madridista Platinum</p>
          <h1>Completa tus datos para empezar.</h1>
          <p className="step-copy">
            Usaremos esta información para crear tu alta y preparar el pago de
            forma segura.
          </p>
          <form className="stacked-form" onSubmit={handleProfileSubmit}>
            <Field
              autoComplete="given-name"
              label="Nombre"
              name="firstName"
              onChange={updateProfile}
              value={form.firstName}
            />
            <Field
              autoComplete="family-name"
              label="Apellidos"
              name="lastName"
              onChange={updateProfile}
              value={form.lastName}
            />
            <Field
              autoComplete="email"
              label="Email"
              name="email"
              onChange={updateField}
              type="email"
              value={form.email}
            />
            <button className="flow-action" disabled={isSaving} type="submit">
              {isSaving ? "Guardando" : "Continuar"}
            </button>
          </form>
        </section>
      ) : null}

      {currentStep === "plan" ? (
        <section className="flow-panel wide">
          <h1>Configura tu cuenta Platinum</h1>
          <div className="configuration-grid">
            <div className="selection-column">
              {planOptions.map((option) => (
                <button
                  className={
                    form.billingCycle === option.billingCycle
                      ? "choice-row is-selected"
                      : "choice-row"
                  }
                  key={option.billingCycle}
                  onClick={() =>
                    updateField("billingCycle", option.billingCycle)
                  }
                  type="button"
                >
                  <strong>{option.label}</strong>
                  <span>{option.price}</span>
                  <small>{option.help}</small>
                </button>
              ))}
            </div>
            <div className="product-column" aria-label="Camisetas">
              {jerseyOptions.map((option) => (
                <article className="product-option" key={option.jerseyTier}>
                  <ShirtVisual authentic={option.jerseyTier === "authentic"} />
                  <h2>{option.title}</h2>
                  <p>{option.description}</p>
                  <strong>
                    {form.billingCycle === "monthly"
                      ? option.monthly
                      : option.yearly}
                  </strong>
                  <button
                    className="flow-action compact"
                    onClick={() => {
                      updateField("jerseyTier", option.jerseyTier);
                      void next();
                    }}
                    type="button"
                  >
                    Seleccionar
                  </button>
                </article>
              ))}
              <p className="fine-print">
                *El envío se realizará durante el primer mes o en el mes 12,
                según el plan elegido y disponibilidad de temporada.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {currentStep === "card" ? (
        <section className="flow-panel narrow centered">
          <h1>Este es tu carnet Platinum.</h1>
          <div className="member-card">
            <Image
              className="member-card-logo"
              src="/madridistas-logo-white.svg"
              alt=""
              width={84}
              height={24}
            />
            <span>Madridista Platinum</span>
            <strong>{getDisplayName(form).toUpperCase()}</strong>
            <small>Desde 14/04/2026</small>
          </div>
          <button
            className="text-button"
            onClick={() => setCurrentStep("card-name")}
            type="button"
          >
            Cambiar el nombre de mi carnet
          </button>
          <button
            className="flow-action"
            onClick={() => void next()}
            type="button"
          >
            Genial. Sigamos
          </button>
        </section>
      ) : null}

      {currentStep === "card-name" ? (
        <section className="flow-panel narrow centered">
          <h1>Cambiar el nombre de mi carnet</h1>
          <form
            className="stacked-form"
            onSubmit={(event) => {
              event.preventDefault();
              void persistDraft("address");
            }}
          >
            <Field
              label="Nombre"
              name="cardFirstName"
              onChange={updateField}
              value={form.cardFirstName}
            />
            <Field
              label="Apellidos"
              name="cardLastName"
              onChange={updateField}
              value={form.cardLastName}
            />
            <button className="flow-action" disabled={isSaving} type="submit">
              Aceptar
            </button>
          </form>
        </section>
      ) : null}

      {currentStep === "address" ? (
        <section className="flow-panel narrow centered">
          <h1>¿Dónde quieres recibir tu Welcome Pack?</h1>
          <WelcomePackVisual />
          <form
            className="stacked-form"
            onSubmit={(event) => {
              event.preventDefault();
              void next();
            }}
          >
            <Field
              autoComplete="address-line1"
              label="Nombre de la vía, nº"
              name="addressLine1"
              onChange={updateField}
              value={form.addressLine1}
            />
            <Field
              autoComplete="postal-code"
              label="Código postal"
              name="postalCode"
              onChange={updateField}
              value={form.postalCode}
            />
            <Field
              autoComplete="address-level2"
              label="Población"
              name="city"
              onChange={updateField}
              value={form.city}
            />
            <Field
              autoComplete="address-level1"
              label="Provincia, región, Estado, etc."
              name="region"
              onChange={updateField}
              required={false}
              value={form.region}
            />
            <label className="field">
              <span>País de residencia</span>
              <select
                name="country"
                onChange={(event) => updateField("country", event.target.value)}
                value={form.country}
              >
                <option>España</option>
                <option>Francia</option>
                <option>Alemania</option>
                <option>Italia</option>
                <option>Reino Unido</option>
                <option>Estados Unidos</option>
              </select>
            </label>
            <p className="privacy-copy">
              Trataremos tus datos personales para gestionar el envío de tu
              Welcome Pack al domicilio elegido.
            </p>
            <button className="flow-action" disabled={isSaving} type="submit">
              Continuar
            </button>
          </form>
        </section>
      ) : null}

      {currentStep === "delivery" ? (
        <section className="flow-panel narrow centered">
          <h1>¿Cuándo vas a recibir tu camiseta?</h1>
          <p className="step-copy">
            En el mes 12 de tu suscripción procederemos a realizar el envío.
          </p>
          <ShirtVisual authentic={form.jerseyTier === "authentic"} />
          <ol className="delivery-months" aria-label="Meses de suscripción">
            {Array.from({ length: 12 }, (_, index) => (
              <li
                className={index === 0 || index === 11 ? "is-active" : ""}
                key={index}
              >
                {index + 1}
              </li>
            ))}
          </ol>
          <p className="legal-copy">
            Podrás consultar el progreso de tu suscripción desde tu área
            privada. El envío de la camiseta en el mes 12 está sujeto al pago de
            las cuotas correspondientes y a la disponibilidad de temporada.
          </p>
          <button
            className="flow-action"
            disabled={isSaving}
            onClick={() => void preparePaymentStep()}
            type="button"
          >
            {isSaving ? "Preparando pago" : "Continuar"}
          </button>
        </section>
      ) : null}

      {currentStep === "payment" ? (
        <section className="flow-panel wide checkout-panel">
          <h1>Completa tu suscripción</h1>
          {!publishableKey || !stripePromise ? (
            <p className="warning-copy">
              Configura la clave publicable de Stripe para mostrar el formulario
              de pago.
            </p>
          ) : (
            <EmbeddedCheckoutPane
              checkoutClientSecret={checkoutClientSecret}
              form={form}
              isSaving={isSaving}
              onLegalTermsChange={(accepted) =>
                setForm((current) => ({
                  ...current,
                  legalTermsAccepted: accepted,
                }))
              }
              onPaymentError={setError}
              onPrepareCheckout={() => void preparePaymentStep()}
              stripePromise={stripePromise}
            />
          )}
        </section>
      ) : null}

      {error ? (
        <p className="flow-error" role="alert">
          {error}
        </p>
      ) : null}

      <footer className="flow-footer">
        <span>Real Madrid © 2026. Todos los derechos reservados.</span>
        <span>Aviso legal · Política de cookies · Política de privacidad</span>
      </footer>
    </main>
  );
}
