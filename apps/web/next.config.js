import { fileURLToPath } from "url";
import createJiti from "jiti";
import { env } from "next-runtime-env";
import { configureRuntimeEnv } from "next-runtime-env/build/configure.js";

// Import env files to validate at build time. Use jiti so we can load .ts files in here.
createJiti(fileURLToPath(import.meta.url))("./src/env");

configureRuntimeEnv();

/** @type {import("next").NextConfig} */
const config = {
  allowedDevOrigins: ["dnd-ms-2s-mac-studio.tail6f8395.ts.net"],
  output:
    env("NEXT_PUBLIC_USE_STANDALONE_OUTPUT") === "true"
      ? "standalone"
      : undefined,
  reactStrictMode: true,

  /** Exclude build tools and dev-only packages from the standalone output */
  outputFileTracingExcludes: {
    "**/*": [
      "@esbuild/**",
      "esbuild/**",
      "typescript/**",
      "webpack/**",
      "uglify-js/**",
      "terser/**",
    ],
  },


  /** Enables hot reloading for local packages without a build step */
  transpilePackages: [
    "@kan/api",
    "@kan/db",
    "@kan/shared",
    "@kan/auth",
    "@kan/stripe",
  ],

  /** We already do linting and typechecking as separate tasks in CI */
  typescript: { ignoreBuildErrors: true },

  // temporarily ignore eslint errors during build until we fix all the errors sigh
  eslint: { ignoreDuringBuilds: true },

  images: {
    remotePatterns: (() => {
      /** @type {Array<{protocol: "http" | "https", hostname: string}>} */
      const patterns = [
        { protocol: "https", hostname: "**" },
        {
          protocol: "http",
          hostname: "localhost",
        },
      ];

      return patterns;
    })(),
  },
  turbopack: {
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
  },
  serverExternalPackages: ["pino"],

  experimental: {
    // instrumentationHook: true,
    swcPlugins: [["@lingui/swc-plugin", {}]],
  },

  async rewrites() {
    return [
      {
        source: "/settings",
        destination: "/settings/account",
      },
      {
        /**
         * next-runtime-env writes public/__ENV.js when this config loads, but
         * that file does not reach the Vercel deployment, so the request fell
         * through to the [workspaceSlug] catch-all and the browser executed
         * HTML as JavaScript. Serving it from a route removes the dependency on
         * build-time file placement entirely.
         */
        source: "/__ENV.js",
        destination: "/api/public-env",
      },
      {
        /**
         * OAuth clients look for these at the domain root. Without the rewrite
         * they fall through to [workspaceSlug] and the client is handed HTML,
         * which reads to it as "this server advertises nothing".
         */
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/well-known/oauth-authorization-server",
      },
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/well-known/oauth-protected-resource",
      },
      /**
       * RFC 9728 has the client insert the well-known segment *before* the
       * resource path, so a client discovering /api/mcp asks for
       * /.well-known/oauth-protected-resource/api/mcp. Without these the
       * suffixed form falls through to [workspaceSlug] and the client is
       * handed a 200 of board HTML — which it reports as metadata that is
       * missing its required fields, rather than as a missing endpoint.
       *
       * One MCP endpoint is guarded by one authorization server here, so the
       * same document answers every resource path.
       */
      {
        source: "/.well-known/oauth-protected-resource/:path*",
        destination: "/api/well-known/oauth-protected-resource",
      },
      {
        source: "/.well-known/oauth-authorization-server/:path*",
        destination: "/api/well-known/oauth-authorization-server",
      },
    ];
  },
};

// Only allow external images when OIDC is configured (for OIDC provider avatars)
if (
  env("OIDC_CLIENT_ID") &&
  env("OIDC_CLIENT_SECRET") &&
  env("OIDC_DISCOVERY_URL")
) {
  config.images?.remotePatterns?.push({
    protocol: "https",
    hostname: "**",
  });
}

export default config;
