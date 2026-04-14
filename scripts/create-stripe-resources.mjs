import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadLocalEnv() {
  const envPath = join(process.cwd(), ".env.local");

  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split("=");
    const value = valueParts.join("=").replace(/^['"]|['"]$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadLocalEnv();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  console.error("Missing STRIPE_SECRET_KEY. Set it locally, for example:");
  console.error("STRIPE_SECRET_KEY=sk_test_... npm run stripe:setup");
  console.error("or add STRIPE_SECRET_KEY=sk_test_... to .env.local");
  process.exit(1);
}

if (!stripeSecretKey.startsWith("sk_test_")) {
  console.error("Refusing to run without a Stripe test secret key.");
  process.exit(1);
}

const apiBase = "https://api.stripe.com/v1";
const runId = "real_madrid_madridista_platinum_poc";

async function stripeRequest(path, params, idempotencyKey) {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": idempotencyKey,
    },
    body: new URLSearchParams(params),
  });

  const body = await response.json();

  if (!response.ok) {
    throw new Error(
      `${body.error?.message ?? "Stripe request failed"} (${response.status})`
    );
  }

  return body;
}

const product = await stripeRequest(
  "/products",
  {
    name: "Madridista Platinum",
    description:
      "La camiseta de cada temporada. Pack de bienvenida. Todos los beneficios de Madridista Premium.",
    "metadata[poc]": runId,
  },
  `${runId}_product`
);

const monthlyPrice = await stripeRequest(
  "/prices",
  {
    product: product.id,
    unit_amount: "1290",
    currency: "eur",
    "recurring[interval]": "month",
    lookup_key: "madridista_platinum_monthly_1290_eur",
    "metadata[poc]": runId,
    "metadata[cadence]": "monthly",
  },
  `${runId}_price_monthly`
);

const yearlyPrice = await stripeRequest(
  "/prices",
  {
    product: product.id,
    unit_amount: "14990",
    currency: "eur",
    "recurring[interval]": "year",
    lookup_key: "madridista_platinum_yearly_14990_eur",
    "metadata[poc]": runId,
    "metadata[cadence]": "yearly",
  },
  `${runId}_price_yearly`
);

const monthlyAuthenticPrice = await stripeRequest(
  "/prices",
  {
    product: product.id,
    unit_amount: "1690",
    currency: "eur",
    "recurring[interval]": "month",
    lookup_key: "madridista_platinum_authentic_monthly_1690_eur",
    "metadata[poc]": runId,
    "metadata[cadence]": "monthly",
    "metadata[jersey_tier]": "authentic",
  },
  `${runId}_price_monthly_authentic`
);

const yearlyAuthenticPrice = await stripeRequest(
  "/prices",
  {
    product: product.id,
    unit_amount: "19490",
    currency: "eur",
    "recurring[interval]": "year",
    lookup_key: "madridista_platinum_authentic_yearly_19490_eur",
    "metadata[poc]": runId,
    "metadata[cadence]": "yearly",
    "metadata[jersey_tier]": "authentic",
  },
  `${runId}_price_yearly_authentic`
);

const monthlyPaymentLink = await stripeRequest(
  "/payment_links",
  {
    "line_items[0][price]": monthlyPrice.id,
    "line_items[0][quantity]": "1",
    "metadata[poc]": runId,
    "metadata[cadence]": "monthly",
  },
  `${runId}_payment_link_monthly`
);

const yearlyPaymentLink = await stripeRequest(
  "/payment_links",
  {
    "line_items[0][price]": yearlyPrice.id,
    "line_items[0][quantity]": "1",
    "metadata[poc]": runId,
    "metadata[cadence]": "yearly",
  },
  `${runId}_payment_link_yearly`
);

const monthlyAuthenticPaymentLink = await stripeRequest(
  "/payment_links",
  {
    "line_items[0][price]": monthlyAuthenticPrice.id,
    "line_items[0][quantity]": "1",
    "metadata[poc]": runId,
    "metadata[cadence]": "monthly",
    "metadata[jersey_tier]": "authentic",
  },
  `${runId}_payment_link_monthly_authentic`
);

const yearlyAuthenticPaymentLink = await stripeRequest(
  "/payment_links",
  {
    "line_items[0][price]": yearlyAuthenticPrice.id,
    "line_items[0][quantity]": "1",
    "metadata[poc]": runId,
    "metadata[cadence]": "yearly",
    "metadata[jersey_tier]": "authentic",
  },
  `${runId}_payment_link_yearly_authentic`
);

console.log("Stripe resources created in the account tied to STRIPE_SECRET_KEY.");
console.log("");
console.log(`Product: ${product.id}`);
console.log(`Monthly price: ${monthlyPrice.id}`);
console.log(`Yearly price: ${yearlyPrice.id}`);
console.log(`Monthly authentic price: ${monthlyAuthenticPrice.id}`);
console.log(`Yearly authentic price: ${yearlyAuthenticPrice.id}`);
console.log("");
console.log("Add these to .env.local:");
console.log(`STRIPE_MONTHLY_PRICE_ID=${monthlyPrice.id}`);
console.log(`STRIPE_YEARLY_PRICE_ID=${yearlyPrice.id}`);
console.log(`STRIPE_MONTHLY_AUTHENTIC_PRICE_ID=${monthlyAuthenticPrice.id}`);
console.log(`STRIPE_YEARLY_AUTHENTIC_PRICE_ID=${yearlyAuthenticPrice.id}`);
console.log(`NEXT_PUBLIC_STRIPE_MONTHLY_PAYMENT_LINK_URL=${monthlyPaymentLink.url}`);
console.log(`NEXT_PUBLIC_STRIPE_YEARLY_PAYMENT_LINK_URL=${yearlyPaymentLink.url}`);
console.log(
  `NEXT_PUBLIC_STRIPE_MONTHLY_AUTHENTIC_PAYMENT_LINK_URL=${monthlyAuthenticPaymentLink.url}`
);
console.log(
  `NEXT_PUBLIC_STRIPE_YEARLY_AUTHENTIC_PAYMENT_LINK_URL=${yearlyAuthenticPaymentLink.url}`
);
