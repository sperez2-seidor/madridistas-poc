# Integración con Stripe — Madridista Platinum

**Audiencia:** equipo de producto y tecnología de Real Madrid.
**Contexto:** esta prueba de concepto demuestra cómo Real Madrid puede usar Stripe **solo como pasarela de pago (PSP)**, manteniendo su propio motor de billing. Stripe se encarga de:

1. Capturar la tarjeta de forma segura (PCI out-of-scope).
2. Cobrar la primera cuota en el alta.
3. Ejecutar cobros posteriores cuando el motor de Real Madrid lo decida (off-session).

No se usan Stripe Billing (Subscriptions / Prices recurrentes), Stripe Invoices, ni Customer Portal. La lógica de ciclo, prorrateos, cambios de plan, dunning y comunicaciones permanece en el sistema de Real Madrid.

---

## 1. Arquitectura de alto nivel

```
┌──────────────────────┐      ┌───────────────────────┐      ┌─────────────────────┐
│  Frontend alta       │─────▶│  Backend Real Madrid  │─────▶│  Stripe             │
│  (web / app socio)   │      │  (API + motor billing)│      │  (Checkout + PI)    │
└──────────────────────┘      └─────────────┬─────────┘      └──────────┬──────────┘
                                            │                           │
                                            │   Webhook (HTTPS)         │
                                            │◀──────────────────────────┘
                                            ▼
                                   ┌────────────────────┐
                                   │ BBDD Real Madrid   │
                                   │ - socio            │
                                   │ - customer_id      │
                                   │ - payment_method_id│
                                   │ - historial cobros │
                                   └────────────────────┘
```

- **Stripe** guarda el *Customer* y el *PaymentMethod* (token de la tarjeta).
- **Real Madrid** guarda las referencias (`customer_id`, `payment_method_id`) y todo el estado de negocio (plan, ciclo, próximo cobro, gracia, bajas, …).
- El motor de billing de Real Madrid lanza los cobros cuando procede, llamando a la API de Stripe (`paymentIntents.create(... off_session: true, confirm: true)`).

---

## 2. Objetos de Stripe que se usan

| Objeto | Rol en la integración | Se persiste en RM |
|---|---|---|
| `Customer` | Contenedor del socio en Stripe (email, nombre, tarjetas guardadas) | `stripe_customer_id` |
| `PaymentMethod` | Token de la tarjeta reutilizable off-session | `stripe_payment_method_id` |
| `Checkout Session` (mode `payment`) | Página hosted para capturar la 1ª cuota y guardar la tarjeta | `stripe_checkout_session_id` |
| `PaymentIntent` | Cada intento de cobro (inicial y recobros) | `stripe_payment_intent_id` por cobro |
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
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `payment_intent.processing`
   - `payment_intent.canceled`
   - `charge.refunded` *(si se va a soportar reembolsos desde Stripe Dashboard)*
   - `charge.dispute.created` *(fraude / chargebacks)*
5. Guardar el **signing secret** del webhook (`whsec_…`) como variable de entorno en RM.
6. Guardar las claves API (`sk_test_…`, `sk_live_…`) en el secret manager de RM.

### Paso 2 — Modelado de datos en RM

Extender la entidad "socio/lead" con:

| Campo | Tipo | Notas |
|---|---|---|
| `stripe_customer_id` | text | `cus_...` — set tras 1er alta |
| `stripe_payment_method_id` | text | `pm_...` — la tarjeta guardada por defecto |
| `stripe_checkout_session_id` | text | Sólo informativo / auditoría |

Nueva tabla para el historial de cobros (ver `platinum_charges` en este POC):

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid | PK |
| `lead_id` / `socio_id` | uuid | FK al socio |
| `stripe_payment_intent_id` | text | Único por intento |
| `stripe_charge_id` | text | Si hubo `Charge` asociado |
| `kind` | enum | `initial` / `recurring` |
| `amount_cents` | int | Importe cobrado |
| `currency` | text | ISO 4217 |
| `status` | enum | `pending / processing / succeeded / failed / requires_action` |
| `failure_code` | text | Código de Stripe si falló (ej. `card_declined`) |
| `failure_message` | text | Mensaje humano |
| `created_at` / `updated_at` | timestamptz | |

