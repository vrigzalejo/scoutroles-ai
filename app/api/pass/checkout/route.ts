import { connection } from "next/server";
import { PASS_PRICE_CENTS } from "@/lib/pass";
import { stripeClient } from "@/lib/stripe";

export async function POST(request: Request) {
  await connection();
  try {
    const stripe = stripeClient();
    const origin = new URL(request.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${origin}/pass?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: PASS_PRICE_CENTS,
            product_data: {
              name: "ScoutRoles search account",
              description: "Gemini letters and a tracker saved with the account.",
            },
          },
        },
      ],
      metadata: { product: "search-pass" },
    });
    return Response.json({ url: session.url });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Could not start checkout.";
    return Response.json({ error: message }, { status: 503 });
  }
}
