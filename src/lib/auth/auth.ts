import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { isValidTimeZone } from "@/lib/core/dates";
import { authBaseUrl, trustedOrigins } from "./origins";

function create() {
  return betterAuth({
    baseURL: authBaseUrl(),
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: trustedOrigins(),
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
    }),
    emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128, autoSignIn: true },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    user: {
      additionalFields: {
        timezone: { type: "string", required: false, defaultValue: "UTC", input: true },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const tz = (user as { timezone?: string }).timezone;
            return { data: { ...user, timezone: tz && isValidTimeZone(tz) ? tz : "UTC" } };
          },
        },
      },
    },
    advanced: { cookiePrefix: "challenge-tracker" },
    plugins: [nextCookies()],
  });
}

let instance: ReturnType<typeof create> | undefined;
/** Created lazily so `next build` works without database credentials. */
export function getAuth() {
  return (instance ??= create());
}
