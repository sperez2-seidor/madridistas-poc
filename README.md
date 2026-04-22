# Real Madrid Stripe POC

Next.js POC para demostrar cómo Real Madrid puede usar **Stripe como PSP** (no Billing) para Madridista Platinum:

1. Cobrar la 1ª cuota y **guardar la tarjeta off-session** en el alta.
2. Ejecutar **recobros off-session** desde un backoffice que simula el motor de billing de RM.
3. **Cambiar la tarjeta** del socio con Checkout `mode: "setup"`.

No se usan Stripe Billing (Subscriptions, Prices recurrentes, Invoices), Payment Links, Customer Portal ni Pricing Table.

Ver detalle técnico en [`docs/integracion-stripe.md`](docs/integracion-stripe.md) y resumen ejecutivo en [`plan_poc_stripe_real_madrid.md`](plan_poc_stripe_real_madrid.md).

## Ejecutar

```bash
npm install
npm run db:start
npm run db:migrate
npm run dev
```

Abrir: `http://localhost:3000`

## Configuración

Copiar el ejemplo:

```bash
cp .env.example .env.local
```

Variables mínimas:

```text
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
DATABASE_URL=postgres://postgres:postgres@localhost:54322/madridistas
```

## Webhooks en local

```bash
stripe listen --forward-to localhost:3000/api/stripe-webhook
```

Copia el `whsec_…` que imprime el CLI en `STRIPE_WEBHOOK_SECRET` de `.env.local`.

Eventos sincronizados:

- `checkout.session.completed` (cubre `mode: "payment"` y `mode: "setup"`)
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.processing`
- `payment_intent.canceled`

## BBDD intermedia

Postgres local con dos tablas (`db/schema.sql`):

- `platinum_customers` — clave única `email`, guarda `stripe_customer_id` y `stripe_payment_method_id` activa (+ `card_brand`, `card_last4`, plan y `amount_cents`).
- `platinum_charges` — historial de cobros (`initial` / `recurring`) con `stripe_payment_intent_id` y estado.

## Flujo soportado

1. Landing `/` → CTA "Únete" abre el wizard `/checkout` (datos, plan, carnet, envío, pago).
2. El paso de pago llama a `/api/platinum-checkout` que:
   - Hace `upsertLocalCustomer` por email.
   - Crea el `Stripe Customer` si aún no existe y lo guarda en BBDD.
   - Crea una Checkout Session en `mode: "payment"` con `setup_future_usage: "off_session"` y `payment_method_save: "enabled"`.
   - Redirige al socio a la URL hosted de Stripe.
3. Stripe devuelve al socio a `/gracias`. El webhook persiste la PM en `platinum_customers` y la fila `initial` en `platinum_charges`.
4. `/backoffice` lista clientes con PM guardada:
   - **Ejecutar cobro** → `/api/backoffice/charge` lanza un `PaymentIntent` off-session (`off_session: true, confirm: true`). El webhook sincroniza el estado.
   - **Cambiar tarjeta** → `/api/backoffice/update-payment-method` crea una Checkout Session `mode: "setup"`. Al completarse, el webhook actualiza `stripe_payment_method_id` en `platinum_customers`.

## Verificación

```bash
npm run lint
npm run build
```
