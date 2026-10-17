import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChallengeCard } from "@/components/challenge-card";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle, EmptyState } from "@/components/ui/card";
import { requireCtx } from "@/lib/auth/session";
import { formatDateLong } from "@/lib/core/dates";
import { ACHIEVEMENT_LABEL } from "@/components/labels";
import { getDashboard } from "@/lib/services/challenges";
import { hasPlan } from "@/lib/services/plan";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Today" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ stay?: string }> }) {
  const { stay } = await searchParams;
  const { ctx, user } = await requireCtx();
  // People with a semester plan land on it; the "Today" tab (?stay=1) still opens this page.
  const planStarted = await hasPlan(ctx);
  if (planStarted && !stay) redirect("/plan");
  const data = await getDashboard(ctx);
  const active = data.challenges.filter((c) => ["running", "paused", "ended"].includes(c.phase));
  const upcoming = data.challenges.filter((c) => c.phase === "upcoming");
  const completed = data.challenges.filter((c) => c.phase === "completed");
  const dueCount = active.reduce((n, c) => n + c.due.length, 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">{formatDateLong(data.today)} · {data.timezone}</p>
        <h1 className="text-2xl font-bold tracking-tight">Hi {user.name.split(" ")[0]} 👋</h1>
        {data.challenges.length > 0 && (
          <p className="mt-1 text-muted">
            {dueCount > 0 ? `${dueCount} ${dueCount === 1 ? "session" : "sessions"} to do today.` : active.length > 0 ? "Nothing left to do today – nice work." : "No challenge is running right now."}
          </p>
        )}
      </div>

      <Link href="/plan" className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 hover:bg-surface-2">
        <span className="text-2xl" aria-hidden>📅</span>
        <span className="flex-1">
          <span className="block font-semibold">{planStarted ? "Open my semester plan" : "Semester 4 plan · Malaysia"}</span>
          <span className="block text-sm text-muted">{planStarted ? "Today's checklist, weekly goals and schedule." : "19 weeks, Oct 19 – Feb 28. Start tracking your daily goals."}</span>
        </span>
        <span className="text-sm font-semibold text-primary">{planStarted ? "Open" : "Start"}</span>
      </Link>

      {data.challenges.length === 0 && (
        <EmptyState
          title="No challenges yet"
          action={<Link href="/challenges/new" className={cn(buttonVariants({ size: "lg" }))}>Create your first challenge</Link>}
        >
          Pick a template – run 100 km, study 2 hours a day, meditate daily – or build your own from scratch.
        </EmptyState>
      )}

      {active.length > 0 && (
        <section aria-labelledby="active-h" className="space-y-3">
          <h2 id="active-h" className="text-lg font-semibold">In progress</h2>
          <div className="grid gap-3 md:grid-cols-2">{active.map((c) => <ChallengeCard key={c.challenge.id} s={c} />)}</div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section aria-labelledby="up-h" className="space-y-3">
          <h2 id="up-h" className="text-lg font-semibold">Starting soon</h2>
          <div className="grid gap-3 md:grid-cols-2">{upcoming.map((c) => <ChallengeCard key={c.challenge.id} s={c} showLog={false} />)}</div>
        </section>
      )}

      {data.recentAchievements.length > 0 && (
        <Card>
          <CardTitle>Recent achievements</CardTitle>
          <ul className="mt-3 flex flex-wrap gap-2">
            {data.recentAchievements.map((a) => (
              <li key={`${a.challengeId}-${a.type}`} className="rounded-full bg-surface-2 px-3 py-1.5 text-sm">
                {ACHIEVEMENT_LABEL[a.type]} <span className="text-muted">· {a.challengeTitle}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {completed.length > 0 && (
        <section aria-labelledby="done-h" className="space-y-3">
          <h2 id="done-h" className="text-lg font-semibold">Completed</h2>
          <div className="grid gap-3 md:grid-cols-2">{completed.slice(0, 4).map((c) => <ChallengeCard key={c.challenge.id} s={c} showLog={false} />)}</div>
          {completed.length > 4 && <Link href="/challenges?status=completed" className="text-sm font-semibold text-primary">See all completed</Link>}
        </section>
      )}
    </div>
  );
}
