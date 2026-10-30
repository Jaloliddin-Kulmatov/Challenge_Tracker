/** The evening "tick your day" email: pure, so the wording and the rules are easy to test. */
import type { ISODate } from "@/lib/core/dates";
import { formatDateLong } from "@/lib/core/dates";
import { checkKey, dailyTasksFor, planPhase, type CheckSet, type ResolvedDaily } from "./logic";
import type { PlanTemplate } from "./types";

export interface ReminderEmail {
  subject: string;
  text: string;
  html: string;
  left: number;
  total: number;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Today's tasks and the ones not ticked yet; null when the plan isn't running. */
export function openTasksOn(t: PlanTemplate, checks: CheckSet, today: ISODate): { tasks: ResolvedDaily[]; open: ResolvedDaily[] } | null {
  if (planPhase(t, today) !== "running") return null;
  const tasks = dailyTasksFor(t, today);
  return { tasks, open: tasks.filter((d) => !checks.has(checkKey(d.taskKey, today))) };
}

const taskLabel = (d: ResolvedDaily) => [d.title, d.detail && `(${d.detail})`].filter(Boolean).join(" ");

/** What to remind about on `today`, or null when there's nothing to say (plan not running, or the day is fully ticked). */
export function composeReminder(t: PlanTemplate, checks: CheckSet, today: ISODate, appUrl: string): ReminderEmail | null {
  const day = openTasksOn(t, checks, today);
  if (!day || day.open.length === 0) return null;
  const { tasks, open } = day;

  const link = `${appUrl.replace(/\/$/, "")}/plan#today`;
  const label = taskLabel;
  const subject = `Tick your day: ${open.length} of ${tasks.length} still open`;
  const text = [
    `${formatDateLong(today)} – ${open.length} of ${tasks.length} tasks aren't ticked yet:`,
    "",
    ...open.map((d) => `• ${label(d)}`),
    "",
    `Open your plan and tick what you did: ${link}`,
  ].join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;color:#111">
<h2 style="margin:0 0 4px">Tick your day</h2>
<p style="margin:0 0 12px;color:#555">${esc(formatDateLong(today))} · ${open.length} of ${tasks.length} still open</p>
<ul style="padding-left:20px;line-height:1.6">${open.map((d) => `<li>${esc(label(d))}</li>`).join("")}</ul>
<p><a href="${esc(link)}" style="display:inline-block;background:#0f7b5a;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:600">Open my plan</a></p>
</div>`;
  return { subject, text, html, left: open.length, total: tasks.length };
}

/** A reminder is due from its time until this many minutes later (covers a late or skipped cron run). */
export const REMINDER_WINDOW_MIN = 180;

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export function reminderDue(localTime: string, reminderTime: string): boolean {
  const since = minutes(localTime) - minutes(reminderTime);
  return since >= 0 && since <= REMINDER_WINDOW_MIN;
}

// ---------------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------------

/** "dl" on 2026-10-21 → "t:dl:2026-10-21" (Telegram allows 64 bytes of callback data). */
export const tickData = (taskKey: string, date: ISODate) => `t:${taskKey.replace(/^daily:/, "")}:${date}`;
export function parseTickData(data: string): { taskKey: string; date: ISODate } | null {
  const m = /^t:([a-z0-9-]{1,30}):(\d{4}-\d{2}-\d{2})$/.exec(data);
  return m ? { taskKey: `daily:${m[1]}`, date: m[2]! } : null;
}

export interface TelegramMessage {
  text: string;
  /** One button per open task (tap = ticked). */
  keyboard: { text: string; callback_data: string }[][];
}

/** The Telegram version of the evening reminder: the open tasks as tappable buttons, or a "done" message. */
export function composeTelegram(t: PlanTemplate, checks: CheckSet, today: ISODate): TelegramMessage | null {
  const day = openTasksOn(t, checks, today);
  if (!day) return null;
  const { tasks, open } = day;
  const date = formatDateLong(today);
  if (open.length === 0) return { text: `🎉 All ${tasks.length} tasks done for ${date}. Well done!`, keyboard: [] };
  const clip = (s: string) => (s.length > 44 ? `${s.slice(0, 43)}…` : s);
  return {
    text: [`Tick your day · ${date}`, `${open.length} of ${tasks.length} tasks still open:`, "", ...open.map((d) => `• ${taskLabel(d)}`), "", "Tap a task below when it's done."].join("\n"),
    keyboard: open.slice(0, 100).map((d) => [{ text: `☐ ${clip(d.title)}`, callback_data: tickData(d.taskKey, today) }]),
  };
}
