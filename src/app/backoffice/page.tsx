import {
  listAllCustomers,
  listCustomersWithPaymentMethod,
} from "@/lib/platinum-customers";
import { listRecentCharges } from "@/lib/platinum-charges";
import { formatAmount } from "@/lib/platinum-pricing";
import ChargeButton from "./charge-button";
import UpdateCardButton from "./update-card-button";

export const dynamic = "force-dynamic";

type BackofficePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function hasDatabase() {
  return Boolean(process.env.DATABASE_URL) || process.env.VERCEL !== "1";
}

function getParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function BackofficePage({
  searchParams,
}: BackofficePageProps) {
  const dbConnected = hasDatabase();
  const params = searchParams ? await searchParams : {};
  const cardUpdatedFor = getParam(params, "card_updated");
  const cardCancelledFor = getParam(params, "card_update_cancelled");

  const [customers, allCustomers, charges] = await Promise.all([
    listCustomersWithPaymentMethod(),
    listAllCustomers(),
    listRecentCharges(200),
  ]);

  const chargesByCustomer = new Map<string, typeof charges>();
  for (const charge of charges) {
    if (!charge.customerId) continue;
    const bucket = chargesByCustomer.get(charge.customerId) ?? [];
    bucket.push(charge);
    chargesByCustomer.set(charge.customerId, bucket);
  }

  const customersWithoutPm = allCustomers.filter(
    (c) => !c.stripePaymentMethodId,
  );

  return (
    <main className="backoffice">
      <header className="backoffice-header">
        <h1>Backoffice · Motor de recobro mock</h1>
        <p>
          Simula el motor de billing del cliente. Cada cliente con tarjeta
          guardada (<code>stripe_payment_method_id</code>) puede recibir un
          cobro off-session ahora mismo.
        </p>
      </header>

      {cardUpdatedFor ? (
        <section className="backoffice-banner backoffice-banner-ok">
          Tarjeta actualizada para el cliente <code>{cardUpdatedFor}</code>. Si
          no ves el nuevo <code>stripe_payment_method_id</code>, asegúrate de
          que el webhook está escuchando (<code>stripe listen</code>).
        </section>
      ) : null}

      {cardCancelledFor ? (
        <section className="backoffice-banner backoffice-banner-ko">
          El socio canceló el cambio de tarjeta.
        </section>
      ) : null}

      {!dbConnected ? (
        <section className="backoffice-empty">
          <strong>⚠️ Base de datos no configurada.</strong>
          <p>
            Define <code>DATABASE_URL</code> en <code>.env.local</code> y
            arranca Postgres (<code>docker compose up -d</code>). Después
            aplica el schema con{" "}
            <code>psql $DATABASE_URL -f db/schema.sql</code>.
          </p>
        </section>
      ) : customers.length === 0 ? (
        <section className="backoffice-empty">
          <p>
            <strong>No hay clientes con método de pago guardado.</strong>
          </p>
          <p>
            {customersWithoutPm.length > 0 ? (
              <>
                Hay <strong>{customersWithoutPm.length}</strong> cliente(s) en
                la tabla intermedia pero todavía sin{" "}
                <code>stripe_payment_method_id</code>. Esto ocurre si el
                checkout no se completó o si el webhook no llegó.
              </>
            ) : (
              <>
                Completa un alta en <code>/checkout</code> pagando la primera
                cuota para que aparezca aquí.
              </>
            )}
          </p>
          <p className="backoffice-muted">
            Para que el webhook confirme el pago en local:
            <br />
            <code>
              stripe listen --forward-to localhost:3000/api/stripe-webhook
            </code>
          </p>
          {customersWithoutPm.length > 0 ? (
            <section className="backoffice-pending">
              <h3>Clientes sin tarjeta todavía</h3>
              <ul>
                {customersWithoutPm.map((c) => (
                  <li key={c.id}>
                    <strong>{c.email}</strong> — {c.firstName} {c.lastName} ·{" "}
                    {c.stripeCustomerId ? (
                      <>
                        Stripe: <code>{c.stripeCustomerId}</code>
                      </>
                    ) : (
                      <em>Aún sin Stripe customer</em>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </section>
      ) : (
        <section className="backoffice-grid">
          {customers.map((customer) => {
            const customerCharges = chargesByCustomer.get(customer.id) ?? [];
            return (
              <article key={customer.id} className="backoffice-card">
                <header>
                  <h2>
                    {customer.firstName} {customer.lastName}
                  </h2>
                  <p>{customer.email}</p>
                  <dl>
                    <div>
                      <dt>Plan</dt>
                      <dd>
                        {customer.billingCycle === "yearly"
                          ? "Anual"
                          : "Mensual"}{" "}
                        ·{" "}
                        {customer.jerseyTier === "authentic"
                          ? "Authentic"
                          : "Fan"}
                      </dd>
                    </div>
                    <div>
                      <dt>Importe</dt>
                      <dd>
                        {customer.amountCents && customer.currency
                          ? formatAmount(
                              customer.amountCents,
                              customer.currency,
                            )
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Customer (Stripe)</dt>
                      <dd>
                        <code>{customer.stripeCustomerId}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Payment method</dt>
                      <dd>
                        <code>{customer.stripePaymentMethodId}</code>
                        {customer.cardBrand && customer.cardLast4 ? (
                          <small>
                            {" "}
                            {customer.cardBrand.toUpperCase()} ····{" "}
                            {customer.cardLast4}
                          </small>
                        ) : null}
                      </dd>
                    </div>
                  </dl>
                </header>

                <div className="backoffice-actions">
                  <ChargeButton
                    customerId={customer.id}
                    amountLabel={
                      customer.amountCents && customer.currency
                        ? formatAmount(customer.amountCents, customer.currency)
                        : "importe del plan"
                    }
                  />
                  <UpdateCardButton customerId={customer.id} />
                </div>

                <section className="backoffice-history">
                  <h3>Historial</h3>
                  {customerCharges.length === 0 ? (
                    <p className="backoffice-muted">Sin cobros registrados.</p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Tipo</th>
                          <th>Importe</th>
                          <th>Estado</th>
                          <th>PaymentIntent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customerCharges.map((charge) => (
                          <tr key={charge.id}>
                            <td>
                              {new Date(charge.createdAt).toLocaleString(
                                "es-ES",
                              )}
                            </td>
                            <td>{charge.kind}</td>
                            <td>
                              {formatAmount(
                                charge.amountCents,
                                charge.currency,
                              )}
                            </td>
                            <td>
                              <span
                                className={`charge-status charge-status-${charge.status}`}
                              >
                                {charge.status}
                              </span>
                              {charge.failureMessage ? (
                                <small>{charge.failureMessage}</small>
                              ) : null}
                            </td>
                            <td>
                              <code>
                                {charge.stripePaymentIntentId ?? "—"}
                              </code>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
