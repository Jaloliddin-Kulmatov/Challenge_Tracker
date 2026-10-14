import { describe, expect, it } from "vitest";
import { authBaseUrl, trustedOrigins } from "@/lib/auth/origins";

describe("auth origins", () => {
  it("trusts the configured URL and tolerates a trailing slash or missing scheme", () => {
    expect(trustedOrigins({ BETTER_AUTH_URL: "https://app.example.com/" })).toEqual(["https://app.example.com"]);
    expect(authBaseUrl({ BETTER_AUTH_URL: "app.example.com" })).toBe("https://app.example.com");
  });

  it("also trusts the Vercel deployment, branch and production hostnames", () => {
    const origins = trustedOrigins({
      BETTER_AUTH_URL: "https://challenge-tracker.vercel.app",
      VERCEL_URL: "challenge-tracker-1tav9vdq7-me.vercel.app",
      VERCEL_BRANCH_URL: "challenge-tracker-git-main-me.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "challenge-tracker.vercel.app",
    });
    expect(origins).toEqual([
      "https://challenge-tracker.vercel.app",
      "https://challenge-tracker-1tav9vdq7-me.vercel.app",
      "https://challenge-tracker-git-main-me.vercel.app",
    ]);
  });

  it("falls back to the Vercel production URL, then localhost", () => {
    expect(authBaseUrl({ VERCEL_PROJECT_PRODUCTION_URL: "tracker.vercel.app" })).toBe("https://tracker.vercel.app");
    expect(authBaseUrl({})).toBe("http://localhost:3000");
  });

  it("accepts extra origins and ignores garbage", () => {
    expect(trustedOrigins({ BETTER_AUTH_URL: "https://a.com", BETTER_AUTH_TRUSTED_ORIGINS: "https://b.com, ,not a url://" })).toEqual(["https://a.com", "https://b.com"]);
  });

  it("never trusts an arbitrary origin", () => {
    expect(trustedOrigins({ BETTER_AUTH_URL: "https://a.com" })).not.toContain("https://evil.example");
  });
});
