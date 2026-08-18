import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Serves the `window.__ENV` bundle that next-runtime-env reads on the client.
 *
 * next-runtime-env normally writes `public/__ENV.js` when next.config.js loads.
 * That file does not survive into the Vercel deployment, so `/__ENV.js` fell
 * through to the `[workspaceSlug]` catch-all and the browser was handed HTML to
 * execute as JavaScript. `window.__ENV` was therefore never set and every
 * client-side `env("NEXT_PUBLIC_…")` read undefined — which is why the login
 * page offered a magic link instead of a password field.
 *
 * Generating it per request also makes the values genuinely runtime-editable:
 * changing one in Vercel takes effect without a rebuild.
 *
 * Only NEXT_PUBLIC_-prefixed variables are included, matching what
 * next-runtime-env itself exposes. Nothing else may be added here — this
 * response is public.
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const publicEnv: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("NEXT_PUBLIC_") && typeof value === "string") {
      publicEnv[key] = value;
    }
  }

  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  // Short cache: long enough to avoid a round trip per page, short enough that
  // an env change in Vercel is picked up without anyone clearing anything.
  res.setHeader("Cache-Control", "public, max-age=60, must-revalidate");
  res.status(200).send(`window.__ENV = ${JSON.stringify(publicEnv)};`);
}
