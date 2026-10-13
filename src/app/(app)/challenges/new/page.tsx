import type { Metadata } from "next";
import { ChallengeForm } from "@/components/challenge-form";
import { requireCtx } from "@/lib/auth/session";
import { todayOf } from "@/lib/services/context";

export const metadata: Metadata = { title: "New challenge" };
export const dynamic = "force-dynamic";

export default async function NewChallengePage() {
  const { ctx } = await requireCtx();
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New challenge</h1>
        <p className="mt-1 text-muted">Describe the goal once – the schedule is generated for you.</p>
      </div>
      <ChallengeForm today={todayOf(ctx)} />
    </div>
  );
}
