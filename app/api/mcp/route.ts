import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { connection } from "next/server";
import { createScoutServer } from "@/lib/scout-mcp";

async function handle(request: Request) {
  await connection();
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  const server = createScoutServer();
  await server.connect(transport);
  return transport.handleRequest(request);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
