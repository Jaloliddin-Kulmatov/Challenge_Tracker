import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import path from "node:path";

/** Fresh, disposable database for the browser tests (build the app first: `npm run build`). */
export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? "postgres://app:app@127.0.0.1:5432/challenges_e2e";
  if (!/_e2e$/.test(new URL(url).pathname.slice(1))) throw new Error("E2E database name must end in _e2e");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await migrate(drizzle(sql), { migrationsFolder: path.resolve(import.meta.dirname, "../../drizzle") });
  await sql.end();
}
