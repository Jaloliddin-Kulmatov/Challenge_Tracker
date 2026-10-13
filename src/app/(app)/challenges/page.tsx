import type { Metadata } from "next";
import Link from "next/link";
import { ChallengeCard } from "@/components/challenge-card";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/card";
import { requireCtx } from "@/lib/auth/session";
import { listChallengeSummaries } from "@/lib/services/challenges";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Challenges" };
export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "all", label: "Active", match: (p: string) => ["running", "paused", "ended", "upcoming"].includes(p) },
  { key: "completed", label: "Completed", match: (p: string) => p === "completed" },
  { key: "archived", label: "Archived", match: (p: string) => p === "archived" },
] as const;

export default async function ChallengesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const { ctx } = await requireCtx();
  const all = await listChallengeSummaries(ctx, { includeArchived: true });
  const filter = FILTERS.find((f) => f.key === status) ?? FILTERS[0];
  const shown = all.filter((c) => filter.match(c.phase));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Challenges</h1>
        <Link href="/challenges/new" className={cn(buttonVariants({ size: "sm" }))}>New challenge</Link>
      </div>
      <nav aria-label="Filter challenges" className="flex gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/challenges" : `/challenges?status=${f.key}`}
            aria-current={f.key === filter.key ? "page" : undefined}
            className={cn("min-h-10 rounded-full px-4 py-2 text-sm font-medium", f.key === filter.key ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted")}
          >
            {f.label} ({all.filter((c) => f.match(c.phase)).length})
          </Link>
        ))}
      </nav>
      {shown.length === 0 ? (
        <EmptyState title={`No ${filter.label.toLowerCase()} challenges`} action={filter.key === "all" ? <Link href="/challenges/new" className={cn(buttonVariants())}>Create a challenge</Link> : undefined}>
          {filter.key === "all" ? "Start one to see your schedule, progress and charts here." : "They will show up here."}
        </EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">{shown.map((c) => <ChallengeCard key={c.challenge.id} s={c} showLog={filter.key === "all"} />)}</div>
      )}
    </div>
  );
}
