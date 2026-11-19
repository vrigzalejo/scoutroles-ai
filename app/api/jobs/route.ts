import { connection } from "next/server";
import { loadJobs } from "@/lib/aggregate";
import { currentPass } from "@/lib/pass-http";
import { passIsActive } from "@/lib/pass-store";

export async function GET(request: Request) {
  await connection();
  const pass = await currentPass();
  if (!passIsActive(pass)) {
    return Response.json({ error: "Start a free account to search roles." }, { status: 401 });
  }
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  try {
    const payload = await loadJobs(refresh);
    return Response.json(payload);
  } catch {
    return Response.json({ error: "Could not reach the job boards." }, { status: 502 });
  }
}
