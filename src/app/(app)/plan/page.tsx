import type { Metadata } from "next";
import { PlanView } from "@/components/plan/plan-view";
import { StartPlan } from "@/components/plan/start-plan";
import { requireCtx } from "@/lib/auth/session";
import { MALAYSIA_SEM4 } from "@/lib/plan/malaysia-semester4";
import { dailyTasksFor } from "@/lib/plan/logic";
import { getPlanData } from "@/lib/services/plan";
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
  return <PlanView template={data.template} today={todayOf(ctx)} initialChecks={data.checks} initialMetrics={data.metrics} />;
}
