# Integración con Stripe — Madridista Platinum

**Audiencia:** equipo de producto y tecnología de Real Madrid.
**Contexto:** esta prueba de concepto demuestra cómo Real Madrid puede usar Stripe **solo como pasarela de pago (PSP)**, manteniendo su propio motor de billing. Stripe se encarga de:

1. Capturar la tarjeta de forma segura (PCI out-of-scope).
2. Cobrar la primera cuota en el alta.
3. Ejecutar cobros posteriores cuando el motor de Real Madrid lo decida (off-session).
4. Permitir al socio sustituir la tarjeta de forma segura cuando RM lo solicite.

No se usan Stripe Billing (Subscriptions / Prices recurrentes), Stripe Invoices, ni Customer Portal. La lógica de ciclo, prorrateos, cambios de plan, dunning, selección de "tarjeta por defecto" y comunicaciones permanece en el sistema de Real Madrid.

---

## 1. Arquitectura de alto nivel

```
┌──────────────────────┐      ┌────────────────────────────┐      ┌─────────────────────┐
│  Frontend alta       │─────▶│  Backend Real Madrid       │─────▶│  Stripe             │
│  (web / app socio)   │      │  (API + motor billing)     │      │  (Checkout / PI /   │
│                      │      │  ┌──────────────────────┐  │      │   SetupIntent)      │
└──────────────────────┘      │  │ BBDD intermedia      │  │      └──────────┬──────────┘
                              │  │ - customers (email)  │  │                 │
                              │  │ - socios / leads     │  │                 │
                              │  │ - historial cobros   │  │                 │
                              │  └──────────────────────┘  │                 │
                              └───────────────┬────────────┘                 │
                                              │   Webhook (HTTPS)            │
                                              │◀─────────────────────────────┘
```

- **Stripe** guarda el *Customer*, los *PaymentMethod* (tokens de las tarjetas) y el historial real de autorizaciones.
- **Real Madrid** mantiene una **BBDD intermedia** con al menos tres entidades:
  - **Clientes** (tabla intermedia, clave única `email`) → guarda `stripe_customer_id` y `stripe_payment_method_id` activa. Es el puente entre la identidad del socio y los tokens en Stripe.
  - **Socios/leads/altas** → estado de negocio del alta (plan, ciclo, dirección de envío, etc.).
  - **Historial de cobros** → cada intento contra Stripe.
- El motor de billing de Real Madrid lanza los cobros cuando procede, llamando a `paymentIntents.create({ off_session: true, confirm: true })`.
- Cuando un cobro falla por problema de tarjeta, RM dispara un flujo de **cambio de método de pago** contra Stripe con `mode: "setup"` (ver Paso 7).

---

## 2. Objetos de Stripe que se usan

| Objeto | Rol en la integración | Se persiste en RM |
|---|---|---|
| `Customer` | Contenedor del socio en Stripe. **Se crea una vez por socio** y se reutiliza en todas las Checkout Sessions posteriores (alta + cambios de tarjeta) | `stripe_customer_id` (clave `email` en la tabla intermedia) |
| `PaymentMethod` | Token de la tarjeta reutilizable off-session | `stripe_payment_method_id` + opcional `card_brand`, `card_last4` |
| `Checkout Session` (`mode: "payment"`) | Página hosted para capturar la 1ª cuota y guardar la tarjeta | `stripe_checkout_session_id` |
| `Checkout Session` (`mode: "setup"`) | Página hosted para **cambiar de tarjeta sin cobrar** | Sólo auditoría |
| `PaymentIntent` | Cada intento de cobro (inicial y recobros) | `stripe_payment_intent_id` por cobro |
| `SetupIntent` | Generado por la Checkout Session de `setup` | Sólo auditoría |
| `Webhook Endpoint` | Canal asíncrono para confirmaciones y fallos | URL en RM |

Objetos que **no** se usan: `Subscription`, `Price` recurrente, `Invoice`, `Subscription Schedule`, `Customer Portal`.

---

## 3. Prerrequisitos

