import type { Metadata } from "next";
import { PlanView } from "@/components/plan/plan-view";
import { StartPlan } from "@/components/plan/start-plan";
import { requireCtx } from "@/lib/auth/session";
import { MALAYSIA_SEM4 } from "@/lib/plan/malaysia-semester4";
import { dailyTasksFor } from "@/lib/plan/logic";
import { emailConfigured } from "@/lib/email";
import { getPlanData } from "@/lib/services/plan";
import { getNotificationPrefs, getUserEmail } from "@/lib/services/profile";
import { todayOf } from "@/lib/services/context";

export const metadata: Metadata = { title: "My plan" };
export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const { ctx } = await requireCtx();
  const data = await getPlanData(ctx);
  const t = MALAYSIA_SEM4;

  if (!data) {
    return (
      <StartPlan
        template={{ key: t.key, title: t.title, subtitle: t.subtitle, weeks: t.weeks.length, tasksPerDay: dailyTasksFor(t, "2026-10-19").length }}
      />
    );
  }
  const [prefs, email] = await Promise.all([getNotificationPrefs(ctx), getUserEmail(ctx)]);
  const reminder = {
    enabled: prefs.dailyReminderEnabled && prefs.channel === "email",
    // the plan's reminder defaults to the evening, not the 08:00 default of the general reminders
    time: prefs.dailyReminderEnabled ? prefs.reminderTime : "23:30",
    email,
    configured: emailConfigured(),
  };
  return <PlanView template={data.template} today={todayOf(ctx)} initialChecks={data.checks} initialMetrics={data.metrics} reminder={reminder} />;
}
