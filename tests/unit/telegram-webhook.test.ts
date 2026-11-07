import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureWebhook } from "@/lib/telegram";

const calls: { method: string; body: Record<string, unknown> }[] = [];
let failing = new Set<string>();

beforeEach(() => {
  calls.length = 0;
  failing = new Set();
  process.env.TELEGRAM_BOT_TOKEN = "123:fake";
  process.env.TELEGRAM_WEBHOOK_SECRET = "whsec";
  vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
    const method = url.split("/").pop()!;
    calls.push({ method, body: JSON.parse(init.body) });
    return failing.has(method) ? new Response(JSON.stringify({ ok: false, description: `${method} broke` }), { status: 400 }) : new Response(JSON.stringify({ ok: true, result: true }));
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
});

describe("registering the Telegram webhook", () => {
  it("registers the webhook first, with the secret and only the updates the bot reads", async () => {
    await ensureWebhook("https://tracker.example.com/");
    expect(calls[0]).toEqual({
      method: "setWebhook",
      body: { url: "https://tracker.example.com/api/telegram/webhook", secret_token: "whsec", allowed_updates: ["message", "callback_query"] },
    });
    expect(calls.map((c) => c.method)).toEqual(["setWebhook", "setMyShortDescription", "setMyDescription", "setMyCommands"]);
  });

  it("a problem with the description or the command menu never stops the bot from receiving messages", async () => {
    failing = new Set(["setMyShortDescription", "setMyDescription", "setMyCommands"]);
    await expect(ensureWebhook("https://tracker.example.com")).resolves.toBeUndefined();
    expect(calls[0]!.method).toBe("setWebhook");
  });

  it("reports a refused webhook, without the token in the message", async () => {
    failing = new Set(["setWebhook"]);
    const err = await ensureWebhook("https://tracker.example.com").then(() => null, (e: Error) => e);
    expect(err?.message).toBe("Telegram setWebhook failed (400): setWebhook broke");
    expect(err?.message).not.toContain("123:fake");
    expect(calls.map((c) => c.method)).toEqual(["setWebhook"]); // nothing else is attempted
  });

  it("does nothing without a webhook secret", async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    await ensureWebhook("https://tracker.example.com");
    expect(calls).toEqual([]);
  });
});
