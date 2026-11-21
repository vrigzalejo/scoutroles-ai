import { connection } from "next/server";
import { publishDraft, readDraft } from "@/lib/drafts";
import { logProcess } from "@/lib/log";
import { currentPass } from "@/lib/pass-http";
import { passIsActive } from "@/lib/pass-store";

export const maxDuration = 300;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  await connection();
  const pass = await currentPass();
  if (!passIsActive(pass)) {
    return Response.json({ error: "A free account is required." }, { status: 401 });
  }
  const { id } = await context.params;
  const draft = await readDraft(pass.id, id);
  if (!draft) {
    logProcess("draft", { step: "read", result: "missing" });
    return Response.json({ error: "That draft is not on this account." }, { status: 404 });
  }
  if (draft.status === "queued") await publishDraft(draft.id);
  return Response.json({
    id: draft.id,
    status: draft.status,
    text: draft.result?.text || "",
    model: draft.result?.model || "",
    document: draft.result?.document ?? null,
    error: draft.status === "failed" ? draft.error || "The draft failed." : "",
  });
}
