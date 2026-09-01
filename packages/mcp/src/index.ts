#!/usr/bin/env node
/**
 * The stdio entry point — the `kan-mcp` binary, for clients that launch a local
 * subprocess.
 *
 * It is one of two transports over the same tools. The other is Streamable HTTP
 * at `/api/mcp` in the web app, which is what remote clients use and which also
 * accepts OAuth. Here the process serves exactly one person, so credentials come
 * from `KAN_BASE_URL` / `KAN_API_TOKEN` in the environment; see `client.ts` for
 * why the HTTP path cannot do that.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { buildServer } from "./server.js";

const server = buildServer();

const transport = new StdioServerTransport();
await server.connect(transport);
