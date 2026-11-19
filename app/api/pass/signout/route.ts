import { connection } from "next/server";
import { logProcess } from "@/lib/log";
import { clearPassCookie } from "@/lib/pass-http";

export async function POST() {
  await connection();
  await clearPassCookie();
  logProcess("account", { step: "signout", result: "ok" });
  return Response.json({ active: false });
}
