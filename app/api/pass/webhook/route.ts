import { connection } from "next/server";
import { ensurePass } from "@/lib/pass-store";
import { stripeClient } from "@/lib/stripe";

export async function POST(request: Request) {
  await connection();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Webhook secret is not set." }, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing Stripe signature." }, { status: 400 });
  try {
    const event = stripeClient().webhooks.constructEvent(await request.text(), signature, secret);
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.payment_status === "paid") {
        const email = session.customer_details?.email || session.customer_email || "";
        await ensurePass(session.id, email);
      }
    }
    return Response.json({ received: true });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Invalid webhook.";
    return Response.json({ error: message }, { status: 400 });
  }
}