### Paso 3 — Alta del socio: Checkout Session (1ª cuota + guardar tarjeta)

Cuando el socio completa el formulario en la web de RM:

1. Backend RM crea un registro de "lead/socio" en estado `checkout_started`.
2. Backend RM llama a `stripe.checkout.sessions.create`:

   ```ts
   const session = await stripe.checkout.sessions.create({
     mode: "payment",
     customer_email: lead.email,
     client_reference_id: lead.id,
     line_items: [{
       price_data: {
         currency: "eur",
         product_data: { name: "Madridista Platinum — Fan mensual" },
         unit_amount: 1499, // 14,99 €
       },
       quantity: 1,
     }],
     payment_intent_data: {
       setup_future_usage: "off_session", // 🔑 guarda la tarjeta
       metadata: { lead_id: lead.id, kind: "initial", billing_cycle: "monthly" },
     },
     metadata: { lead_id: lead.id, billing_cycle: "monthly" },
     success_url: "https://realmadrid.com/gracias?session_id={CHECKOUT_SESSION_ID}",
     cancel_url: "https://realmadrid.com/?checkout=cancelled",
   });
   // Redirigir al socio a session.url
   ```

3. Clave: **`setup_future_usage: "off_session"`** instruye a Stripe para guardar la tarjeta de forma reutilizable. Sin este flag, los recobros posteriores fallarán.
4. El socio paga en la página hosted de Stripe y Stripe lo redirige a `success_url`.

### Paso 4 — Recepción del webhook `checkout.session.completed`

Cuando Stripe confirma el pago, envía el evento al endpoint de RM. El handler debe:

```ts
// 1. Verificar la firma
const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

// 2. Si es checkout.session.completed:
const session = event.data.object as Stripe.Checkout.Session;
const paymentIntent = await stripe.paymentIntents.retrieve(
  session.payment_intent as string,
  { expand: ["payment_method", "latest_charge"] },
);

// 3. Persistir en RM
await saveSocioPayment({
  socioId: session.client_reference_id,
  stripeCustomerId: session.customer as string,
  stripePaymentMethodId: paymentIntent.payment_method as string,
  stripeCheckoutSessionId: session.id,
});

// 4. Registrar el cobro inicial en el historial
await insertCharge({
  socioId: session.client_reference_id,
  kind: "initial",
  stripePaymentIntentId: paymentIntent.id,
  amountCents: paymentIntent.amount_received,
  currency: paymentIntent.currency,
  status: "succeeded",
});

// 5. Marcar socio como activo y arrancar su ciclo de facturación interno
```

**Reglas de oro del webhook:**
- Siempre devolver 200 tras verificar la firma y encolar el trabajo si es largo.
- **Idempotente**: el mismo evento puede llegar varias veces. Usa `event.id` como clave o `upsert` por `payment_intent.id`.
- No confiar en el orden: `payment_intent.succeeded` puede llegar antes o después de `checkout.session.completed`.

### Paso 5 — Motor de recobro en RM (off-session)

El motor de billing de Real Madrid decide cuándo toca cobrar (ej. el día X de cada mes). Para cada cuota vencida:

```ts
try {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: socio.amountCents,
    currency: socio.currency,
    customer: socio.stripeCustomerId,
    payment_method: socio.stripePaymentMethodId,
    off_session: true,          // 🔑 la cuenta hace el cargo sin el socio delante
    confirm: true,              // 🔑 lanza el cargo en la misma llamada
    metadata: {
      socio_id: socio.id,
      kind: "recurring",
      periodo: "2026-05",
    },
  });

  // Stripe puede devolver:
  // - "succeeded"      → cobrado
  // - "processing"     → se cerrará por webhook
  // - "requires_action"→ el banco pide SCA (ver Paso 6)
} catch (err) {
  // Tarjeta declinada, fondos insuficientes, robada, caducada, etc.
}
```

