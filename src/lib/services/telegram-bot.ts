/**
 * The bot's side of the conversation (Telegram → app): linking a chat, tap-to-tick, and the edit commands.
 * Everything goes through the same services as the website, so the same rules apply (own plan only, valid ticks,
 * the plan editor's validation for edits).
 */
import { and, eq, gt } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { Db } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { addDays, formatDateShort, localDateIn, type ISODate } from "@/lib/core/dates";
import { WEEKDAY_SHORT } from "@/lib/core/format";
import { addDailyTask, parseDays, removeDailyTask, renameDailyTask } from "@/lib/plan/content";
import { booksCount, checkKey, dailyTasksFor, dayCount, perfectDays, weekCount, weekOf, weekRange } from "@/lib/plan/logic";
import { parseTickData } from "@/lib/plan/reminder";
import { splitDue } from "@/lib/todos";
import { timelineFor } from "@/lib/plan/timeline";
import type { Keyboard, TelegramApi, TelegramUpdate } from "@/lib/telegram";
import type { Ctx } from "./context";
import { AppError } from "./errors";
import { editPlanContent, saveMetrics, setCheck } from "./plan";
import { composeDay, DEFAULT_TIME, getTelegramState, loadDay, sendDay, setTelegramReminder, todoLabel } from "./telegram";
import { addTodo, deleteTodo, isTodoId, listOpenTodos, setTodoDone } from "./todos";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

const HELP = [
  "Your plan and to-do list, in Telegram. Every evening I send what you haven't ticked; tap a task to tick it.",
  "",
  "To-dos",
  "Just send me a message to add a to-do. End it with a day for a due date: “buy a SIM card fri”, “call mum tomorrow”, “pay rent 2026-11-30”.",
  "/todos – your open to-dos (tap to finish)",
  "",
  "Today",
  "/today – today's tasks (tap to tick)",
  "/timeline – today hour by hour",
  "/untick – undo a tick",
  "/week – how this week is going",
  "",
  "Edit",
  "/add Walk 20 min mon wed fri – add a daily task (days optional, default every day)",
  "/rename – rename a daily task",
  "/remove – remove a daily task",
  "/books – mark a book as finished",
  "/weight 70.5 – log this week's weight",
  "/run 15 – log this week's long run (km)",
  "",
  "Reminders",
  "/time 22:30 – change the reminder time",
  "/on, /off – turn reminders on or off",
  "/stop – disconnect this chat",
].join("\n");

type Chat = { id: string; user: { id: string; timezone: string }; api: TelegramApi; now: Date };

async function userOfChat(db: Db, chatId: string): Promise<{ id: string; timezone: string } | null> {
  const [row] = await db
    .select({ id: s.user.id, timezone: s.user.timezone })
    .from(s.telegramLinks)
    .innerJoin(s.user, eq(s.user.id, s.telegramLinks.userId))
    .where(eq(s.telegramLinks.chatId, chatId))
    .limit(1);
  return row ?? null;
}

/** The text of a known, user-facing problem (bad input, nothing to find…), or a generic one. */
const problem = (err: unknown) =>
  err instanceof AppError && ["VALIDATION", "NOT_FOUND", "STATE"].includes(err.code) ? err.message : "Something went wrong. Please try again.";

/** Process one update from Telegram. Never throws: a failure must not make Telegram resend the same update forever. */
export async function handleUpdate(db: Db, api: TelegramApi, update: TelegramUpdate, now: Date): Promise<void> {
  try {
    if (update.callback_query) return await handleCallback(db, api, update.callback_query, now);
    if (update.message?.text) return await handleMessage(db, api, update.message, now);
  } catch (err) {
    console.error("[telegram update failed]", update.update_id, err instanceof Error ? err.message : err);
  }
}

// ---------------------------------------------------------------------------
// Messages and commands
// ---------------------------------------------------------------------------

