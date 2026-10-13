import { CalendarDays, Flame, Target, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChallengeActions } from "@/components/challenge-actions";
import { ProgressChart, WeeklyChart } from "@/components/charts";
import { LogList } from "@/components/log-list";
import { MilestonesPanel } from "@/components/milestones-panel";
import { ScheduleList } from "@/components/schedule-list";
import { SharePanel } from "@/components/share-panel";
import { Badge, Card, CardTitle, ProgressBar, Stat } from "@/components/ui/card";
import { requireCtx } from "@/lib/auth/session";
import { achievementInfo, type AchievementType } from "@/lib/core/achievements";
import { diffDays, formatDateLong, formatDateShort } from "@/lib/core/dates";
import { describeRule, formatNumber, formatValue } from "@/lib/core/format";
import { getChallengeDetail } from "@/lib/services/challenges";
import { CATEGORY_EMOJI, CATEGORY_LABEL, PHASE_LABEL, PHASE_TONE, unitOf } from "@/lib/ui-helpers";
import { plural } from "@/lib/utils";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  void params;
  return { title: "Challenge" };
}

export default async function ChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { ctx } = await requireCtx();
  const d = await getChallengeDetail(ctx, id);
  if (!d) notFound();

  const { challenge: c, progress: p } = d;
  const fmt = (n: number) => formatValue(n, c.unit, c.trackingMethod, c.valueDecimals);
  const locked = c.status === "completed" || c.status === "archived";
  const unit = unitOf(c) || "times";
  const openSlot = p.slots.find((s) => s.state === "due");
  const open = d.pauses.find((x) => x.endDate === null);
  const earlyBy = c.completedLocalDate ? diffDays(c.completedLocalDate, c.endDate) : 0;
  

  return (
    <div data-accent={c.color} className="space-y-5">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{CATEGORY_EMOJI[c.category]} {CATEGORY_LABEL[c.category]}</Badge>
          <Badge tone={PHASE_TONE[p.phase]}>{PHASE_LABEL[p.phase]}</Badge>
          {c.completedEarly && <Badge tone="good">Finished {plural(earlyBy, "day")} early</Badge>}
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{c.title}</h1>
        {c.description && <p className="max-w-2xl whitespace-pre-wrap text-muted">{c.description}</p>}
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4" aria-hidden />{formatDateShort(c.startDate)} → {formatDateShort(c.endDate)} ({plural(p.daysTotal, "day")})</span>
          {d.currentRule && <span className="inline-flex items-center gap-1.5"><Target className="size-4" aria-hidden />{describeRule(d.currentRule, c.unit, c.trackingMethod, c.valueDecimals)}</span>}
        </p>
      </header>

      {p.phase === "upcoming" && (
        <Banner tone="info">Starts {formatDateLong(c.startDate)} – in {plural(p.daysUntilStart, "day")}. Logging opens on the start date; until then you can still edit the plan.</Banner>
      )}
      {p.phase === "paused" && open && (
        <Banner tone="warn">Paused since {formatDateLong(open.startDate)}. Paused days aren&apos;t counted as missed. When you resume, the end date moves back by the number of days paused.</Banner>
      )}
      {p.phase === "ended" && (
        <Banner tone="warn">This challenge ended on {formatDateLong(c.endDate)}. Review your results and finish it to lock them in – or extend the end date from Edit.</Banner>
      )}
      {p.phase === "running" && p.targetReached && (
        <Banner tone="good">🎯 You&apos;ve reached your overall target{p.exceededBy > 0 ? ` (+${fmt(p.exceededBy)})` : ""}! Finish now to lock in your results, or keep going.</Banner>
      )}

      <ChallengeActions
        id={c.id}
        phase={p.phase}
        targetReached={p.targetReached}
        endsEarly={c.endDate > p.today}
        logTarget={{
          challengeId: c.id, title: c.title, trackingMethod: c.trackingMethod, unit: c.unit, decimals: c.valueDecimals, today: p.today,
          slotId: openSlot?.id, slotDate: openSlot?.windowStart, target: openSlot?.target, achieved: openSlot?.achieved,
        }}
      />

      {p.phase === "completed" && (
        <Card className="space-y-4 border-success/40">
          <CardTitle>🏁 Final results</CardTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total" value={fmt(p.totalLogged)} hint={`${formatNumber(p.goalPercent, 1)}% of ${fmt(p.totalTarget)}`} />
            <Stat label="Sessions done" value={p.sessionsCounted ? `${p.sessionsCompleted}/${p.sessionsCounted}` : "–"} hint={p.adherencePercent !== null ? `${p.adherencePercent}% adherence` : undefined} />
            <Stat label="Longest streak" value={`${p.streak.longest}`} hint={p.streak.unit} />
            <Stat label="Best day" value={p.bestDay ? fmt(p.bestDay.value) : "–"} hint={p.bestDay ? formatDateShort(p.bestDay.date) : undefined} />
          </div>
          <p className="text-sm text-muted">
            Finished on {c.completedLocalDate ? formatDateLong(c.completedLocalDate) : "–"}
            {earlyBy > 0 ? `, ${plural(earlyBy, "day")} before the planned end.` : "."}
            {" "}You logged on {plural(p.activeDays, "day")}{p.averagePerActiveDay !== null ? ` – about ${fmt(p.averagePerActiveDay)} on each.` : "."}
          </p>
        </Card>
      )}

      <section aria-label="Statistics" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Progress" value={<span>{fmt(p.totalLogged)}</span>} hint={<><ProgressBar value={p.goalPercentCapped} className="mb-1 mt-1" label={`${c.title} progress`} />{formatNumber(p.goalPercent, 1)}% of {fmt(p.totalTarget)}</>} />
        <Stat
          label="Pace"
          value={<span className="inline-flex items-center gap-1.5"><TrendingUp className="size-5" aria-hidden />{p.pace === null ? "–" : p.pace === "ahead" ? "Ahead" : p.pace === "behind" ? "Behind" : "On track"}</span>}
          hint={p.asOf ? `Plan so far: ${fmt(p.expectedToDate)}` : "Not started"}
        />
        <Stat label="Streak" value={<span className="inline-flex items-center gap-1.5"><Flame className="size-5" aria-hidden />{p.streak.current}</span>} hint={`${p.streak.unit} · best ${p.streak.longest}`} />
        <Stat
          label={p.phase === "running" ? "Time left" : "Adherence"}
          value={p.phase === "running" ? plural(p.daysRemaining, "day") : p.adherencePercent === null ? "–" : `${p.adherencePercent}%`}
          hint={p.phase === "running" ? (p.requiredPerDay !== null && p.remainingToTarget > 0 ? `Need ~${formatNumber(p.requiredPerDay, c.trackingMethod === "completion" ? 1 : c.valueDecimals)}${c.trackingMethod === "completion" ? "" : ` ${unitOf(c)}`}/day` : "Target met") : `${p.sessionsCompleted} done · ${p.sessionsMissed} missed`}
        />
      </section>
      {p.phase === "running" && p.sessionsCounted > 0 && (
        <p className="-mt-2 text-sm text-muted">{p.sessionsCompleted} of {p.sessionsCounted} sessions done · {p.sessionsMissed} missed · {p.sessionsDue + p.sessionsUpcoming} to go{p.sessionsSkipped ? ` · ${p.sessionsSkipped} skipped` : ""}</p>
      )}

      <Card>
        <CardTitle>Progress vs plan</CardTitle>
        <div className="mt-3"><ProgressChart daily={p.daily} today={p.today} unit={unit} decimals={c.valueDecimals} /></div>
      </Card>
      {p.weekly.length > 1 && (
        <Card>
          <CardTitle>Week by week</CardTitle>
          <div className="mt-3"><WeeklyChart weekly={p.weekly} unit={unit} decimals={c.valueDecimals} /></div>
        </Card>
      )}

      <section aria-labelledby="sched-h" className="space-y-2">
        <h2 id="sched-h" className="text-lg font-semibold">Schedule</h2>
        <ScheduleList
          slots={p.slots} today={p.today} locked={locked}
          canLogToday={p.phase === "running" || p.phase === "ended"}
          challenge={{ id: c.id, title: c.title, trackingMethod: c.trackingMethod, unit: c.unit, decimals: c.valueDecimals, startDate: c.startDate, endDate: c.endDate }}
        />
      </section>

      <section aria-labelledby="hist-h" className="space-y-2">
        <h2 id="hist-h" className="text-lg font-semibold">History</h2>
        <LogList logs={d.logs} locked={locked} today={p.today} challenge={{ trackingMethod: c.trackingMethod, unit: c.unit, decimals: c.valueDecimals, startDate: c.startDate, endDate: c.endDate }} />
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardTitle>Milestones</CardTitle>
          <div className="mt-3"><MilestonesPanel challengeId={c.id} milestones={d.milestones} locked={locked} challenge={{ trackingMethod: c.trackingMethod, unit: c.unit, decimals: c.valueDecimals }} /></div>
        </Card>
        <Card>
          <CardTitle>Achievements</CardTitle>
          {d.achievements.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Log activity to start earning achievements.</p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {d.achievements.map((a) => {
                const info = achievementInfo(a.type as AchievementType, p.streak.unit);
                return (
                  <li key={a.type} className="flex items-start gap-3 text-sm">
                    <span className="text-xl" aria-hidden>{info.emoji}</span>
                    <div><div className="font-medium">{info.title}</div><div className="text-muted">{info.description}</div></div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {c.status !== "archived" && (
        <Card>
          <CardTitle>Share</CardTitle>
          <div className="mt-3"><SharePanel challengeId={c.id} shares={d.shares} /></div>
        </Card>
      )}
    </div>
  );
}


function Banner({ tone, children }: { tone: "info" | "warn" | "good"; children: React.ReactNode }) {
  const cls = { info: "bg-accent/10 text-foreground", warn: "bg-warning/15 text-foreground", good: "bg-success/15 text-foreground" }[tone];
  return <p role="status" className={`rounded-2xl px-4 py-3 text-sm ${cls}`}>{children}</p>;
}