Este cobro **no pasa por Checkout**, es una llamada directa API → Stripe. El socio no ve nada (salvo que el banco dispare SCA).

**En este POC** el motor de recobro está mockeado en `/backoffice` + `/api/backoffice/charge`. En producción, Real Madrid sustituye ese mock por su propio scheduler (cron, Airflow, jobs internos, …).

### Paso 6 — Manejo de SCA, fallos y reintentos

Escenarios comunes en off-session:

| Estado del PaymentIntent | Qué significa | Acción de RM |
|---|---|---|
| `succeeded` | Cobrado | Marcar cuota OK, notificar al socio |
| `requires_action` | El banco exige 3DS / SCA al socio | Enviar email con link para autenticar (usar `PaymentIntent.client_secret` + página hosted o volver a meter al socio en un flujo on-session). Hasta que el socio autentique, no hay dinero. |
| `requires_payment_method` (error `authentication_required`, `card_declined`, etc.) | Tarjeta rechazada | Estrategia de dunning de RM: reintentos escalonados, email al socio para actualizar tarjeta, eventual baja |

Patrón recomendado para **pedir actualización de tarjeta**:
- Generar una nueva Checkout Session en modo `setup` (solo para guardar nueva tarjeta, sin cobrar) y enviar el link al socio.
- Cuando vuelva con `setup_intent.succeeded`, actualizar `stripe_payment_method_id` y reintentar el cobro pendiente.

**No** dependas de los reintentos automáticos de Stripe — con esta arquitectura la política de reintentos y dunning la implementa el motor de RM.

### Paso 7 — Eventos asíncronos a tratar

Cualquier cambio de estado post-creación llega por webhook. Mínimo a implementar:

| Evento | Acción |
|---|---|
| `payment_intent.succeeded` | Marcar el cobro como `succeeded`, avanzar ciclo |
| `payment_intent.payment_failed` | Marcar `failed`, leer `last_payment_error.code`, disparar dunning |
| `payment_intent.processing` | Estado intermedio (SEPA), esperar resolución |
| `payment_intent.canceled` | El cobro se abortó |
| `charge.dispute.created` | Chargeback, abrir incidencia + responder con evidencia en X días |
| `charge.refunded` | Actualizar contabilidad, informar al socio |
| `payment_method.detached` / `payment_method.updated` | Ajustar tarjeta guardada |

### Paso 8 — Testing

1. **Tarjetas de prueba** (solo en `sk_test_…`):
   - `4242 4242 4242 4242` — éxito.
   - `4000 0027 6000 3184` — requiere 3DS.
   - `4000 0000 0000 9995` — fondos insuficientes.
   - `4000 0000 0000 0341` — éxito al guardar pero falla en off-session (simula `authentication_required`).
2. **Webhook local**: `stripe listen --forward-to localhost:3000/api/stripe-webhook` para recibir eventos reales contra el servidor de desarrollo.
3. **Escenarios a validar**:
   - Alta OK con 1ª cuota → aparece `customer` + `payment_method` en BBDD.
   - Cancelación en Checkout (socio cierra la pestaña) → `checkout.session.expired`.
   - Recobro off-session OK (`/backoffice`).
   - Recobro que cae en SCA (usar `4000 0025 0000 3155`): verificar que RM detecta `requires_action` y lanza flujo de autenticación.
   - Recobro que falla por declinación: comprobar que se marca `failed` y se dispara dunning.
   - Webhook duplicado: el mismo `event.id` llega dos veces y no se duplican filas.

### Paso 9 — Go-live

