import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerBoardTools } from "./tools/board.js";
import { registerCardTools } from "./tools/card.js";
import { registerChecklistTools } from "./tools/checklist.js";
import { registerLabelTools } from "./tools/label.js";
import { registerListTools } from "./tools/list.js";
import { registerMemberTools } from "./tools/member.js";
import { registerWorkspaceTools } from "./tools/workspace.js";

export const SERVER_NAME = "kan";
export const SERVER_VERSION = "0.1.0";

/**
 * Builds a server with every tool registered. Shared by both entry points: the
 * stdio binary connects one long-lived instance, the HTTP route builds a fresh
 * one per request so no state can cross between users.
 */
export function buildServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerWorkspaceTools(server);
  registerBoardTools(server);
  registerListTools(server);
  registerCardTools(server);
  registerChecklistTools(server);
  registerLabelTools(server);
  registerMemberTools(server);

  return server;
}
