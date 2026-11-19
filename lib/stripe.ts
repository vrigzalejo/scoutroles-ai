import Stripe from "stripe";

export function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Add STRIPE_SECRET_KEY on the server before selling a pass.");
  return new Stripe(key);
}
