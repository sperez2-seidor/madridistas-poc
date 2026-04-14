import PlatinumFlow from "./platinum-flow";

const paymentLinks = {
  monthlyFan: process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PAYMENT_LINK_URL,
  yearlyFan: process.env.NEXT_PUBLIC_STRIPE_YEARLY_PAYMENT_LINK_URL,
  monthlyAuthentic:
    process.env.NEXT_PUBLIC_STRIPE_MONTHLY_AUTHENTIC_PAYMENT_LINK_URL,
  yearlyAuthentic:
    process.env.NEXT_PUBLIC_STRIPE_YEARLY_AUTHENTIC_PAYMENT_LINK_URL,
};

export default function Home() {
  return <PlatinumFlow paymentLinks={paymentLinks} />;
}
