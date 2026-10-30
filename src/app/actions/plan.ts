"use server";
import { authBaseUrl } from "@/lib/auth/origins";
import { sendEmail } from "@/lib/email";
import { botUsername, ensureWebhook, telegramApi, telegramConfigured } from "@/lib/telegram";
import * as plan from "@/lib/services/plan";
import * as reminders from "@/lib/services/reminders";
import * as telegram from "@/lib/services/telegram";
import { badState } from "@/lib/services/errors";
import { run } from "./util";

export const startPlanAction = async (templateKey?: string) => run((ctx) => plan.startPlan(ctx, templateKey));
// Ticks and numbers are kept in client state, so these don't revalidate the page.
export const setCheckAction = async (raw: unknown) => run((ctx) => plan.setCheck(ctx, raw), { revalidate: false });
export const saveMetricsAction = async (raw: unknown) => run((ctx) => plan.saveMetrics(ctx, raw), { revalidate: false });
export const savePlanContentAction = async (raw: unknown) => run((ctx) => plan.savePlanContent(ctx, raw));
export const resetPlanContentAction = async (templateKey?: string) => run((ctx) => plan.resetPlanContent(ctx, templateKey));
export const setPlanReminderAction = async (raw: unknown) => run((ctx) => reminders.setPlanReminder(ctx, raw), { revalidate: false });
export const sendTestReminderAction = async () => run((ctx) => reminders.sendTestReminder(ctx, sendEmail, authBaseUrl()), { revalidate: false });

/** A one-time link that opens the bot; also makes sure Telegram is pointed at this app. */
export const connectTelegramAction = async () =>
  run(
    async (ctx) => {
      if (!telegramConfigured()) throw badState("Telegram isn't set up on this server yet.");
      await ensureWebhook(authBaseUrl()).catch((err) => console.error("[telegram webhook]", err instanceof Error ? err.message : err));
      return telegram.createLinkToken(ctx, botUsername());
    },
    { revalidate: false },
  );
export const telegramStateAction = async () => run((ctx) => telegram.getTelegramState(ctx), { revalidate: false });
export const setTelegramReminderAction = async (raw: unknown) => run((ctx) => telegram.setTelegramReminder(ctx, raw), { revalidate: false });
export const disconnectTelegramAction = async () => run((ctx) => telegram.disconnectTelegram(ctx), { revalidate: false });
export const sendTelegramTestAction = async () => run((ctx) => telegram.sendTelegramTest(ctx, telegramApi), { revalidate: false });