- [ ] Cuenta de Stripe con acceso a **Developers → API keys**.
- [ ] Dos entornos separados: **test** (sk_test_…) y **live** (sk_live_…).
- [ ] Dominio en el que va a correr el checkout (necesario para Apple Pay / Google Pay opcional y domain verification).
- [ ] Endpoint HTTPS en RM que pueda recibir webhooks desde Stripe.
- [ ] Email operativo para alertas de Stripe (disputas, notificaciones de riesgo).
- [ ] Decisión de **monedas** y **métodos de pago** activos (tarjeta, Bizum vía Redsys-Stripe si aplica, SEPA Direct Debit, Apple/Google Pay…).
- [ ] SAQ-A de PCI: con Checkout hosted se queda en SAQ-A (la tarjeta nunca toca servidores de RM).

---

## 4. Pasos de integración

### Paso 1 — Alta y configuración básica de la cuenta Stripe

1. Dar de alta la cuenta (datos fiscales de Real Madrid, IBAN de liquidación).
2. Activar **Tax** si se quiere cálculo automático de IVA (opcional, hoy desactivado en el POC).
3. En **Developers → Webhooks**, crear un endpoint apuntando a:
   - Test: `https://staging.realmadrid.com/api/stripe-webhook`
   - Live: `https://realmadrid.com/api/stripe-webhook`
4. Suscribir los siguientes eventos al endpoint:
   - `checkout.session.completed` *(cubre tanto 1ª cuota como cambio de tarjeta)*
   - `checkout.session.expired`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `payment_intent.processing`
   - `payment_intent.canceled`
   - `charge.refunded` *(si se va a soportar reembolsos desde Stripe Dashboard)*
   - `charge.dispute.created` *(fraude / chargebacks)*
   - `setup_intent.succeeded` *(opcional, redundante con `checkout.session.completed` si sólo emitimos setups vía Checkout)*
   - `setup_intent.setup_failed` *(opcional)*
5. Guardar el **signing secret** del webhook (`whsec_…`) como variable de entorno en RM.
6. Guardar las claves API (`sk_test_…`, `sk_live_…`) en el secret manager de RM.
7. En **Settings → Payments → Payment methods** asegurarse de que **"Reuse saved cards for returning customers"** está activado. Sin esto, la UI hosted de Stripe no enseña las tarjetas ya guardadas.

### Paso 2 — Modelado de datos en RM

Se necesitan **tres** tablas nuevas (o su equivalente en el modelo actual):

**A. Tabla intermedia de clientes** — puente email ↔ Stripe. Clave única `email`.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid | PK interna de RM |
| `email` | text **UNIQUE** | Clave funcional del socio |
| `first_name` / `last_name` | text | Datos de contacto |
| `stripe_customer_id` | text **UNIQUE** | `cus_...` — se crea una vez, se reutiliza |
| `stripe_payment_method_id` | text | `pm_...` — tarjeta activa ahora mismo |
| `card_brand` | text | `visa`, `mastercard`, … (UI operativa) |
| `card_last4` | text | Últimos 4 dígitos (UI operativa, nunca PAN completo) |
| `billing_cycle` / `jersey_tier` | text | Snapshot del plan actual *(o vivir en la tabla de socios si RM lo prefiere)* |
| `amount_cents` / `currency` | int / text | Importe del próximo cobro |

> Por qué una tabla aparte: si varias altas tienen el mismo email, se reutiliza el **mismo** `stripe_customer_id` y por tanto las **mismas** tarjetas guardadas. Si metiéramos los IDs de Stripe en la tabla de altas/leads, cada alta generaría un customer nuevo y el socio nunca vería sus tarjetas.

**B. Tabla de socios / leads** — estado de negocio del alta.

Campos mínimos extra para la integración:

| Campo | Tipo | Notas |
|---|---|---|
| `customer_id` | uuid | FK a la tabla de clientes intermedia |
| `stripe_checkout_session_id` | text | Sólo informativo / auditoría |

**C. Tabla de cobros** — historial.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid | PK |
| `customer_id` | uuid | FK a la tabla de clientes |
| `lead_id` / `socio_id` | uuid | FK al alta concreta (opcional) |
| `stripe_payment_intent_id` | text | Único por intento |
| `stripe_charge_id` | text | Si hubo `Charge` asociado |
| `kind` | enum | `initial` / `recurring` |
| `amount_cents` | int | Importe cobrado |
| `currency` | text | ISO 4217 |
| `status` | enum | `pending / processing / succeeded / failed / requires_action` |
| `failure_code` | text | Código de Stripe si falló (ej. `card_declined`) |
| `failure_message` | text | Mensaje humano |
| `created_at` / `updated_at` | timestamptz | |

