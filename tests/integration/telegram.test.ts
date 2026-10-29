import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { getPlanData, startPlan } from "@/lib/services/plan";
import {
  createLinkToken, disconnectTelegram, getTelegramState, handleUpdate, sendDueTelegramReminders, sendTelegramTest, setTelegramReminder,
} from "@/lib/services/telegram";
import { TelegramError, type TelegramApi, type TelegramUpdate } from "@/lib/telegram";
import { AppError } from "@/lib/services/errors";
import { at, client, db, makeUser } from "./helpers";

afterAll(async () => {
  await client.end();
});

const WED = "2026-10-21T10:00:00Z"; // Wednesday, week 1
const AT_2330 = new Date("2026-10-21T15:30:00Z"); // 23:30 in Kuala Lumpur

interface Sent { chatId: string; text: string; keyboard?: { text: string; callback_data: string }[][]; edited?: number }
function fakeApi(opts: { failSend?: (chatId: string) => Error | null } = {}) {
  const sent: Sent[] = [];
  const answers: { id: string; text?: string }[] = [];
  const api: TelegramApi = {
    async sendMessage(chatId, text, keyboard) {
      const err = opts.failSend?.(chatId);
      if (err) throw err;
      sent.push({ chatId, text, keyboard });
    },
    async editMessage(chatId, messageId, text, keyboard) {
      sent.push({ chatId, text, keyboard, edited: messageId });
    },
    async answerCallback(id, text) {
      answers.push({ id, text });
    },
  };
  return { api, sent, answers, to: (chat: string) => sent.filter((m) => m.chatId === chat) };
}

let nextId = 1;
const uid = () => nextId++;
let chatCounter = 5_000_000 + Math.floor(Math.random() * 1_000_000);
const newChat = () => ++chatCounter;
const say = (chat: number, text: string, type = "private"): TelegramUpdate => ({ update_id: uid(), message: { message_id: uid(), chat: { id: chat, type }, from: { id: chat }, text } });
const tap = (chat: number, data: string, messageId = 77, from = chat): TelegramUpdate => ({
  update_id: uid(),
  callback_query: { id: `cb${uid()}`, from: { id: from }, message: { message_id: messageId, chat: { id: chat, type: "private" } }, data },
});
const tokenFromUrl = (url: string) => new URL(url).searchParams.get("start")!;

async function connected(timezone = "Asia/Kuala_Lumpur") {
  const u = await makeUser(timezone);
  const ctx = at(u, WED);
  await startPlan(ctx);
  const chat = newChat();
  const bot = fakeApi();
  const { url } = await createLinkToken(ctx, "tracker_bot");
  await handleUpdate(db, bot.api, say(chat, `/start ${tokenFromUrl(url)}`), new Date(WED));
  return { u, ctx, chat, bot };
}

