# Plan POC Stripe - Madridista Platinum

Fecha: 2026-04-14

## Objetivo

Validar una POC lo más low-code posible para que un cliente internacional pueda contratar Madridista Platinum desde una landing, realizar el primer pago con Stripe y dejar activa la recurrencia mensual o anual hasta que finalice la implementación futura con Zuora.

La POC se plantea sobre la siguiente cuenta Stripe sandbox:

- Account ID objetivo: `acct_1TM2j7BFe2dBiGnp`

Nota operativa: antes de crear recursos, confirmar que el MCP de Stripe este conectado a `acct_1TM2j7BFe2dBiGnp`. En la comprobacion inicial del entorno, el MCP reporto otra cuenta conectada, por lo que no se debe ejecutar la creacion de productos/precios/links hasta validar el account activo.

## Contexto revisado

La landing pública de Madridistas muestra el producto `Madridista Platinum` con el precio `Desde 12,90 EUR/mes`, CTA `Únete como Platinum` y beneficios principales:

- La camiseta de cada temporada
- Pack de bienvenida
- Todos los beneficios de Madridista Premium

Fuente revisada: https://madridistas.com/es-ES/madridistas/landing

El precio anual `149,90 EUR/año` debe tratarse como dato de negocio a validar, ya que no apareció en el HTML indexado de la landing revisada.

## Alcance de la POC

Incluido:

- Alta previa de cliente anonimo con nombre, apellidos y email.
- Guardado progresivo de datos en una base Postgres local compatible con Supabase.
- Flujo visual de onboarding Platinum:
  - configuracion de suscripcion mensual/anual;
  - seleccion de camiseta fan o authentic;
  - previsualizacion del carnet;
  - edicion del nombre del carnet;
  - direccion para Welcome Pack;
  - informacion de entrega de camiseta;
  - seleccion de metodo de pago preferido;
  - redireccion a Stripe.
- Crear producto `Madridista Platinum` en Stripe sandbox.
- Crear dos precios recurrentes:
  - Mensual: `12,90 EUR / mes`
  - Anual: `149,90 EUR / año`
- Crear dos Payment Links o Checkout Links alojados por Stripe.
- Probar alta de cliente, primer pago y creación de suscripción.
- Validar que Stripe crea y conserva los objetos necesarios para recurrencia:
  - `Customer`
  - `Subscription`
  - `Invoice`
  - `PaymentIntent`
  - método de pago asociado a la suscripción
- Revisar eventos mínimos para operación:
  - `checkout.session.completed`
  - `invoice.paid`
  - `invoice.payment_failed`

Fuera de alcance para esta POC:

- Migración real de tokens/tarjetas desde Worldline.
- Integración con Zuora.
- Modificación de la landing productiva de Real Madrid.
- Gestión completa de impuestos, facturación local, dunning avanzado y conciliación financiera.
- Alta productiva en live mode.

## Enfoque low-code recomendado

Para el primer prototipo sin datos previos, Stripe Payment Links con precios recurrentes era suficiente.

Con las nuevas pantallas, el cliente ya no empieza en Stripe: primero introduce identidad, personaliza carnet y aporta direccion. Por eso la PoC actual pasa a:

- Next.js para la UI y las rutas API.
- Postgres local en Docker para `platinum_leads`.
- Stripe Checkout Sessions por API cuando existan `STRIPE_*_PRICE_ID`.
- Payment Links como fallback para no bloquear la demo cuando solo existan URLs de Stripe.

Ventajas:

- Mantiene el stack ligero.
- Permite guardar el lead antes del pago.
- Permite adjuntar `client_reference_id` y metadata a Checkout.
- Stripe aloja la página de pago.
- Stripe crea la suscripción y gestiona la recurrencia.
- Reduce riesgo de SCA/off-session frente a un flujo manual con PaymentIntents.

Limitación:

- Para la camiseta Authentic hacen falta precios y links adicionales si se quiere cobrar `16,90 EUR/mes` o `194,90 EUR/año`.
- La base local es para PoC; en produccion debería migrarse a Supabase gestionado u otra base operada por el cliente.

## Landing y comparativa de suscripciones

Stripe tiene un componente low-code llamado `Pricing Table` que permite mostrar opciones de suscripcion y redirigir al usuario a Stripe Checkout. Para esta POC se puede usar para comparar:

- Madridista Platinum mensual: `12,90 EUR/mes`
- Madridista Platinum anual: `149,90 EUR/año`

Uso recomendado para POC:

- Crear el producto y los dos precios recurrentes.
- Configurar una Pricing Table en Stripe con las dos opciones.
- Embeber el snippet HTML de Stripe en una pagina de prueba.
- Usar branding basico de Stripe: logo, color principal, bordes y texto de botones.

Limitacion importante:

- La `Pricing Table` acelera mucho la POC, pero no permite replicar pixel-perfect el aspecto de la landing de Madridistas. Para una landing con el mismo look & feel que Madridistas, la mejor opcion es construir una pagina propia con HTML/CSS o en el stack de Real Madrid, y usar Stripe solo para el paso de pago mediante Checkout Sessions o Payment Links.

Recomendacion:

- Para demo rapida: `Pricing Table`.
- Para demo comercial que parezca Madridista: landing propia con dos CTAs y redireccion a Checkout/Payment Links.
- Para produccion: landing propia + Checkout Sessions por API + webhooks.

## Plan de ejecución vía MCP de Stripe

### 1. Comprobar catálogo existente

