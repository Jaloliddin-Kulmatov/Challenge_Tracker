/**
 * Which browser origins may call the auth endpoints (Better Auth rejects everything else with
 * "Invalid origin" – a CSRF protection).
 *
 * On Vercel the same app answers on several hostnames: the production domain, a per-branch URL and a
 * per-deployment URL. All of them are provided by Vercel itself in system env vars, so they are safe to trust.
 */
type Env = Record<string, string | undefined>;

function toOrigin(value: string | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  try {
    return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).origin; // also drops a stray trailing slash / path
  } catch {
    return null;
  }
}

/** The canonical public URL of the app. */
export function authBaseUrl(env: Env = process.env): string {
  return toOrigin(env.BETTER_AUTH_URL) ?? toOrigin(env.VERCEL_PROJECT_PRODUCTION_URL) ?? "http://localhost:3000";
}

export function trustedOrigins(env: Env = process.env): string[] {
  const out = new Set<string>([authBaseUrl(env)]);
  for (const v of [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL, ...(env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") ?? [])]) {
    const o = toOrigin(v);
    if (o) out.add(o);
  }
  return [...out];
}
