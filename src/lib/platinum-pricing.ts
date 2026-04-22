export type BillingCycle = "monthly" | "yearly";
export type JerseyTier = "fan" | "authentic";

export type PricingKey = `${BillingCycle}_${JerseyTier}`;

export type PricingEntry = {
  amountCents: number;
  currency: string;
  label: string;
};

export const PLATINUM_CURRENCY = "eur";

export const PLATINUM_PRICING: Record<PricingKey, PricingEntry> = {
  monthly_fan: {
    amountCents: 1499,
    currency: PLATINUM_CURRENCY,
    label: "Madridista Platinum — Fan mensual",
  },
  yearly_fan: {
    amountCents: 14990,
    currency: PLATINUM_CURRENCY,
    label: "Madridista Platinum — Fan anual",
  },
  monthly_authentic: {
    amountCents: 2499,
    currency: PLATINUM_CURRENCY,
    label: "Madridista Platinum — Authentic mensual",
  },
  yearly_authentic: {
    amountCents: 24990,
    currency: PLATINUM_CURRENCY,
    label: "Madridista Platinum — Authentic anual",
  },
};

export function getPricing(billingCycle: BillingCycle, jerseyTier: JerseyTier) {
  return PLATINUM_PRICING[`${billingCycle}_${jerseyTier}`];
}

export function formatAmount(amountCents: number, currency: string) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}
