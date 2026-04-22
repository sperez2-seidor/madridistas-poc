import { listLeadsWithPaymentMethod } from "@/lib/platinum-leads";
import { listRecentCharges } from "@/lib/platinum-charges";
import { formatAmount } from "@/lib/platinum-pricing";
import ChargeButton from "./charge-button";

export const dynamic = "force-dynamic";

export default async function BackofficePage() {
  const [leads, charges] = await Promise.all([
    listLeadsWithPaymentMethod(),
    listRecentCharges(100),
  ]);

  const chargesByLead = new Map<string, typeof charges>();
  for (const charge of charges) {
    const bucket = chargesByLead.get(charge.leadId) ?? [];
    bucket.push(charge);
    chargesByLead.set(charge.leadId, bucket);
  }

  return (
    <main className="backoffice">
      <header className="backoffice-header">
        <h1>Backoffice · Motor de recobro mock</h1>
        <p>
          Simula el motor de billing del cliente. Cada lead con tarjeta guardada
          puede recibir un cobro off-session ahora mismo.
        </p>
      </header>

      {leads.length === 0 ? (
        <section className="backoffice-empty">
          <p>No hay leads con método de pago guardado todavía.</p>
          <p>
            Completa un alta en <code>/checkout</code> pagando la primera cuota
            para que aparezca aquí.
          </p>
        </section>
      ) : (
        <section className="backoffice-grid">
          {leads.map((lead) => {
            const leadCharges = chargesByLead.get(lead.id) ?? [];
            return (
              <article key={lead.id} className="backoffice-card">
                <header>
                  <h2>
                    {lead.firstName} {lead.lastName}
                  </h2>
                  <p>{lead.email}</p>
                  <dl>
                    <div>
                      <dt>Plan</dt>
                      <dd>
                        {lead.billingCycle === "yearly" ? "Anual" : "Mensual"} ·{" "}
                        {lead.jerseyTier === "authentic"
                          ? "Authentic"
                          : "Fan"}
                      </dd>
                    </div>
                    <div>
                      <dt>Importe</dt>
                      <dd>
                        {lead.amountCents && lead.currency
                          ? formatAmount(lead.amountCents, lead.currency)
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Customer</dt>
                      <dd>
                        <code>{lead.stripeCustomerId}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Payment method</dt>
                      <dd>
                        <code>{lead.stripePaymentMethodId}</code>
                      </dd>
                    </div>
                  </dl>
                </header>

                <ChargeButton
                  leadId={lead.id}
                  amountLabel={
                    lead.amountCents && lead.currency
                      ? formatAmount(lead.amountCents, lead.currency)
                      : "importe del plan"
                  }
                />

                <section className="backoffice-history">
                  <h3>Historial</h3>
                  {leadCharges.length === 0 ? (
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
                        {leadCharges.map((charge) => (
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
