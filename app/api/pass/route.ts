import { connection } from "next/server";
import { logProcess } from "@/lib/log";
import { currentPass, passStatus } from "@/lib/pass-http";

export async function GET() {
  await connection();
  const pass = await currentPass();
  const status = passStatus(pass);
  logProcess("account", { step: "status", result: status.active ? "signed-in" : "signed-out", gemini: status.gemini });
  return Response.json(status);
}
