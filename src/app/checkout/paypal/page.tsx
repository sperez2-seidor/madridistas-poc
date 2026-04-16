import PaypalCheckoutClient from "./paypal-client";

type PaypalCheckoutPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
  fallback?: string,
) {
  const value = params[key];
  if (Array.isArray(value)) {
    return value[0] || fallback || "";
  }

  return value || fallback || "";
}

export default async function PaypalCheckoutPage({
  searchParams,
}: PaypalCheckoutPageProps) {
  const params = searchParams ? await searchParams : {};

  return (
    <PaypalCheckoutClient
      email={getParam(params, "email", "juan.perez@example.com")}
      firstName={getParam(params, "firstName", "Juan")}
      lead={getParam(params, "lead")}
    />
  );
}