Objetivo: evitar duplicados en la sandbox.

Herramientas MCP:

```text
list_products
list_prices
```

Buscar productos o precios existentes con nombres como:

- `Madridista Platinum`
- `Real Madrid`
- `Madrid Platinum`

### 2. Crear producto

Herramienta MCP:

```text
create_product
```

Parámetros propuestos:

```text
name: Madridista Platinum
description: La camiseta de cada temporada. Pack de bienvenida. Todos los beneficios de Madridista Premium.
```

Resultado esperado:

```text
prod_<id>
```

### 3. Crear precio mensual

Herramienta MCP:

```text
create_price
```

Parámetros:

```text
product: prod_<id>
unit_amount: 1290
currency: eur
recurring.interval: month
```

Resultado esperado:

```text
price_<monthly_id>
```

### 4. Crear precio anual

Herramienta MCP:

```text
create_price
```

Parámetros:

```text
product: prod_<id>
unit_amount: 14990
currency: eur
recurring.interval: year
```

Resultado esperado:

```text
price_<yearly_id>
```

### 5. Crear Payment Link mensual

Herramienta MCP:

```text
create_payment_link
```

Parámetros:

```text
price: price_<monthly_id>
quantity: 1
```

Resultado esperado:

```text
https://buy.stripe.com/test_<...>
```

### 6. Crear Payment Link anual

Herramienta MCP:

```text
create_payment_link
```

Parámetros:

```text
price: price_<yearly_id>
quantity: 1
```

Resultado esperado:

```text
https://buy.stripe.com/test_<...>
```

### 7. Simular la landing

Para la POC no hace falta tocar la landing productiva. Basta con preparar una página o documento interno con dos CTAs:

```text
Suscribirme mensual - 12,90 EUR/mes
Suscribirme anual - 149,90 EUR/año
```

Cada CTA apunta al Payment Link correspondiente.

### 8. Probar compras sandbox

Ejecutar al menos dos pruebas:

- Alta mensual con tarjeta sandbox.
- Alta anual con tarjeta sandbox.

Validar después con MCP:

```text
list_customers
list_subscriptions
list_invoices
list_payment_intents
```

Evidencia esperada:

- Cliente creado.
- Suscripción activa.
- Factura pagada.
- PaymentIntent exitoso.
- Precio asociado correcto: mensual o anual.

### 9. Validar recurrencia y operación mínima

En una POC low-code se puede validar recurrencia observando la suscripción creada y los próximos ciclos de facturación desde Stripe.

Para una integración más cercana a producción, añadir webhooks mínimos:

```text
checkout.session.completed
invoice.paid
invoice.payment_failed
```

Uso previsto:

- `checkout.session.completed`: registrar alta y asociar `customer` + `subscription`.
- `invoice.paid`: mantener activo el entitlement Madridista Platinum.
- `invoice.payment_failed`: activar comunicación para actualizar método de pago.

### 10. Configurar Customer Portal

Configurar en sandbox el Customer Portal para que el cliente pueda:

- Actualizar método de pago.
- Ver suscripción/facturas.
- Cancelar o gestionar la suscripción si negocio lo permite.

Esto evita construir pantallas propias durante la POC.

## Riesgos y decisiones pendientes

### Migración desde Worldline

La migración de tokens actuales no debe plantearse como copia directa de tokens. Normalmente requiere un proceso formal de importación de datos de pago/PAN desde el procesador actual hacia Stripe y un fichero de mapping posterior entre IDs antiguos y objetos Stripe nuevos.

Decisión pendiente:

- Confirmar con Worldline/Real Madrid si pueden exportar datos de pago de forma compatible.
- Confirmar si la importación se haría como `PaymentMethod` en Stripe.
- Definir qué clientes deberán reintroducir tarjeta si la migración no es viable o falla.

### Stripe Billing temporal vs recurrencia manual

Recomendación para la urgencia: usar Stripe Billing temporalmente.

Motivo:

- Reduce desarrollo.
- Gestiona facturas y recurrencia.
- Maneja mejor reintentos y estados de suscripción.
- Evita implementar una lógica manual de cobros off-session con PaymentIntents.

Si Real Madrid exige recurrencia manual por API, la POC debe incorporar más trabajo:

- Guardar `Customer` y `PaymentMethod`.
- Crear cobros off-session.
- Gestionar SCA y fallos de autenticación.
- Crear lógica de reintentos.
- Controlar estados de entitlement.

### Zuora

Zuora debe quedar fuera de esta POC. El objetivo es demostrar adquisición y recurrencia en Stripe. La futura migración a Zuora requiere un plan separado de transición de billing, mapping de clientes, suscripciones, métodos de pago y estados.

## Entregables de la POC

- Producto creado en Stripe sandbox.
- Precio mensual creado.
- Precio anual creado.
- Payment Link mensual.
- Payment Link anual.
- Prueba de compra mensual completada.
- Prueba de compra anual completada.
- Evidencia de `Customer`, `Subscription`, `Invoice` y `PaymentIntent`.
- Nota de riesgos para migración Worldline y futura transición a Zuora.

## Criterio de éxito

La POC se considera exitosa si se demuestra que:

- Un cliente puede contratar Madridista Platinum desde un link de pago alojado por Stripe.
- El primer pago se completa correctamente.
- Stripe crea una suscripción recurrente mensual o anual.
- El método de pago queda asociado para renovaciones.
- Los objetos de Stripe permiten operar el caso hasta la integración con Zuora.