async function handleMessage(db: Db, api: TelegramApi, msg: NonNullable<TelegramUpdate["message"]>, now: Date): Promise<void> {
  if (msg.chat.type !== "private") return; // only ever talk to people one to one
  const chatId = String(msg.chat.id);
  const text = (msg.text ?? "").trim();
  const [first = "", ...words] = text.split(/\s+/);
  const cmd = first.startsWith("/") ? first.split("@")[0]!.toLowerCase() : "";
  const arg = text.slice(first.length).trim();
  const user = await userOfChat(db, chatId);

  if (cmd === "/start" && words[0]) return void (await link(db, api, chatId, words[0], now));
  if (!user) {
    await api.sendMessage(chatId, "Hi! To connect this chat, open your plan on the website, press “Connect Telegram” and then Start here.");
    return;
  }
  const chat: Chat = { id: chatId, user, api, now };
  const ctx: Ctx = { db, user, now };

  try {
    // an answer to "Rename …": the prompt carries the task's id
    const renaming = /\[#([a-z0-9-]{1,30})\]/.exec(msg.reply_to_message?.text ?? "");
    if (!cmd && renaming) return void (await rename(ctx, chat, renaming[1]!, text));

    switch (cmd) {
      case "/stop":
        await db.delete(s.telegramLinks).where(eq(s.telegramLinks.userId, user.id));
        await db.update(s.notificationPreferences).set({ telegramEnabled: false, updatedAt: new Date() }).where(eq(s.notificationPreferences.userId, user.id));
        return void (await api.sendMessage(chatId, "Disconnected. You won't get reminders here any more. You can connect again from the website."));
      case "/todos":
        return void (await showTodos(ctx, chat));
      case "/todo":
        return void (await addTodoFrom(ctx, chat, arg));
      case "/today":
        if (!(await sendDay(db, api, user.id, chatId, now))) await api.sendMessage(chatId, "There is nothing to tick today: your plan isn't running.");
        return;
      case "/timeline":
        return void (await showTimeline(db, chat));
      case "/week":
        return void (await showWeek(db, chat));
      case "/untick":
        return void (await offerUntick(db, chat));
      case "/add":
        return void (await add(ctx, chat, words));
      case "/rename":
      case "/remove":
        return void (await offerTasks(db, chat, cmd === "/rename" ? "n" : "r"));
      case "/books":
        return void (await offerBooks(db, chat));
      case "/weight":
      case "/run":
        return void (await logNumber(ctx, chat, cmd === "/weight" ? "weightKg" : "longRunKm", arg));
      case "/time":
      case "/on":
      case "/off":
        return void (await reminderSetting(ctx, chat, cmd, arg));
      case "/start":
        return void (await api.sendMessage(chatId, `You're connected.\n\n${HELP}`));
      default:
        // anything that isn't a command is a new to-do
        if (!cmd) return void (await addTodoFrom(ctx, chat, text));
        return void (await api.sendMessage(chatId, HELP));
    }
  } catch (err) {
    await api.sendMessage(chatId, problem(err));
    if (!(err instanceof AppError)) throw err;
  }
}

async function link(db: Db, api: TelegramApi, chatId: string, token: string, now: Date): Promise<void> {
  // single use: deleting the row is what claims it
  const [claimed] = await db
    .delete(s.telegramLinkTokens)
    .where(and(eq(s.telegramLinkTokens.tokenHash, hash(token)), gt(s.telegramLinkTokens.expiresAt, now)))
    .returning({ userId: s.telegramLinkTokens.userId });
  if (!claimed) {
    await api.sendMessage(chatId, "That link has expired or was already used. Press “Connect Telegram” on the website again.");
    return;
  }
  await db.transaction(async (tx) => {
    await tx.delete(s.telegramLinks).where(eq(s.telegramLinks.chatId, chatId)); // a chat belongs to one account
    await tx
      .insert(s.telegramLinks)
      .values({ userId: claimed.userId, chatId })
      .onConflictDoUpdate({ target: s.telegramLinks.userId, set: { chatId, linkedAt: now } });
    await tx
      .insert(s.notificationPreferences)
      .values({ userId: claimed.userId, telegramEnabled: true, reminderTime: DEFAULT_TIME })
      .onConflictDoUpdate({ target: s.notificationPreferences.userId, set: { telegramEnabled: true, updatedAt: new Date() } });
  });
  const [prefs] = await db.select().from(s.notificationPreferences).where(eq(s.notificationPreferences.userId, claimed.userId)).limit(1);
  await api.sendMessage(chatId, `✅ Connected! I'll message you every day at ${prefs?.reminderTime ?? DEFAULT_TIME} with what you haven't ticked yet.\n\n${HELP}`);
}

const clip = (t: string, n = 44) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const rangeText = (start: string, end: string) => `${start}–${end === "24:00" ? "00:00" : end}`;

async function showTimeline(db: Db, chat: Chat) {
  const day = await loadDay(db, chat.user.id, chat.now);
  if (!day) return void (await chat.api.sendMessage(chat.id, "There is no plan to show."));
  const lines = timelineFor(day.t, day.today).map((i) => {
    const done = i.taskKey ? day.checks.has(checkKey(i.taskKey, day.today)) : false;
    return `${i.taskKey ? (done ? "✅" : "☐") : "•"} ${rangeText(i.start, i.end)}  ${i.title}${i.detail ? ` (${i.detail})` : ""}`;
  });
  await chat.api.sendMessage(chat.id, [`Today · ${formatDateShort(day.today)}`, "", ...lines].join("\n"));
}

async function showWeek(db: Db, chat: Chat) {
  const day = await loadDay(db, chat.user.id, chat.now);
  const n = day ? weekOf(day.t, day.today) : null;
  if (!day || n === null) return void (await chat.api.sendMessage(chat.id, "Your plan isn't running today, so there is no week to show."));
  const { start, end } = weekRange(day.t, n);
  const c = weekCount(day.t, day.checks, n);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    const dc = dayCount(day.t, day.checks, d);
    const future = d > day.today;
    return `${WEEKDAY_SHORT[i]}  ${future ? "·" : dc.total > 0 && dc.done === dc.total ? "✅" : "▫️"} ${dc.done}/${dc.total}${d === day.today ? "  ← today" : ""}`;
  });
  const books = booksCount(day.t, day.checks);
  await chat.api.sendMessage(
    chat.id,
    [
      `Week ${n} · ${formatDateShort(start)} – ${formatDateShort(end)}`,
      `${c.done} of ${c.total} done · ${perfectDays(day.t, day.checks, day.today)} perfect days so far`,
      "",
      ...days,
      "",
      `Books finished: ${books.done} of ${books.total}`,
    ].join("\n"),
  );
}

