import { sql } from "drizzle-orm";
import { authBaseUrl } from "@/lib/auth/origins";
import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * Liveness + setup check for load balancers, deploy pipelines and humans.
 * It reports *what* is wrong (no connection, tables not created, missing secret) without leaking secrets.
 */
export async function GET() {
  const config = { authSecretSet: Boolean(process.env.BETTER_AUTH_SECRET), baseUrl: authBaseUrl() };
  try {
    const rows = await getDb().execute<{ ok: boolean }>(
      sql`select (to_regclass('public."user"') is not null and to_regclass('public.challenges') is not null) as ok`,
    );
    if (!rows[0]?.ok) {
      return Response.json(
        { status: "migrations_missing", hint: "The database is reachable but its tables don't exist yet. Run `npm run db:migrate` against this DATABASE_URL.", config },
        { status: 503 },
      );
    }
    if (!config.authSecretSet) {
      return Response.json({ status: "auth_secret_missing", hint: "Set BETTER_AUTH_SECRET in the environment and redeploy.", config }, { status: 503 });
    }
    return Response.json({ status: "ok", config });
  } catch {
    return Response.json(
      { status: "database_unavailable", hint: "Could not connect. Check that DATABASE_URL is set and correct.", config },
      { status: 503 },
    );
  }
}