### Paso 3 — Alta del socio: upsert cliente + Checkout Session (1ª cuota + guardar tarjeta)

Cuando el socio completa el formulario en la web de RM:

```ts
// 1. Upsert cliente en la tabla intermedia por email
const customer = await upsertLocalCustomer({
  email, firstName, lastName, billingCycle, jerseyTier, amountCents, currency,
});

// 2. Crear (o reutilizar) el Stripe Customer
let stripeCustomerId = customer.stripeCustomerId;
if (!stripeCustomerId) {
  const stripeCustomer = await stripe.customers.create({
    email, name: `${firstName} ${lastName}`.trim(),
    metadata: { local_customer_id: customer.id },
  });
  stripeCustomerId = stripeCustomer.id;
  await attachStripeCustomerId({ id: customer.id, stripeCustomerId });
}

// 3. Crear la Checkout Session
const session = await stripe.checkout.sessions.create({
  mode: "payment",
  customer: stripeCustomerId,                     // 🔑 reutiliza el customer → enseña tarjetas guardadas
  client_reference_id: leadId,
  line_items: [{
    price_data: {
      currency: "eur",
      product_data: { name: "Madridista Platinum — Fan mensual" },
      unit_amount: 1499,
    },
    quantity: 1,
  }],
  payment_intent_data: {
    setup_future_usage: "off_session",            // 🔑 la tarjeta queda reutilizable para recobros
    metadata: { lead_id: leadId, customer_id: customer.id, kind: "initial" },
  },
  saved_payment_method_options: {
    payment_method_save: "enabled",               // 🔑 marca la PM como allow_redisplay=always
  },
  metadata: { lead_id: leadId, customer_id: customer.id, billing_cycle: "monthly" },
  success_url: "https://realmadrid.com/gracias?session_id={CHECKOUT_SESSION_ID}",
  cancel_url:  "https://realmadrid.com/?checkout=cancelled",
});
// Redirigir al socio a session.url
```

**Tres flags críticos:**

| Flag | Efecto | Si falta |
|---|---|---|
| `customer: stripeCustomerId` | Ancla el cobro al customer ya existente; en la UI hosted el socio ve sus tarjetas guardadas | Cada alta crea un customer nuevo (huérfanos) y el socio nunca ve sus tarjetas |
| `payment_intent_data.setup_future_usage: "off_session"` | Guarda la PM como reutilizable sin el socio delante | Los recobros futuros fallan con `authentication_required` |
| `saved_payment_method_options.payment_method_save: "enabled"` | Marca la nueva PM con `allow_redisplay: "always"` (filtro por defecto de Stripe) | La tarjeta queda como `allow_redisplay: "limited"` y no aparecerá en futuras Checkout Sessions |

### Paso 4 — Webhook `checkout.session.completed` (1ª cuota)

Cuando Stripe confirma el pago, envía el evento al endpoint de RM. Tratamiento:

```ts
const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

if (event.type === "checkout.session.completed") {
  const session = event.data.object as Stripe.Checkout.Session;

  // Distinguir alta (mode: "payment") vs cambio de tarjeta (mode: "setup")
  if (session.mode === "setup") {
    return handleSetupCompleted(session);   // Paso 7
  }

  // 1. Expandir el PaymentIntent para obtener la PM y la marca/last4
  const pi = await stripe.paymentIntents.retrieve(
    session.payment_intent as string,
    { expand: ["payment_method", "latest_charge"] },
  );

  const paymentMethodId = pi.payment_method as string;
  const card = (pi.payment_method as Stripe.PaymentMethod).card;

  // 2. Actualizar la tabla intermedia de clientes por stripe_customer_id
  await attachPaymentMethodToCustomer({
    stripeCustomerId: session.customer as string,
    stripePaymentMethodId: paymentMethodId,
    cardBrand: card?.brand,
    cardLast4: card?.last4,
    amountCents: pi.amount_received,
    currency: pi.currency,
  });

  // 3. Registrar el cobro inicial en el historial (upsert por payment_intent.id)
  await upsertChargeByPaymentIntent({
    customerId: localCustomerId,
    leadId: session.client_reference_id,
    stripePaymentIntentId: pi.id,
    stripeChargeId: pi.latest_charge as string,
    kind: "initial",
    amountCents: pi.amount_received,
    currency: pi.currency,
    status: "succeeded",
  });

  // 4. Marcar el alta como activa
  await activateLead(session.client_reference_id);
}
```