async function offerUntick(db: Db, chat: Chat) {
  const day = await loadDay(db, chat.user.id, chat.now);
  const ticked = day ? dailyTasksFor(day.t, day.today).filter((d) => day.checks.has(checkKey(d.taskKey, day.today))) : [];
  if (!day || ticked.length === 0) return void (await chat.api.sendMessage(chat.id, "Nothing is ticked yet today."));
  await chat.api.sendMessage(chat.id, "Tap a task to un-tick it:", ticked.map((d) => [{ text: `✅ ${clip(d.title)}`, callback_data: `u:${d.taskKey.replace(/^daily:/, "")}:${day.today}` }]));
}

async function offerTasks(db: Db, chat: Chat, action: "n" | "r") {
  const day = await loadDay(db, chat.user.id, chat.now);
  if (!day) return void (await chat.api.sendMessage(chat.id, "There is no plan to edit."));
  const verb = action === "n" ? "rename" : "remove";
  await chat.api.sendMessage(chat.id, `Which daily task do you want to ${verb}?`, day.t.dailyTasks.map((d) => [{ text: clip(d.title), callback_data: `${action}:${d.key}` }]));
}

async function offerBooks(db: Db, chat: Chat) {
  const day = await loadDay(db, chat.user.id, chat.now);
  if (!day) return void (await chat.api.sendMessage(chat.id, "There is no plan."));
  const open = day.t.books.filter((b) => !day.checks.has(checkKey(`book:${b.id}`, "once")));
  const done = day.t.books.filter((b) => day.checks.has(checkKey(`book:${b.id}`, "once")));
  const text = [`Books: ${done.length} of ${day.t.books.length} finished`, ...done.map((b) => `✅ ${b.title}`)].join("\n");
  if (open.length === 0) return void (await chat.api.sendMessage(chat.id, `${text}\n\n🎉 All finished!`));
  await chat.api.sendMessage(chat.id, `${text}\n\nTap a book you just finished:`, open.map((b) => [{ text: `📖 ${clip(b.title)}`, callback_data: `b:${b.id}` }]));
}

async function addTodoFrom(ctx: Ctx, chat: Chat, text: string) {
  if (!text) return void (await chat.api.sendMessage(chat.id, "Tell me the to-do, for example:\n/todo buy a SIM card fri\nor just send the text without a command."));
  const { title, due } = splitDue(text, localDateIn(chat.now, chat.user.timezone));
  const todo = await addTodo(ctx, { title, dueDate: due });
  await chat.api.sendMessage(chat.id, `📝 Added: ${todo.title}${todo.dueDate ? ` · due ${formatDateShort(todo.dueDate)}` : ""}`, [[{ text: "↩ Undo", callback_data: `tx:${todo.id}` }]]);
}

