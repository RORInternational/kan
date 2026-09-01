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
 */

/**
 * Every NEXT_PUBLIC_ variable the client actually reads, and nothing else.
 *
 * A prefix match is not safe here. Vercel's "System Environment Variables"
 * setting injects NEXT_PUBLIC_VERCEL_* at runtime — including the full commit
 * message and internal project ids — and a prefix match published all of it to
 * anyone who loaded the page. Listing the keys keeps this response independent
 * of whatever the platform decides to inject.
 *
 * Adding a client variable means adding it here too; it is otherwise undefined
 * in the browser.
 */
const PUBLIC_ENV_KEYS = [
  "NEXT_PUBLIC_ALLOW_CREDENTIALS",
  "NEXT_PUBLIC_APP_VERSION",
  "NEXT_PUBLIC_ATTACHMENTS_BUCKET_NAME",
  "NEXT_PUBLIC_AVATAR_BUCKET_NAME",
  "NEXT_PUBLIC_BASE_URL",
  "NEXT_PUBLIC_DISABLE_EMAIL",
  "NEXT_PUBLIC_DISABLE_SIGN_UP",
  "NEXT_PUBLIC_KAN_ENV",
  "NEXT_PUBLIC_PARTNER_NAME",
  "NEXT_PUBLIC_POSTHOG_HOST",
  "NEXT_PUBLIC_POSTHOG_KEY",
  "NEXT_PUBLIC_STORAGE_DOMAIN",
  "NEXT_PUBLIC_STORAGE_URL",
  "NEXT_PUBLIC_UMAMI_ID",
  "NEXT_PUBLIC_USE_STANDALONE_OUTPUT",
  "NEXT_PUBLIC_USE_VIRTUAL_HOSTED_URLS",
  "NEXT_PUBLIC_WHITE_LABEL_HIDE_POWERED_BY",
] as const;

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const publicEnv: Record<string, string> = {};

  for (const key of PUBLIC_ENV_KEYS) {
    const value = process.env[key];
    if (typeof value === "string") publicEnv[key] = value;
  }

  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  // Short cache: long enough to avoid a round trip per page, short enough that
  // an env change in Vercel is picked up without anyone clearing anything.
  res.setHeader("Cache-Control", "public, max-age=60, must-revalidate");
  res.status(200).send(`window.__ENV = ${JSON.stringify(publicEnv)};`);
}
