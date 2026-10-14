import { describe, expect, it } from "vitest";
import { sanitizeDatabaseUrl } from "@/lib/db/client";

describe("sanitizeDatabaseUrl", () => {
  it("removes Neon's channel_binding option but keeps everything else", () => {
    const out = new URL(sanitizeDatabaseUrl("postgresql://user:pw@ep-x-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"));
    expect(out.searchParams.get("channel_binding")).toBeNull();
    expect(out.searchParams.get("sslmode")).toBe("require");
    expect(out.username).toBe("user");
    expect(out.password).toBe("pw");
    expect(out.pathname).toBe("/neondb");
  });
  it("leaves ordinary URLs and unparsable strings alone", () => {
    expect(sanitizeDatabaseUrl("postgres://app:app@127.0.0.1:5432/db")).toBe("postgres://app:app@127.0.0.1:5432/db");
    expect(sanitizeDatabaseUrl("not a url")).toBe("not a url");
  });
});
