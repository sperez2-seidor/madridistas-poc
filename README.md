# Real Madrid Stripe POC

Next.js POC para validar el alta de Madridista Platinum con onboarding previo al pago, guardado de datos del cliente anónimo y redirección final a Stripe.

## Ejecutar

```bash
npm install
npm run db:start
npm run db:migrate
npm run dev
```

Abrir:

```text
http://localhost:3000
```

## Stripe

Crear un archivo `.env.local` a partir de `.env.example`:

```bash
cp .env.example .env.local
```

Configurar:

```text
NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID=prctbl_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_STRIPE_MONTHLY_PAYMENT_LINK_URL=https://buy.stripe.com/test_...
NEXT_PUBLIC_STRIPE_YEARLY_PAYMENT_LINK_URL=https://buy.stripe.com/test_...
NEXT_PUBLIC_STRIPE_MONTHLY_AUTHENTIC_PAYMENT_LINK_URL=https://buy.stripe.com/test_...
NEXT_PUBLIC_STRIPE_YEARLY_AUTHENTIC_PAYMENT_LINK_URL=https://buy.stripe.com/test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_MONTHLY_PRICE_ID=price_...
STRIPE_YEARLY_PRICE_ID=price_...
STRIPE_MONTHLY_AUTHENTIC_PRICE_ID=price_...
STRIPE_YEARLY_AUTHENTIC_PRICE_ID=price_...
DATABASE_URL=postgres://postgres:postgres@localhost:54322/madridistas
```

La cuenta Stripe objetivo para esta POC es:

```text
acct_1TM2j7BFe2dBiGnp
```

Antes de crear productos, precios o Pricing Tables, confirmar que el MCP o Dashboard activo corresponde a esa cuenta.

## Creacion por API

La publishable key `pk_test_...` solo sirve para frontend. Para crear producto, precios y Payment Links por API hace falta una secret key de test, pero no la pegues en el chat.

Ejecutar localmente:

```bash
STRIPE_SECRET_KEY=sk_test_... npm run stripe:setup
```

Tambien puedes dejar `STRIPE_SECRET_KEY=sk_test_...` en `.env.local`; el script lo lee desde ahi.

El script crea:

- Producto `Madridista Platinum`
- Precio mensual `12,90 EUR / mes`
- Precio anual `149,90 EUR / año`
- Payment Link mensual
- Payment Link anual

Despues imprime las dos variables `NEXT_PUBLIC_STRIPE_MONTHLY_PAYMENT_LINK_URL` y `NEXT_PUBLIC_STRIPE_YEARLY_PAYMENT_LINK_URL` para pegarlas en `.env.local`.

La POC actual prioriza Checkout Sessions creadas por API cuando existen los `STRIPE_*_PRICE_ID`, porque permiten adjuntar `client_reference_id` y metadata del lead. Si no hay Price ID para una combinacion, la app usa Payment Links como fallback cuando exista la URL correspondiente.

La Pricing Table se puede seguir usando para una demo de comparativa simple, pero no encaja tan bien con este flujo porque ahora hay pasos previos de identidad, carnet, direccion y consentimiento.

## Datos del cliente

El primer paso pide nombre, apellidos y email para crear un lead anonimo antes del pago. Cada avance del wizard guarda un borrador en Postgres local:

```text
platinum_leads
```

La tabla guarda:

- Identidad: email, nombre y apellidos.
- Nombre impreso en carnet.
- Cadencia: mensual o anual.
- Camiseta: fan o authentic.
- Direccion para Welcome Pack.
- Metodo de pago preferido.
- Consentimiento legal.
- `stripe_checkout_session_id` cuando se crea una sesion de Checkout.

Este Postgres local es intencionadamente compatible con un futuro Supabase gestionado: al migrar, basta con aplicar `db/schema.sql` en Supabase y cambiar `DATABASE_URL`.

## Flujo soportado

Ordenado segun las capturas del 14/04/2026:

1. Datos iniciales del cliente anonimo: nombre, apellidos y email.
2. Configuracion de cuenta Platinum: suscripcion mensual/anual y camiseta.
3. Previsualizacion del carnet Platinum.
4. Cambio del nombre del carnet.
5. Direccion de envio del Welcome Pack.
6. Informacion de entrega de camiseta en el mes 12.
7. Metodo de pago preferido y redireccion a Stripe.

## Verificacion

```bash
npm run lint
npm run build
```
