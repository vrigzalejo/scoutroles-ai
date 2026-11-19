import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { connection } from "next/server";
import { errorDetail, logProcess } from "@/lib/log";
import { createScoutServer } from "@/lib/scout-mcp";

async function handle(request: Request) {
  await connection();
  try {
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
    const server = createScoutServer();
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    logProcess("mcp", { step: request.method, result: "ok", status: response.status });
    return response;
  } catch (cause) {
    const detail = errorDetail(cause);
    logProcess("mcp", { step: request.method, result: "failed", ...detail });
    throw cause;
  }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
