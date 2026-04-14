"use client";

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

type PaymentLinks = {
  monthlyFan?: string;
  yearlyFan?: string;
  monthlyAuthentic?: string;
  yearlyAuthentic?: string;
};

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
  paymentMethod: "paypal",
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
    description: "La camiseta idéntica a la que usan los jugadores en cada partido.",
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

function getPrice(form: LeadForm) {
  const selected = jerseyOptions.find(
    (option) => option.jerseyTier === form.jerseyTier,
  );

  if (!selected) {
    return "";
  }

  return form.billingCycle === "monthly" ? selected.monthly : selected.yearly;
}

function hasConfiguredFallback(form: LeadForm, paymentLinks: PaymentLinks) {
  const key = `${form.billingCycle}${form.jerseyTier === "fan" ? "Fan" : "Authentic"}` as keyof PaymentLinks;
  return Boolean(paymentLinks[key]);
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

export default function PlatinumFlow({
  paymentLinks,
}: {
  paymentLinks: PaymentLinks;
}) {
  const [form, setForm] = useState<LeadForm>(initialForm);
  const [currentStep, setCurrentStep] = useState<Step>("profile");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedPlan = useMemo(
    () =>
      planOptions.find((option) => option.billingCycle === form.billingCycle) ||
      planOptions[0],
    [form.billingCycle],
  );

  const canUseCurrentSelection = hasConfiguredFallback(form, paymentLinks);

  function updateField(name: keyof LeadForm, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateProfile(name: keyof LeadForm, value: string) {
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
      const payload = await postJson<{ id: string }>("/api/platinum-leads", form);
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

  async function handleCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError("");

    try {
      const payload = await postJson<{ id: string; url: string }>(
        "/api/platinum-checkout",
        form,
      );
      setForm((current) => ({ ...current, id: payload.id }));
      window.location.assign(payload.url);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "No se pudo iniciar el pago.",
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
          <button className="flow-action" onClick={() => void next()} type="button">
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
              <li className={index === 0 || index === 11 ? "is-active" : ""} key={index}>
                {index + 1}
              </li>
            ))}
          </ol>
          <p className="legal-copy">
            Podrás consultar el progreso de tu suscripción desde tu área privada.
            El envío de la camiseta en el mes 12 está sujeto al pago de las
            cuotas correspondientes y a la disponibilidad de temporada.
          </p>
          <button className="flow-action" onClick={() => void next()} type="button">
            Continuar
          </button>
        </section>
      ) : null}

      {currentStep === "payment" ? (
        <section className="flow-panel wide">
          <h1>Elige tu método de pago preferido</h1>
          <form className="payment-grid" onSubmit={handleCheckout}>
            <div className="selection-column">
              {(["paypal", "card"] as PaymentMethod[]).map((method) => (
                <button
                  className={
                    form.paymentMethod === method
                      ? "payment-method is-selected"
                      : "payment-method"
                  }
                  key={method}
                  onClick={() => updateField("paymentMethod", method)}
                  type="button"
                >
                  <span>{method === "paypal" ? "PayPal" : "Tarjeta bancaria"}</span>
                  <b>{method === "paypal" ? "P" : "▭"}</b>
                </button>
              ))}
            </div>
            <div className="payment-summary">
              <div className="summary-box">
                <h2>Madridista Platinum</h2>
                <p>
                  {selectedPlan.label}
                  <span>{getPrice(form)}</span>
                </p>
                <p className="summary-total">
                  Importe total
                  <strong>{getPrice(form)}</strong>
                </p>
              </div>
              <div className="summary-note">
                <ShirtVisual authentic={form.jerseyTier === "authentic"} />
                <p>
                  Podrás personalizarla para garantizar el stock en los próximos
                  pasos.
                </p>
              </div>
              <label className="checkbox-row">
                <input
                  checked={form.legalTermsAccepted}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      legalTermsAccepted: event.target.checked,
                    }))
                  }
                  required
                  type="checkbox"
                />
                <span>
                  Acepto las condiciones de venta y el tratamiento de datos
                  necesario para gestionar mi suscripción.
                </span>
              </label>
              {!canUseCurrentSelection ? (
                <p className="warning-copy">
                  Esta combinación se guardará en la base local. Para pagarla
                  hace falta añadir su Price ID o Payment Link de Stripe.
                </p>
              ) : null}
              <button className="flow-action" disabled={isSaving} type="submit">
                {isSaving ? "Preparando pago" : "Pagar"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {error ? <p className="flow-error" role="alert">{error}</p> : null}

      <footer className="flow-footer">
        <span>Real Madrid © 2026. Todos los derechos reservados.</span>
        <span>Aviso legal · Política de cookies · Política de privacidad</span>
      </footer>
    </main>
  );
}
