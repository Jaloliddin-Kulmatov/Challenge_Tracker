import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "../src/lib/db/client";

// Only production deploys change the real database. Preview deployments of unmerged branches would otherwise
// run their (possibly unfinished) migrations against it – or fail outright when the preview has no DATABASE_URL.
if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
  console.log(`Skipping migrations for a ${process.env.VERCEL_ENV} deployment.`);
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const { db, client } = createDb(url, { max: 1 });
try {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
} catch (err) {
  console.error("Migration failed:", err);
  process.exitCode = 1;
} finally {
  await client.end();
}