**Reglas de oro del webhook:**
- Siempre devolver 200 tras verificar la firma y encolar el trabajo si es largo.
- **Idempotente**: el mismo evento puede llegar varias veces. Usa `event.id` como clave o `upsert` por `payment_intent.id`.
- No confiar en el orden: `payment_intent.succeeded` puede llegar antes o después de `checkout.session.completed`.

### Paso 5 — Motor de recobro en RM (off-session)

El motor de billing de Real Madrid decide cuándo toca cobrar (ej. el día X de cada mes). Para cada cuota vencida, **lee la tabla intermedia** y lanza:

```ts
try {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: customer.amountCents,
    currency: customer.currency,
    customer: customer.stripeCustomerId,
    payment_method: customer.stripePaymentMethodId,    // 🔑 la tarjeta "por defecto" la elige RM
    off_session: true,                                 // 🔑 sin socio delante
    confirm: true,                                     // 🔑 lanza el cargo en la misma llamada
    metadata: {
      customer_id: customer.id,
      kind: "recurring",
      periodo: "2026-05",
    },
  });

  // Stripe puede devolver:
  // - "succeeded"      → cobrado
  // - "processing"     → se cerrará por webhook (SEPA, etc.)
  // - "requires_action"→ el banco pide SCA (ver Paso 6)
} catch (err) {
  // Tarjeta declinada, fondos insuficientes, caducada, robada, etc.
  // → disparar dunning y eventualmente flujo de cambio de tarjeta (Paso 7)
}
```

Este cobro **no pasa por Checkout**, es una llamada directa API → Stripe. El socio no ve nada (salvo que el banco dispare SCA).

> **Importante — "tarjeta por defecto"**: este POC **no** usa `invoice_settings.default_payment_method` en Stripe. Qué tarjeta está activa lo decide RM leyendo `customer.stripe_payment_method_id` de su propia BBDD. Stripe puede tener múltiples PM guardadas para un mismo customer; RM controla cuál se usa.

**En este POC** el motor de recobro está mockeado en `/backoffice` + `/api/backoffice/charge`. En producción, RM sustituye ese mock por su propio scheduler (cron, Airflow, jobs internos, …).

### Paso 6 — Manejo de SCA, fallos y reintentos

Escenarios comunes en off-session:

| Estado del PaymentIntent | Qué significa | Acción de RM |
|---|---|---|
| `succeeded` | Cobrado | Marcar cuota OK, notificar al socio |
| `requires_action` | El banco exige 3DS / SCA al socio | Enviar email con link para autenticar (usar `PaymentIntent.client_secret` + página hosted o volver a meter al socio en un flujo on-session). Hasta que el socio autentique, no hay dinero. |
| `requires_payment_method` (error `authentication_required`, `card_declined`, `expired_card`, `insufficient_funds`, etc.) | Tarjeta rechazada | Estrategia de dunning de RM: reintentos escalonados, email al socio con link al flujo de cambio de tarjeta (ver **Paso 7**), eventual baja |

**No** dependas de los reintentos automáticos de Stripe — con esta arquitectura la política de reintentos y dunning la implementa el motor de RM.

### Paso 7 — Cambio de método de pago (Checkout Session `mode: "setup"`)

Mismo patrón que el alta, pero **sin cobrar**: Stripe solo tokeniza la nueva tarjeta.

**Cuándo se usa:**
- Cobro off-session falla con `requires_payment_method`.
- El socio pide actualizar su tarjeta voluntariamente desde el área privada.

#### 7.1 Crear la session