async function showTodos(ctx: Ctx, chat: Chat) {
  const open = await listOpenTodos(ctx);
  if (open.length === 0) return void (await chat.api.sendMessage(chat.id, "No open to-dos. 🎉 Send me a message to add one."));
  const today = localDateIn(chat.now, chat.user.timezone);
  const shown = open.slice(0, 25);
  await chat.api.sendMessage(
    chat.id,
    [`Your to-dos (${open.length}):`, ...shown.map((t) => `• ${todoLabel(t, today)}`), open.length > shown.length ? `…and ${open.length - shown.length} more on the website` : ""].filter(Boolean).join("\n") + "\n\nTap ✅ to finish, 🗑 to delete.",
    shown.map((t) => [{ text: `✅ ${clip(t.title, 30)}`, callback_data: `td:${t.id}` }, { text: "🗑", callback_data: `tx:${t.id}` }]),
  );
}

async function add(ctx: Ctx, chat: Chat, words: string[]) {
  // "/add Walk 20 min mon wed fri": trailing day words are the days, the rest is the title
  let cut = words.length;
  while (cut > 0 && parseDays([words[cut - 1]!]) !== null) cut -= 1;
  const days = cut < words.length ? parseDays(words.slice(cut)) : null;
  const title = words.slice(0, cut).join(" ").trim();
  if (!title) return void (await chat.api.sendMessage(chat.id, "Tell me what to add, for example:\n/add Walk 20 min\n/add Call family sat sun"));
  const weekdays = days ?? [1, 2, 3, 4, 5, 6, 7];
  await editPlanContent(ctx, (c) => addDailyTask(c, title, weekdays).content);
  const when = weekdays.length === 7 ? "every day" : weekdays.map((d) => WEEKDAY_SHORT[d - 1]).join(", ");
  await chat.api.sendMessage(chat.id, `Added “${title}” (${when}). It appears under “Any time today”; give it a time slot in the editor on the website if you like.`);
}

async function rename(ctx: Ctx, chat: Chat, key: string, title: string) {
  if (title.length < 1 || title.length > 120) return void (await chat.api.sendMessage(chat.id, "Please send a name of 1 to 120 characters."));
  const t = await editPlanContent(ctx, (c) => {
    if (!c.dailyTasks.some((d) => d.key === key)) throw new AppError("NOT_FOUND", "That task no longer exists.");
    return renameDailyTask(c, key, title);
  });
  await chat.api.sendMessage(chat.id, `Renamed to “${t.dailyTasks.find((d) => d.key === key)?.title ?? title}”.`);
}

async function logNumber(ctx: Ctx, chat: Chat, field: "weightKg" | "longRunKm", arg: string) {
  const value = Number(arg.replace(",", "."));
  if (!arg || !Number.isFinite(value)) {
    return void (await chat.api.sendMessage(chat.id, field === "weightKg" ? "Send your weight, for example: /weight 70.5" : "Send the distance in km, for example: /run 15"));
  }
  const day = await loadDay(ctx.db, ctx.user.id, ctx.now);
  const n = day ? weekOf(day.t, day.today) : null;
  if (n === null) return void (await chat.api.sendMessage(chat.id, "Your plan isn't running today, so there is no week to log it in."));
  await saveMetrics(ctx, { period: `W${n}`, [field]: value });
  await chat.api.sendMessage(chat.id, field === "weightKg" ? `Saved: ${value} kg for week ${n}.` : `Saved: long run ${value} km for week ${n}.`);
}

