import { toNodeHandler } from "better-auth/node";
import { oAuthDiscoveryMetadata } from "better-auth/plugins";

import { auth } from "../auth/[...all]";

/**
 * RFC 8414 metadata, telling an OAuth client where to authorize, exchange and
 * register. Better Auth serves this under its own basePath, but clients look
 * for it at the domain root — next.config.js rewrites /.well-known/* here.
 */
export const config = { api: { bodyParser: false } };

export default toNodeHandler(oAuthDiscoveryMetadata(auth));