```ts
const session = await stripe.checkout.sessions.create({
  mode: "setup",
  customer: customer.stripeCustomerId,     // 🔑 mismo customer, no creamos otro
  payment_method_types: ["card"],
  success_url: "https://realmadrid.com/tarjeta-ok?session_id={CHECKOUT_SESSION_ID}",
  cancel_url:  "https://realmadrid.com/mi-cuenta",
  metadata: {
    customer_id: customer.id,
    reason: "card_update",
    pending_charge_id: failedCharge?.id ?? "",
  },
});
// Enviar session.url al socio por email / mostrarlo en su área privada
```

Diferencias clave vs. el alta:
- **No hay `line_items`** ni `amount` — no se cobra.
- **No hace falta `setup_future_usage`**: en `mode: "setup"` la PM ya queda reutilizable off-session por defecto.
- **Pasas `customer:`** (nunca `customer_email`) para anclar la nueva tarjeta al customer que ya tienes.

#### 7.2 Webhook

```ts
if (event.type === "checkout.session.completed" && session.mode === "setup") {
  const setupIntent = await stripe.setupIntents.retrieve(
    session.setup_intent as string,
    { expand: ["payment_method"] },
  );
  const newPmId = setupIntent.payment_method as string;
  const card = (setupIntent.payment_method as Stripe.PaymentMethod).card;

  // 1) Actualizar la "tarjeta activa" en la tabla intermedia de RM
  await attachPaymentMethodToCustomer({
    stripeCustomerId: session.customer as string,
    stripePaymentMethodId: newPmId,
    cardBrand: card?.brand,
    cardLast4: card?.last4,
  });

  // 2) (opcional) reintentar el cobro pendiente si venía de un fallo
  if (session.metadata.pending_charge_id) {
    await retryPendingCharge(session.metadata.pending_charge_id, newPmId);
  }
}
```

> **Decisión de RM:** este POC **no** actualiza `invoice_settings.default_payment_method` del `Customer` en Stripe. La "tarjeta por defecto" se gestiona en la BBDD de RM (`platinum_customers.stripe_payment_method_id`), no en Stripe. Esto da flexibilidad a RM para cambiar la selección sin escribir en Stripe cada vez.

#### 7.3 Relanzar el cobro (si procede)

`retryPendingCharge` es el mismo `paymentIntents.create` de los recobros, forzando el nuevo `payment_method`:

```ts
await stripe.paymentIntents.create({
  amount: pendingCharge.amountCents,
  currency: pendingCharge.currency,
  customer: customer.stripeCustomerId,
  payment_method: newPmId,                         // 👈 el que acaba de guardar
  off_session: true,
  confirm: true,
  metadata: {
    customer_id: customer.id,
    kind: "recurring",
    retry_of: pendingCharge.id,
  },
});
```

#### 7.4 Matices que suelen morder

- **SCA en el setup**: como el socio está *on-session* en la página hosted, si el banco pide 3DS lo resuelve allí mismo. La tarjeta queda guardada sólo si completa el reto.
- **Si no pasas `customer`**, Stripe crea uno nuevo y tendrás huérfanos. Siempre pasarlo.
- **Idempotencia**: el mismo `checkout.session.completed` puede llegar dos veces. Usa `event.id` o upsert por `session.id`.
- **La PM antigua sigue en Stripe**: si quieres, `paymentMethods.detach` para limpiar. No es obligatorio — sólo afecta al almacén, no a RM porque RM ya no la referencia.
- **Alternativa sin Checkout**: si algún día queréis integrar el formulario dentro de la web de RM (no hosted), sería `SetupIntent` + Stripe Elements. Mismo resultado, más PCI-scope (pasas a SAQ-A EP).

### Paso 8 — Eventos asíncronos a tratar

Cualquier cambio de estado post-creación llega por webhook. Mínimo a implementar:

