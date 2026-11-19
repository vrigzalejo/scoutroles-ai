import { connection } from "next/server";
import { logProcess } from "@/lib/log";

export async function POST() {
  await connection();
  logProcess("account", { step: "password-start", result: "disabled" });
  return Response.json({ error: "Sign in with Google." }, { status: 400 });
}
