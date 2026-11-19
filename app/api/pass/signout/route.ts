import { connection } from "next/server";
import { clearPassCookie } from "@/lib/pass-http";

export async function POST() {
  await connection();
  await clearPassCookie();
  return Response.json({ active: false });
}
