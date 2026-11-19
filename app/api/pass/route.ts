import { connection } from "next/server";
import { currentPass, passStatus } from "@/lib/pass-http";

export async function GET() {
  await connection();
  const pass = await currentPass();
  return Response.json(passStatus(pass));
}