| Evento | Acción |
|---|---|
| `checkout.session.completed` (`mode: "payment"`) | Alta: persistir PM y primer cobro en `customers` + `charges` |
| `checkout.session.completed` (`mode: "setup"`) | Cambio de tarjeta: actualizar PM en `customers` (ver Paso 7) |
| `checkout.session.expired` | El socio abandonó → marcar lead como `cancelled` |
| `payment_intent.succeeded` | Marcar el cobro como `succeeded`, avanzar ciclo |
| `payment_intent.payment_failed` | Marcar `failed`, leer `last_payment_error.code`, disparar dunning |
| `payment_intent.processing` | Estado intermedio (SEPA), esperar resolución |
| `payment_intent.canceled` | El cobro se abortó |
| `charge.dispute.created` | Chargeback, abrir incidencia + responder con evidencia en X días |
| `charge.refunded` | Actualizar contabilidad, informar al socio |
| `payment_method.detached` / `payment_method.updated` | Ajustar tarjeta guardada si es la activa |

### Paso 9 — Testing

1. **Tarjetas de prueba** (solo en `sk_test_…`):
   - `4242 4242 4242 4242` — éxito.
   - `4000 0027 6000 3184` — requiere 3DS al cobrar.
   - `4000 0025 0000 3155` — requiere 3DS y simula `requires_action` en off-session.
   - `4000 0000 0000 9995` — fondos insuficientes.
   - `4000 0000 0000 0341` — éxito al guardar pero falla en off-session (simula `authentication_required`).
2. **Webhook local**: `stripe listen --forward-to localhost:3000/api/stripe-webhook` para recibir eventos reales contra el servidor de desarrollo.
3. **Escenarios a validar**:
   - Alta OK con 1ª cuota → aparece fila en `customers` con `stripe_customer_id` + `stripe_payment_method_id` + `card_last4`.
   - **2ª alta con el mismo email** → la Checkout Session muestra la tarjeta guardada arriba del formulario (reutilización de customer).
   - Cancelación en Checkout (socio cierra la pestaña) → `checkout.session.expired`.
   - Recobro off-session OK (`/backoffice`).
   - Recobro que cae en SCA: verificar que RM detecta `requires_action` y lanza flujo de autenticación.
   - Recobro que falla por declinación: comprobar que se marca `failed` y se dispara dunning.
   - **Cambio de tarjeta**: desde `/backoffice` botón "Cambiar tarjeta" → Stripe hosted → volver con `?card_updated=...` → `stripe_payment_method_id` y `card_last4` actualizados.
   - **Cambio de tarjeta + reintento**: generar un `failed`, cambiar tarjeta con `pending_charge_id` en metadata, verificar que el siguiente cobro sale `succeeded`.
   - Webhook duplicado: el mismo `event.id` llega dos veces y no se duplican filas.

### Paso 10 — Go-live

- [ ] Pasar de `sk_test_…` a `sk_live_…`.
- [ ] Recrear webhook en live y actualizar `STRIPE_WEBHOOK_SECRET`.
- [ ] Domain verification si se activa Apple Pay.
- [ ] Validación del SAQ-A desde Stripe Dashboard.
- [ ] Activar **"Reuse saved cards for returning customers"** en Settings → Payments.
- [ ] Data retention: confirmar política de RM vs la de Stripe (datos de pago quedan en Stripe, metadata en RM).
- [ ] Alertas / on-call: Radar, disputas, payouts fallidos.
- [ ] Límites de rate (Stripe permite 100 req/s por defecto; para campañas masivas pedir ampliación).

---

## 5. Mapeo POC ↔ integración real

| Parte del POC | Equivalente en producción RM |
|---|---|
| Tabla `platinum_customers` (email UNIQUE, `stripe_customer_id`, `stripe_payment_method_id`) | Tabla intermedia de clientes en el core de RM |
| Tabla `platinum_leads` | Entidad Alta/Socio del core de RM |
| Tabla `platinum_charges` | Módulo de historial/ledger del motor de billing de RM |
| `/checkout` + `/api/platinum-checkout` | Alta en web oficial + backend de RM que crea la Checkout Session |
| `/api/stripe-webhook` | Endpoint interno de RM detrás de API Gateway / WAF |
| Página `/backoffice` + botón "Ejecutar cobro" | Scheduler interno + consola de operaciones (llama al mismo endpoint Stripe con `off_session: true`) |
| Página `/backoffice` + botón "Cambiar tarjeta" + `/api/backoffice/update-payment-method` | Flujo del socio: link enviado por email / área privada → Checkout Session `mode: "setup"` |
| Catálogo `src/lib/platinum-pricing.ts` | Tabla de planes del CRM / motor comercial de RM |
| PayPal mock | Integración real de PayPal o eliminación (scope aparte) |

