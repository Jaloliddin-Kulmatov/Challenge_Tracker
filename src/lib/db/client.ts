import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Anything queries can run on: the pool or an open transaction. */
export type Executor = Db | Tx;

/**
 * Neon's "copy connection string" includes `channel_binding=require`, which the `postgres` driver forwards to the
 * server as a (non-existent) run-time setting and fails with "unrecognized configuration parameter".
 * Drop libpq-only options the driver doesn't understand.
 */
export function sanitizeDatabaseUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of ["channel_binding"]) u.searchParams.delete(key);
    return u.toString();
  } catch {
    return url;
  }
}

export function createDb(rawUrl: string, opts: { max?: number } = {}) {
  const url = sanitizeDatabaseUrl(rawUrl);
  // Transaction-mode poolers (Supabase :6543, PgBouncer) do not support prepared statements.
  const pooled = /pooler\.supabase\.com|:6543\//.test(url) || process.env.DATABASE_PREPARE === "false";
  const client = postgres(url, { max: opts.max ?? 10, prepare: !pooled, idle_timeout: 20, onnotice: () => {} });
  const db = drizzle(client, { schema, casing: "snake_case" });
  return { db, client };
}

const globalForDb = globalThis as unknown as { __db?: ReturnType<typeof createDb> };

/** Lazily-created shared connection (re-used across hot reloads in development). */
export function getDb(): Db {
  if (!globalForDb.__db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
    globalForDb.__db = createDb(url);
  }
  return globalForDb.__db.db;
}