- [ ] Pasar de `sk_test_…` a `sk_live_…`.
- [ ] Recrear webhook en live y actualizar `STRIPE_WEBHOOK_SECRET`.
- [ ] Domain verification si se activa Apple Pay.
- [ ] Validación del SAQ-A desde Stripe Dashboard.
- [ ] Data retention: confirmar política de RM vs la de Stripe (datos de pago quedan en Stripe, metadata en RM).
- [ ] Alertas / on-call: Radar, disputas, payouts fallidos.
- [ ] Límites de rate (Stripe permite 100 req/s por defecto; para campañas masivas pedir ampliación).

---

## 5. Mapeo PoC ↔ integración real

| Parte del PoC | Equivalente en producción RM |
|---|---|
| `/checkout` + `/api/platinum-checkout` | Alta en web oficial + backend de RM que crea la Checkout Session |
| `/api/stripe-webhook` | Endpoint interno de RM detrás de API Gateway / WAF |
| Tabla `platinum_leads` | Entidad Socio del core de RM |
| Tabla `platinum_charges` | Módulo de historial/ledger del motor de billing de RM |
| Página `/backoffice` + botón "Ejecutar cobro" | Scheduler interno + consola de operaciones (llama al mismo endpoint Stripe con `off_session: true`) |
| Catálogo `src/lib/platinum-pricing.ts` | Tabla de planes del CRM / motor comercial de RM |
| PayPal mock | Integración real de PayPal o eliminación (scope aparte) |

---

## 6. Consideraciones operacionales

- **Contabilidad / fiscalidad**: con este modelo RM emite sus propias facturas (Stripe no las emite). Stripe sólo devuelve `amount_captured`, `fee`, `net`.
- **Multidivisa**: cada `PaymentIntent` fija su `currency`. Si RM vende en varias monedas, hay que guardarla por cuota.
- **Cambio de tarjeta del socio**: flujo con Checkout Session `mode: "setup"` → recibes `setup_intent.succeeded` → guardas nuevo `payment_method_id`.
- **Baja**: la cancelación del servicio es una operación interna de RM. Opcionalmente se puede hacer `paymentMethods.detach` para quitar la tarjeta de Stripe.
- **Reembolsos**: `stripe.refunds.create({ payment_intent: pi_... })` desde el backoffice de RM.
- **Disputas (chargebacks)**: responder desde Stripe Dashboard o vía API con evidencia (contrato, logs de login, prueba de entrega del welcome pack). Stripe descuenta el importe del próximo payout hasta la resolución.
- **PSD2 / SCA**: gestionado automáticamente por Stripe en la 1ª cuota (Checkout hosted). En off-session el banco puede pedir step-up → RM debe tener un flujo para traer al socio a 3DS.
- **Dunning / reintentos**: responsabilidad 100% de RM. Patrón típico: reintentar a las 24 h, 3 días, 7 días con emails entre medias; si sigue fallando, suspender servicio.
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
- Decidir cuándo y cuánto cobrar.
- Llamar a la API de Stripe para cada cobro.
- Escuchar webhooks y reaccionar (reintentos, dunning, notificaciones al socio).
- Facturación fiscal.
- Atención al cliente y gestión de disputas.

---

## 8. Siguientes pasos sugeridos

1. **Validar el POC**: equipo técnico de RM revisa el código de este repo (`/api/platinum-checkout`, `/api/stripe-webhook`, `/api/backoffice/charge`) para confirmar que cubre el flujo crítico.
2. **Definir la política de reintentos y SCA** con negocio: ¿cuántos reintentos? ¿qué comunicaciones al socio? ¿a los cuántos días se suspende?
3. **Especificar el contrato API** entre el motor de billing de RM y Stripe: sólo son 2 llamadas (`paymentIntents.create` y reintento), pero conviene encapsularlas en un servicio propio de RM con logging y circuit breaker.
4. **Proyecto piloto** con subconjunto de socios en modo test antes del roll-out.
5. **Definir plan de migración** desde el motor actual (Worldline / otro) si ya hay tarjetas guardadas: Stripe ofrece import de tokens, requiere acuerdo a tres bandas con el PSP anterior.

---

*Documento vivo — actualizar tras cada hito de integración.*
