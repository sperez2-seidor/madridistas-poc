import PlatinumFlow from "../platinum-flow";

export default function CheckoutPage() {
  return (
    <PlatinumFlow
      publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""}
    />
  );
}
