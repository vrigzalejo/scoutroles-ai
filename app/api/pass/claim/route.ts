import { connection } from "next/server";
import { logProcess } from "@/lib/log";
import { passStatus, setPassCookie } from "@/lib/pass-http";
import { ensurePass } from "@/lib/pass-store";
import { stripeClient } from "@/lib/stripe";

export async function POST(request: Request) {
  await connection();
  const body = (await request.json().catch(() => null)) as { sessionId?: string } | null;
  const sessionId = body?.sessionId?.trim() || "";
  if (!sessionId.startsWith("cs_")) {
    logProcess("checkout", { step: "claim", result: "missing" });
    return Response.json({ error: "That checkout session is missing." }, { status: 400 });
  }
  try {
    const session = await stripeClient().checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      logProcess("checkout", { step: "claim", result: "unpaid" });
      return Response.json({ error: "That payment is not complete yet." }, { status: 402 });
    }
    const email = session.customer_details?.email || session.customer_email || "";
    const pass = await ensurePass(session.id, email);
    await setPassCookie(pass.token);
    logProcess("checkout", { step: "claim", result: "ok" });
    return Response.json(passStatus(pass));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Could not open that pass.";
    logProcess("checkout", { step: "claim", result: "failed", message });
    return Response.json({ error: message }, { status: 400 });
  }
}
