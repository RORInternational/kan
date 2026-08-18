import { toNodeHandler } from "better-auth/node";
import { oAuthProtectedResourceMetadata } from "better-auth/plugins";

import { auth } from "../auth/[...all]";

/**
 * RFC 9728 metadata: names which authorization server guards this MCP
 * endpoint. Clients read it from the WWW-Authenticate header on a 401.
 */
export const config = { api: { bodyParser: false } };

export default toNodeHandler(oAuthProtectedResourceMetadata(auth));
