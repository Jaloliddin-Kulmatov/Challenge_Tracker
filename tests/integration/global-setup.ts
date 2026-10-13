import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import path from "node:path";

/** Rebuild the (disposable!) test database from the real migration files before the suite runs. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://app:app@127.0.0.1:5432/challenges_test";
  const dbName = new URL(url).pathname.slice(1);
  if (!/_test$/.test(dbName)) throw new Error(`Refusing to reset "${dbName}": the test database name must end in _test.`);
  process.env.TEST_DATABASE_URL = url;

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await migrate(drizzle(sql), { migrationsFolder: path.resolve(import.meta.dirname, "../../drizzle") });
  await sql.end();
}
