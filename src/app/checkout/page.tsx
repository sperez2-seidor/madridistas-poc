import PlatinumFlow, { type LeadForm } from "../platinum-flow";

type CheckoutPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function getPrefilledForm(
  params: Record<string, string | string[] | undefined>,
): Partial<LeadForm> {
  const billingCycle = getParam(params, "billingCycle");
  const jerseyTier = getParam(params, "jerseyTier");
  const paymentMethod = getParam(params, "paymentMethod");

  return {
    firstName: getParam(params, "firstName") || "Juan",
    lastName: getParam(params, "lastName") || "Pérez",
    email:
      getParam(params, "email") ||
      getParam(params, "prefilled_email") ||
      "juan.perez@example.com",
    cardFirstName: getParam(params, "cardFirstName") || "Juan",
    cardLastName: getParam(params, "cardLastName") || "Pérez",
    billingCycle: billingCycle === "yearly" ? "yearly" : "monthly",
    jerseyTier: jerseyTier === "authentic" ? "authentic" : "fan",
    addressLine1:
      getParam(params, "addressLine1") || "Calle de Goya 12",
    postalCode: getParam(params, "postalCode") || "28001",
    city: getParam(params, "city") || "Madrid",
    region: getParam(params, "region") || "Comunidad de Madrid",
    country: getParam(params, "country") || "España",
    paymentMethod: paymentMethod === "paypal" ? "paypal" : "card",
  };
}

export default async function CheckoutPage({
  searchParams,
}: CheckoutPageProps) {
  const params = searchParams ? await searchParams : {};

  return (
    <PlatinumFlow prefilledForm={getPrefilledForm(params)} />
  );
}
