import { handleCallback } from "@vercel/queue";
import { processDraft } from "@/lib/drafts";

export const maxDuration = 300;

export const POST = handleCallback<{ id?: string }>(
  async (message) => {
    if (!message?.id) return;
    await processDraft(message.id);
  },
  {
    visibilityTimeoutSeconds: 300,
    retry: (error, metadata) => {
      if (error instanceof Error && error.name === "DraftBusy") return { afterSeconds: 20 };
      if (metadata.deliveryCount >= 3) return { acknowledge: true };
      return { afterSeconds: 30 };
    },
  },
);