async function reminderSetting(ctx: Ctx, chat: Chat, cmd: "/time" | "/on" | "/off", arg: string) {
  const state = await getTelegramState(ctx);
  if (cmd === "/time") {
    const m = /^(\d{1,2})[:.](\d{2})$/.exec(arg);
    if (!m) return void (await chat.api.sendMessage(chat.id, "Send the time like this: /time 22:30"));
    const time = `${m[1]!.padStart(2, "0")}:${m[2]}`;
    await setTelegramReminder(ctx, { enabled: state.enabled, time });
    return void (await chat.api.sendMessage(chat.id, `Reminder time is now ${time}${state.enabled ? "." : " (reminders are off: /on to turn them on)."}`));
  }
  await setTelegramReminder(ctx, { enabled: cmd === "/on", time: state.time });
  await chat.api.sendMessage(chat.id, cmd === "/on" ? `Reminders are on, every day at ${state.time}.` : "Reminders are off. /on turns them back on.");
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type Callback = NonNullable<TelegramUpdate["callback_query"]>;

async function handleCallback(db: Db, api: TelegramApi, q: Callback, now: Date): Promise<void> {
  const chat = q.message?.chat;
  if (!chat || chat.type !== "private" || chat.id !== q.from.id) return void (await api.answerCallback(q.id));
  const chatId = String(chat.id);
  const user = await userOfChat(db, chatId);
  const data = q.data ?? "";
  if (!user) return void (await api.answerCallback(q.id, "This chat isn't connected any more."));
  const ctx: Ctx = { db, user, now };
  const messageId = q.message!.message_id;
  const edit = (text: string, keyboard: Keyboard = []) => api.editMessage(chatId, messageId, text, keyboard).catch(() => {});

  try {
    const tick = parseTickData(data);
    if (tick) {
      await setCheck(ctx, { taskKey: tick.taskKey, period: tick.date, checked: true });
      await api.answerCallback(q.id, "Ticked ✅");
      // refresh the message so the ticked task disappears
      const day = await loadDay(db, user.id, now);
      const msg = day && tick.date === day.today ? await composeDay(db, user.id, now) : null;
      return void (msg ? await edit(msg.text, msg.keyboard) : await edit(tick.date === day?.today ? "🎉 All done for today. Well done!" : "✅ Saved."));
    }

    const todoCb = /^(td|tx|tu):([0-9a-f-]{36})$/.exec(data);
    if (todoCb && isTodoId(todoCb[2]!)) {
      const [, action, id] = todoCb as unknown as [string, string, string];
      const todo = action === "tx" ? await deleteTodo(ctx, id) : await setTodoDone(ctx, id, action === "td");
      await api.answerCallback(q.id, action === "td" ? "Done ✅" : action === "tx" ? "Deleted" : "Back on the list");
      // keep the rest of the message (other tasks and to-dos), just retire this to-do's buttons
      const rows = (q.message?.reply_markup?.inline_keyboard ?? []).filter((row) => !row.some((b) => b.callback_data?.endsWith(id)));
      const note = action === "td" ? `✅ Done: ${todo.title}` : action === "tx" ? `🗑 Deleted: ${todo.title}` : `↩️ Back on your list: ${todo.title}`;
      const keyboard = action === "td" ? [...rows, [{ text: "↩ Undo", callback_data: `tu:${id}` }]] : rows;
      return void (await edit(`${(q.message?.text ?? "").replace(/\n*$/, "")}\n\n${note}`.trim().slice(0, 4000), keyboard.map((r) => r.map((b) => ({ text: b.text, callback_data: b.callback_data ?? "rn" })))));
    }

    const m = /^(u|b|n|r|ry):([a-z0-9-]{1,30})(?::(\d{4}-\d{2}-\d{2}))?$/.exec(data);
    if (data === "rn") {
      await api.answerCallback(q.id);
      return void (await edit("Cancelled."));
    }
    if (!m) return void (await api.answerCallback(q.id, "That button is out of date."));
    const [, action, key, date] = m as unknown as [string, string, string, ISODate | undefined];

    if (action === "u" && date) {
      await setCheck(ctx, { taskKey: `daily:${key}`, period: date, checked: false });
      await api.answerCallback(q.id, "Un-ticked");
      return void (await edit("↩️ Un-ticked. /today shows what is open."));
    }
    if (action === "b") {
      await setCheck(ctx, { taskKey: `book:${key}`, period: "once", checked: true });
      await api.answerCallback(q.id, "Marked as finished 📖");
      return void (await edit("📖 Book finished. Well done! /books shows the rest."));
    }

    const day = await loadDay(db, user.id, now);
    const task = day?.t.dailyTasks.find((d) => d.key === key);
    if (!task) return void (await api.answerCallback(q.id, "That task no longer exists."));
    if (action === "n") {
      await api.answerCallback(q.id);
      return void (await api.sendMessage(chatId, `Rename “${task.title}”.\nReply to this message with the new name. [#${key}]`, undefined, true));
    }
    if (action === "r") {
      await api.answerCallback(q.id);
      return void (await edit(`Remove “${task.title}” from your plan? Ticks you already made stop counting.`, [[{ text: "Yes, remove", callback_data: `ry:${key}` }, { text: "Cancel", callback_data: "rn" }]]));
    }
    // action === "ry"
    await editPlanContent(ctx, (c) => removeDailyTask(c, key));
    await api.answerCallback(q.id, "Removed");
    await edit(`🗑 Removed “${task.title}”.`);
  } catch (err) {
    await api.answerCallback(q.id, problem(err)).catch(() => {});
    if (!(err instanceof AppError)) throw err;
  }
}
