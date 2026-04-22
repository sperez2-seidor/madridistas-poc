# Plan POC Stripe — Madridista Platinum

Fecha: 2026-04-22

## Objetivo

Demostrar que Real Madrid puede usar **Stripe sólo como pasarela de pago (PSP)** manteniendo su propio motor de billing. Stripe se encarga de:

1. Capturar la tarjeta del socio (PCI out-of-scope, Checkout hosted).
2. Cobrar la primera cuota en el alta.
3. Ejecutar cobros posteriores cuando el motor de RM lo decida (off-session).
4. Permitir sustituir la tarjeta de forma segura cuando el socio lo pida o cuando un cobro falle.

**Fuera de alcance**: Stripe Billing (Subscriptions, Prices recurrentes, Invoices), Payment Links, Customer Portal, Pricing Table. La lógica de planes, ciclo, prorrateos, dunning y selección de "tarjeta por defecto" vive en el sistema de Real Madrid.

Documento de referencia técnica detallada: [`docs/integracion-stripe.md`](docs/integracion-stripe.md).

## Arquitectura

```
┌──────────────────────┐      ┌────────────────────────────┐      ┌─────────────────────┐
│  Frontend alta       │─────▶│  Backend Real Madrid       │─────▶│  Stripe             │
│  (web / app socio)   │      │  (API + motor billing)     │      │  (Checkout / PI /   │
│                      │      │  ┌──────────────────────┐  │      │   SetupIntent)      │
└──────────────────────┘      │  │ BBDD intermedia      │  │      └──────────┬──────────┘
                              │  │ - customers (email)  │  │                 │
                              │  │ - historial cobros   │  │                 │
                              │  └──────────────────────┘  │                 │
                              └───────────────┬────────────┘                 │
                                              │   Webhook (HTTPS)            │
                                              │◀─────────────────────────────┘
```

BBDD intermedia mínima:

- **`platinum_customers`** — clave funcional `email` UNIQUE, guarda `stripe_customer_id` + `stripe_payment_method_id` activa.
- **`platinum_charges`** — historial de cobros (`initial` / `recurring`) contra Stripe.

## Flujos demostrados por la POC

### 1. Alta + 1ª cuota + tarjeta guardada off-session

- `/checkout` → `/api/platinum-checkout`:
  - Upsert en `platinum_customers` por email.
  - `stripe.customers.create` si no existe aún `stripe_customer_id`.
  - `stripe.checkout.sessions.create` con:
    - `mode: "payment"` + `customer: <cus_...>`
    - `payment_intent_data.setup_future_usage: "off_session"` → tarjeta reutilizable.
    - `saved_payment_method_options.payment_method_save: "enabled"` → PM con `allow_redisplay: "always"`.
  - Redirección a la URL hosted de Stripe.
- Webhook `checkout.session.completed` (mode `payment`):
  - Recupera el PaymentIntent.
  - Persiste `stripe_payment_method_id`, `card_brand`, `card_last4` en `platinum_customers`.
  - Registra la fila `initial` en `platinum_charges`.

### 2. Recobros off-session (motor mock en /backoffice)

- `/backoffice` lista clientes con PM guardada y muestra su historial.
- Botón "Ejecutar cobro" → `/api/backoffice/charge`:
  - `stripe.paymentIntents.create({ off_session: true, confirm: true, customer, payment_method })`.
  - Inserta / actualiza fila `recurring` en `platinum_charges`.
- Webhook `payment_intent.succeeded` / `payment_intent.payment_failed` / `payment_intent.processing` / `payment_intent.canceled` sincroniza el estado.

Este endpoint es el *stand-in* del motor de billing de RM. En producción, el scheduler interno lo invoca sin UI.

### 3. Cambio de método de pago (Checkout `mode: "setup"`)

- Botón "Cambiar tarjeta" en `/backoffice` → `/api/backoffice/update-payment-method`:
  - `stripe.checkout.sessions.create({ mode: "setup", customer, payment_method_types: ["card"] })`.
  - El socio abre la URL hosted, completa 3DS si procede, la nueva PM queda guardada en Stripe.
- Webhook `checkout.session.completed` (mode `setup`):
  - Recupera el SetupIntent, lee la nueva `payment_method`.
  - Actualiza `stripe_payment_method_id`, `card_brand`, `card_last4` en `platinum_customers`.

## Objetos de Stripe usados

| Objeto | Rol | Persistido en RM |
|---|---|---|
| `Customer` | Contenedor del socio en Stripe (uno por email) | `stripe_customer_id` |
| `PaymentMethod` | Token de tarjeta reutilizable off-session | `stripe_payment_method_id` + `card_brand` + `card_last4` |
| `Checkout Session (mode=payment)` | Hosted, 1ª cuota + guardar tarjeta | — |
| `Checkout Session (mode=setup)` | Hosted, cambio de tarjeta sin cobrar | — |
| `PaymentIntent` | Cada cobro (inicial y recobros) | `stripe_payment_intent_id` en `platinum_charges` |
| `SetupIntent` | Generado por la session `mode=setup` | Sólo auditoría |
| `Webhook Endpoint` | Eventos asíncronos | URL en RM |

No se usan: `Subscription`, `Price` recurrente, `Invoice`, `Subscription Schedule`, `Customer Portal`, `Payment Link`, `Pricing Table`.

## Eventos webhook suscritos

- `checkout.session.completed` (cubre mode `payment` y mode `setup`)
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.processing`
- `payment_intent.canceled`

## Testing

Tarjetas sandbox relevantes (sólo con `sk_test_…`):

- `4242 4242 4242 4242` — éxito.
- `4000 0025 0000 3155` — requiere 3DS y simula `requires_action` en off-session.
- `4000 0000 0000 9995` — fondos insuficientes.
- `4000 0000 0000 0341` — éxito al guardar pero falla en off-session con `authentication_required`.

Para recibir webhooks en local:

```
stripe listen --forward-to localhost:3000/api/stripe-webhook
```

Escenarios mínimos a validar:

- Alta OK → aparece fila en `platinum_customers` con `stripe_payment_method_id` + `card_last4` y fila `initial` en `platinum_charges`.
- 2ª alta con el mismo email → la Checkout Session reutiliza el `Customer` existente y enseña la tarjeta guardada.
- Recobro off-session OK desde `/backoffice`.
- Recobro con declinación → fila `failed` en `platinum_charges`.
- Cambio de tarjeta desde `/backoffice` → `stripe_payment_method_id` y `card_last4` actualizados tras el webhook.

## Go-live (resumen)

- Cambiar claves `sk_test_…` → `sk_live_…`, recrear webhook en live y actualizar `STRIPE_WEBHOOK_SECRET`.
- Domain verification si se activa Apple Pay.
- Activar **"Reuse saved cards for returning customers"** en Settings → Payments.
- SAQ-A desde Stripe Dashboard.
- Data retention: datos de pago quedan en Stripe, metadata en RM.
- Rate limits de Stripe (100 req/s por defecto): si hay campañas masivas, solicitar ampliación.

## Responsabilidades

**Stripe**: custodia de la tarjeta (PCI L1), cobro contra banco emisor, 3DS/SCA, reembolsos, disputas, payouts.

**Real Madrid**: planes y ciclo, BBDD intermedia (email → `stripe_customer_id` / `stripe_payment_method_id`), decisión de cuándo y cuánto cobrar y qué tarjeta usar, flujo de cambio de tarjeta, escucha de webhooks, dunning, facturación fiscal, atención al socio.
