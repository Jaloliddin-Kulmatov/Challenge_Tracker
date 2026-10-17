"use client";
import { useRouter } from "next/navigation";
import * as React from "react";
import { startPlanAction } from "@/app/actions/plan";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import type { PlanTemplate } from "@/lib/plan/types";

export function StartPlan({ template }: { template: Pick<PlanTemplate, "key" | "title" | "subtitle"> & { weeks: number; tasksPerDay: number } }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  async function start() {
    setBusy(true);
    try {
      const res = await startPlanAction(template.key);
      if (!res.ok) {
        if (res.unauthenticated) router.push("/login");
        toast.error(res.error);
        return;
      }
      router.refresh();
    } catch {
      toast.error("We couldn't reach the server. Nothing was saved – please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto max-w-xl space-y-4 text-center">
      <div className="text-4xl" aria-hidden>📅</div>
      <h1 className="text-2xl font-bold tracking-tight">{template.title}</h1>
      <p className="text-muted">{template.subtitle}</p>
      <ul className="mx-auto max-w-sm space-y-1 text-left text-sm text-muted">
        <li>✓ Overall goals to tick off</li>
        <li>✓ Today&apos;s checklist ({template.tasksPerDay} things a day)</li>
        <li>✓ Monthly goals and a plan for each of the {template.weeks} weeks</li>
        <li>✓ Your weekly schedule, with exercise at 19:00</li>
      </ul>
      <Button size="lg" className="w-full" loading={busy} onClick={start}>Start my plan</Button>
      <p className="text-xs text-subtle">Your ticks are saved to your account, so you can pick up on any device.</p>
    </Card>
  );
}