---

## 6. Consideraciones operacionales

- **Contabilidad / fiscalidad**: con este modelo RM emite sus propias facturas (Stripe no las emite). Stripe sólo devuelve `amount_captured`, `fee`, `net`.
- **Multidivisa**: cada `PaymentIntent` fija su `currency`. Si RM vende en varias monedas, hay que guardarla por cuota.
- **Cambio de tarjeta del socio**: flujo dedicado — ver **Paso 7**. La "tarjeta activa" la gestiona RM en su BBDD; Stripe puede tener varias PM guardadas para el mismo customer.
- **Baja**: la cancelación del servicio es una operación interna de RM. Opcionalmente `paymentMethods.detach` para quitar la tarjeta de Stripe.
- **Reembolsos**: `stripe.refunds.create({ payment_intent: pi_... })` desde el backoffice de RM.
- **Disputas (chargebacks)**: responder desde Stripe Dashboard o vía API con evidencia (contrato, logs de login, prueba de entrega del welcome pack). Stripe descuenta el importe del próximo payout hasta la resolución.
- **PSD2 / SCA**: gestionado automáticamente por Stripe en la 1ª cuota y en el cambio de tarjeta (Checkout hosted). En off-session el banco puede pedir step-up → RM debe tener flujo para traer al socio a 3DS.
- **Dunning / reintentos**: responsabilidad 100% de RM. Patrón típico: reintentar a las 24 h, 3 días, 7 días con emails entre medias; si sigue fallando, enviar link de cambio de tarjeta (Paso 7) y/o suspender servicio.
- **Seguridad**: nunca loguear `payment_method_id` en claro fuera de sistemas auditados, nunca exponer `sk_live_…`. El webhook sólo acepta requests firmados; rechazar firma inválida con 400.
- **Observabilidad**: loguear `event.id`, `payment_intent.id` y `charge_id` en cada paso permite trazar cualquier cobro con Stripe Dashboard.

---

## 7. Qué responsabilidades tiene cada parte

**Stripe:**
- Capturar y custodiar la tarjeta (PCI Level 1).
- Ejecutar el cobro contra el banco emisor.
- Gestionar 3DS / SCA.
- Procesar reembolsos y disputas.
- Emitir payouts a la cuenta bancaria de RM.

**Real Madrid:**
- Modelo de negocio (planes, ciclo, prorrateos, altas/bajas).
- **BBDD intermedia** con email como clave y `stripe_customer_id` / `stripe_payment_method_id`.
- Decidir cuándo y cuánto cobrar, y **qué tarjeta** usar (Stripe admite varias por customer; RM elige la activa).
- Llamar a la API de Stripe para cada cobro.
- Lanzar el flujo de cambio de tarjeta cuando proceda.
- Escuchar webhooks y reaccionar (reintentos, dunning, notificaciones al socio).
- Facturación fiscal.
- Atención al cliente y gestión de disputas.

---

## 8. Siguientes pasos sugeridos

1. **Validar el POC**: equipo técnico de RM revisa el código de este repo (`/api/platinum-checkout`, `/api/stripe-webhook`, `/api/backoffice/charge`, `/api/backoffice/update-payment-method`) para confirmar que cubre el flujo crítico.
2. **Definir la política de reintentos y SCA** con negocio: ¿cuántos reintentos? ¿cuándo se envía el link de cambio de tarjeta al socio? ¿a los cuántos días se suspende?
3. **Especificar el contrato API** entre el motor de billing de RM y Stripe: son pocas llamadas (`paymentIntents.create`, `checkout.sessions.create`, `setupIntents.retrieve`), pero conviene encapsularlas en un servicio propio de RM con logging, idempotencia y circuit breaker.
4. **Proyecto piloto** con subconjunto de socios en modo test antes del roll-out.
5. **Definir plan de migración** desde el motor actual (Worldline / otro) si ya hay tarjetas guardadas: Stripe ofrece import de tokens, requiere acuerdo a tres bandas con el PSP anterior.

---

*Documento vivo — actualizar tras cada hito de integración.*
