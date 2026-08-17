import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { PGlite } from "@electric-sql/pglite";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePgLite } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";

import { createLogger } from "@kan/logger";

import * as schema from "./schema";

const log = createLogger("db");

export type dbClient = NodePgDatabase<typeof schema> & {
  $client: Pool;
};

/**
 * Cached across calls. `createDrizzleClient` runs on every request (see the
 * three context creators in `packages/api/src/trpc.ts`), so creating a new Pool
 * each time would open a fresh set of connections per request. On serverless
 * that exhausts the database connection limit almost immediately.
 */
let cachedPool: Pool | null = null;
let cachedClient: dbClient | null = null;

export const createDrizzleClient = (): dbClient => {
  if (cachedClient) return cachedClient;

  const connectionString = process.env.POSTGRES_URL;

  if (!connectionString) {
    // PGLite writes to the local filesystem, which is read-only and ephemeral
    // on serverless hosts. Failing loudly here beats a confusing runtime error.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "POSTGRES_URL is not set. A Postgres connection string is required in production.",
      );
    }

    log.warn("POSTGRES_URL not set, falling back to PGLite");

    const client = new PGlite({
      dataDir: "./pgdata",
      extensions: { uuid_ossp },
    });
    const db = drizzlePgLite(client, { schema });

    void migrate(db, { migrationsFolder: "../../packages/db/migrations" });

    cachedClient = db as unknown as dbClient;
    return cachedClient;
  }

  cachedPool ??= new Pool({
    connectionString,
    // Defaults to node-postgres' own default, which suits a long-running
    // server. Serverless scales by running many instances with a few
    // connections each rather than one instance with many, so set this to 1
    // there and let a transaction pooler absorb the fan-out.
    max: Number(process.env.POSTGRES_POOL_MAX ?? 10),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

  cachedClient = drizzlePg(cachedPool, { schema }) as dbClient;
  return cachedClient;
};