describe("connecting Telegram", () => {
  it("gives a one-time link and stores only a hash of the code", async () => {
    const u = await makeUser();
    const { url } = await createLinkToken(at(u, WED), "tracker_bot");
    expect(url).toMatch(/^https:\/\/t\.me\/tracker_bot\?start=[A-Za-z0-9_-]{32}$/);
    const rows = await db.select().from(s.telegramLinkTokens).where(eq(s.telegramLinkTokens.userId, u.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).not.toContain(tokenFromUrl(url));
    expect(rows[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    await createLinkToken(at(u, WED), "tracker_bot"); // a new one replaces the old one
    expect(await db.select().from(s.telegramLinkTokens).where(eq(s.telegramLinkTokens.userId, u.id))).toHaveLength(1);
  });

  it("links the chat on /start <code>, turns the reminder on, and the code works once", async () => {
    const u = await makeUser();
    const ctx = at(u, WED);
    await startPlan(ctx);
    const chat = newChat();
    const bot = fakeApi();
    const { url } = await createLinkToken(ctx, "tracker_bot");
    await handleUpdate(db, bot.api, say(chat, `/start ${tokenFromUrl(url)}`), new Date(WED));
    expect(bot.to(String(chat))[0]!.text).toMatch(/Connected.*23:30/s);
    expect(await getTelegramState(ctx)).toEqual({ linked: true, enabled: true, time: "23:30" });

    const other = newChat();
    await handleUpdate(db, bot.api, say(other, `/start ${tokenFromUrl(url)}`), new Date(WED)); // same code again
    expect(bot.to(String(other))[0]!.text).toMatch(/expired or was already used/);
    expect((await db.select().from(s.telegramLinks).where(eq(s.telegramLinks.chatId, String(other))))).toHaveLength(0);
  });

  it("rejects expired and made-up codes", async () => {
    const u = await makeUser();
    const { url } = await createLinkToken(at(u, WED), "tracker_bot");
    const bot = fakeApi();
    const late = newChat();
    await handleUpdate(db, bot.api, say(late, `/start ${tokenFromUrl(url)}`), new Date("2026-10-21T10:16:00Z")); // 16 minutes later
    expect(bot.to(String(late))[0]!.text).toMatch(/expired/);
    const fake = newChat();
    await handleUpdate(db, bot.api, say(fake, "/start AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), new Date(WED));
    expect(bot.to(String(fake))[0]!.text).toMatch(/expired/);
    expect(await getTelegramState(at(u, WED))).toMatchObject({ linked: false });
  });

  it("a chat belongs to one account: linking it to someone else unlinks the first", async () => {
    const a = await connected();
    const b = await makeUser();
    const { url } = await createLinkToken(at(b, WED), "tracker_bot");
    await handleUpdate(db, fakeApi().api, say(a.chat, `/start ${tokenFromUrl(url)}`), new Date(WED));
    expect((await getTelegramState(a.ctx)).linked).toBe(false);
    expect((await getTelegramState(at(b, WED))).linked).toBe(true);
  });

  it("strangers get instructions, groups are ignored, /stop disconnects, and the website can too", async () => {
    const bot = fakeApi();
    const stranger = newChat();
    await handleUpdate(db, bot.api, say(stranger, "hello"), new Date(WED));
    expect(bot.to(String(stranger))[0]!.text).toMatch(/Connect Telegram/);
    const group = newChat();
    await handleUpdate(db, bot.api, say(group, "/today", "group"), new Date(WED));
    expect(bot.to(String(group))).toHaveLength(0);

    const c = await connected();
    await handleUpdate(db, c.bot.api, say(c.chat, "/stop"), new Date(WED));
    expect(await getTelegramState(c.ctx)).toMatchObject({ linked: false, enabled: false });

    const d = await connected();
    await disconnectTelegram(d.ctx);
    expect(await getTelegramState(d.ctx)).toMatchObject({ linked: false, enabled: false });
  });

  it("the reminder switch needs a connected chat", async () => {
    const u = await makeUser();
    await startPlan(at(u, WED));
    const err = await setTelegramReminder(at(u, WED), { enabled: true, time: "22:00" }).then(() => null, (e) => e);
    expect(err).toBeInstanceOf(AppError);
    const c = await connected();
    await setTelegramReminder(c.ctx, { enabled: true, time: "22:15" });
    expect(await getTelegramState(c.ctx)).toEqual({ linked: true, enabled: true, time: "22:15" });
    await setTelegramReminder(c.ctx, { enabled: false, time: "22:15" });
    expect((await getTelegramState(c.ctx)).enabled).toBe(false);
    await expect(setTelegramReminder(c.ctx, { enabled: true, time: "25:61" })).rejects.toBeInstanceOf(AppError);
  });
});

describe("the bot's messages and tap-to-tick", () => {
  it("/today lists the open tasks as buttons; tapping one ticks it for real and refreshes the message", async () => {
    const c = await connected();
    const bot = fakeApi();
    await handleUpdate(db, bot.api, say(c.chat, "/today"), new Date(WED));
    const msg = bot.to(String(c.chat))[0]!;
    expect(msg.text).toMatch(/9 of 9 tasks still open/);
    expect(msg.keyboard).toHaveLength(9);
    const dl = msg.keyboard!.flat().find((b) => b.text.includes("DeepLearning"))!;
    expect(dl.callback_data).toBe("t:dl:2026-10-21");

    await handleUpdate(db, bot.api, tap(c.chat, dl.callback_data, 91), new Date(WED));
    expect((await getPlanData(c.ctx))!.checks).toContain("daily:dl|2026-10-21");
    expect(bot.answers.at(-1)!.text).toBe("Ticked ✅");
    const edit = bot.sent.find((m) => m.edited === 91)!;
    expect(edit.text).toMatch(/8 of 9 tasks still open/);
    expect(edit.keyboard).toHaveLength(8);
    expect(edit.text).not.toContain("DeepLearning");

    await handleUpdate(db, bot.api, tap(c.chat, dl.callback_data, 91), new Date(WED)); // tapping an old button again is harmless
    expect((await getPlanData(c.ctx))!.checks.filter((k) => k.startsWith("daily:dl"))).toHaveLength(1);
  });

  it("says well done when the last task is ticked", async () => {
    const c = await connected();
    const day = (await getPlanData(c.ctx))!.template.dailyTasks.filter((d) => d.weekdays.includes(3));
    const bot = fakeApi();
    for (const t of day) await handleUpdate(db, bot.api, tap(c.chat, `t:${t.key}:2026-10-21`, 5), new Date(WED));
    expect(bot.sent.at(-1)!.text).toMatch(/All 9 tasks done/);
    expect(bot.sent.at(-1)!.keyboard).toEqual([]);
  });

  it("only ticks what the website would allow, and only for the chat's own account", async () => {
    const c = await connected();
    const bot = fakeApi();
    await handleUpdate(db, bot.api, tap(c.chat, "t:dl:2026-10-22"), new Date(WED)); // tomorrow
    expect(bot.answers.at(-1)!.text).toMatch(/hasn't happened/);
    await handleUpdate(db, bot.api, tap(c.chat, "t:exercise:2026-10-20"), new Date(WED)); // not on Tuesdays
    expect(bot.answers.at(-1)!.text).toMatch(/isn't scheduled/);
    await handleUpdate(db, bot.api, tap(c.chat, "t:nope:2026-10-21"), new Date(WED));
    expect(bot.answers.at(-1)!.text).toBeTruthy();
    await handleUpdate(db, bot.api, tap(c.chat, "daily:dl|2026-10-21"), new Date(WED)); // not our format
    await handleUpdate(db, bot.api, tap(c.chat, "t:dl:2026-10-21", 1, c.chat + 1), new Date(WED)); // pressed by someone else in the chat
    expect((await getPlanData(c.ctx))!.checks).toEqual([]);

    const stranger = newChat();
    await handleUpdate(db, bot.api, tap(stranger, "t:dl:2026-10-21"), new Date(WED));
    expect(bot.answers.at(-1)!.text).toMatch(/isn't connected/);
    expect((await getPlanData(c.ctx))!.checks).toEqual([]);
  });

  it("sends today's tasks on request from the website", async () => {
    const c = await connected();
    const bot = fakeApi();
    await sendTelegramTest(c.ctx, bot.api);
    expect(bot.to(String(c.chat))[0]!.keyboard!.length).toBeGreaterThan(0);
    const u = await makeUser();
    await expect(sendTelegramTest(at(u, WED), bot.api)).rejects.toBeInstanceOf(AppError);
  });
});

describe("scheduled Telegram reminders", () => {
  it("messages at 23:30 local time, once a day, with the open tasks as buttons", async () => {
    const c = await connected();
    const bot = fakeApi();
    await sendDueTelegramReminders(db, new Date("2026-10-21T15:29:00Z"), bot.api);
    expect(bot.to(String(c.chat))).toHaveLength(0); // 23:29
    await sendDueTelegramReminders(db, AT_2330, bot.api);
    await sendDueTelegramReminders(db, new Date("2026-10-21T15:45:00Z"), bot.api); // the next cron run
    expect(bot.to(String(c.chat))).toHaveLength(1);
    expect(bot.to(String(c.chat))[0]!.keyboard).toHaveLength(9);
    await sendDueTelegramReminders(db, new Date("2026-10-22T15:30:00Z"), bot.api); // next evening
    expect(bot.to(String(c.chat))).toHaveLength(2);
  });

  it("stays quiet when everything is ticked, when switched off, and for other time zones", async () => {
    const done = await connected();
    const day = (await getPlanData(done.ctx))!.template.dailyTasks.filter((d) => d.weekdays.includes(3));
    for (const t of day) await handleUpdate(db, fakeApi().api, tap(done.chat, `t:${t.key}:2026-10-21`), new Date(WED));
    const off = await connected();
    await setTelegramReminder(off.ctx, { enabled: false, time: "23:30" });
    const utc = await connected("UTC");
    const bot = fakeApi();
    await sendDueTelegramReminders(db, AT_2330, bot.api); // 15:30 UTC: 23:30 only in Kuala Lumpur
    expect(bot.to(String(done.chat))).toHaveLength(0);
    expect(bot.to(String(off.chat))).toHaveLength(0);
    expect(bot.to(String(utc.chat))).toHaveLength(0);
  });

  it("retries after a failure, and stops for people who blocked the bot", async () => {
    const c = await connected();
    const blocked = await connected();
    const err = console.error;
    console.error = () => {};
    const flaky = fakeApi({
      failSend: (chat) => (chat === String(c.chat) ? new TelegramError("Telegram sendMessage failed (502): bad gateway", 502) : chat === String(blocked.chat) ? new TelegramError("Telegram sendMessage failed (403): bot was blocked by the user", 403) : null),
    });
    const first = await sendDueTelegramReminders(db, AT_2330, flaky.api);
    console.error = err;
    expect(first.failed).toBeGreaterThanOrEqual(1);
    expect((await getTelegramState(blocked.ctx)).linked).toBe(false); // unlinked after a 403

    const good = fakeApi();
    await sendDueTelegramReminders(db, new Date("2026-10-21T15:45:00Z"), good.api);
    expect(good.to(String(c.chat))).toHaveLength(1); // the failed attempt didn't use up the day
    expect(good.to(String(blocked.chat))).toHaveLength(0);
  });
});
