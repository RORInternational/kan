import type { NextApiRequest, NextApiResponse } from "next";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { env } from "next-runtime-env";

import { kanContext } from "@kan/mcp/client";
import { buildServer } from "@kan/mcp/server";
import { createLogger } from "@kan/logger";

const log = createLogger("mcp");

/**
 * Streamable HTTP transport for the Kan MCP server.
 *
 * Runs stateless: a fresh server and transport per request, with the caller's
 * own API key carried through `kanContext`. The key is never stored here — it
 * is forwarded verbatim to the REST API, which resolves it to a user session,
 * so every tool call is authorised as whoever sent it.
 */
const jsonRpcError = (code: number, message: string) => ({
  jsonrpc: "2.0" as const,
  error: { code, message },
  id: null,
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") {
    return res.status(200).json({ status: "ok", transport: "streamable-http" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json(jsonRpcError(-32000, "Method not allowed"));
  }

  const authorization = req.headers.authorization;
  const apiToken = authorization?.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : undefined;

  if (!apiToken) {
    return res
      .status(401)
      .json(
        jsonRpcError(
          -32001,
          "Missing bearer token. Send your Kan API key as 'Authorization: Bearer kan_...'.",
        ),
      );
  }

  const baseUrl = env("NEXT_PUBLIC_BASE_URL");

  if (!baseUrl) {
    log.error("NEXT_PUBLIC_BASE_URL is not set, cannot reach the REST API");
    return res
      .status(500)
      .json(jsonRpcError(-32603, "Server is missing NEXT_PUBLIC_BASE_URL"));
  }

  await kanContext.run({ baseUrl, apiToken }, async () => {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({
      // Stateless: no session state can leak between users.
      sessionIdGenerator: undefined,
      // Every tool is a plain request/response REST call, so plain JSON beats an
      // SSE stream here — serverless functions stay alive for the life of a
      // stream, and platform buffering makes SSE the flakier of the two.
      enableJsonResponse: true,
    });

    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      log.error({ err: error }, "MCP request failed");
      if (!res.headersSent) {
        res.status(500).json(jsonRpcError(-32603, "Internal server error"));
      }
    }
  });
}
