"use server";
import { authBaseUrl } from "@/lib/auth/origins";
import { sendEmail } from "@/lib/email";
import * as plan from "@/lib/services/plan";
import * as reminders from "@/lib/services/reminders";
import { run } from "./util";

export const startPlanAction = async (templateKey?: string) => run((ctx) => plan.startPlan(ctx, templateKey));
// Ticks and numbers are kept in client state, so these don't revalidate the page.
export const setCheckAction = async (raw: unknown) => run((ctx) => plan.setCheck(ctx, raw), { revalidate: false });
export const saveMetricsAction = async (raw: unknown) => run((ctx) => plan.saveMetrics(ctx, raw), { revalidate: false });
export const savePlanContentAction = async (raw: unknown) => run((ctx) => plan.savePlanContent(ctx, raw));
export const resetPlanContentAction = async (templateKey?: string) => run((ctx) => plan.resetPlanContent(ctx, templateKey));
export const setPlanReminderAction = async (raw: unknown) => run((ctx) => reminders.setPlanReminder(ctx, raw), { revalidate: false });
export const sendTestReminderAction = async () => run((ctx) => reminders.sendTestReminder(ctx, sendEmail, authBaseUrl()), { revalidate: false });
