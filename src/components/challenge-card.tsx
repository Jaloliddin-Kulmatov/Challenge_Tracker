import { Flame } from "lucide-react";
import Link from "next/link";
import { LogButton } from "@/components/log-sheet";
import { Badge, Card, ProgressRing } from "@/components/ui/card";
import { describeRule, formatNumber, formatValue } from "@/lib/core/format";
import { formatDateShort } from "@/lib/core/dates";
import { CATEGORY_EMOJI, PHASE_LABEL, PHASE_TONE, unitOf } from "@/lib/ui-helpers";
import { plural } from "@/lib/utils";
import type { ChallengeSummary } from "@/lib/services/types";

export function ChallengeCard({ s, showLog = true }: { s: ChallengeSummary; showLog?: boolean }) {
  const c = s.challenge;
  const slot = s.due[0];
  const done = s.doneToday.length > 0 && s.due.length === 0;
  return (
    <Card data-accent={c.color} className="relative flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <ProgressRing value={s.goalPercentCapped}>{Math.round(s.goalPercent)}%</ProgressRing>
        <div className="min-w-0 flex-1">
          <Link href={`/challenges/${c.id}`} className="block truncate text-base font-semibold after:absolute after:inset-0 after:rounded-2xl after:content-['']">
            {CATEGORY_EMOJI[c.category]} {c.title}
          </Link>
          <p className="mt-0.5 truncate text-sm text-muted">
            {s.rule ? describeRule(s.rule, c.unit, c.trackingMethod, c.valueDecimals) : ""}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone={PHASE_TONE[s.phase]}>{PHASE_LABEL[s.phase]}</Badge>
            {s.pace && s.phase === "running" && (
              <Badge tone={s.pace === "behind" ? "warn" : "good"}>{s.pace === "ahead" ? "Ahead of plan" : s.pace === "behind" ? "Behind plan" : "On track"}</Badge>
            )}
            {s.streak.current > 1 && (
              <Badge tone="info"><Flame className="size-3" aria-hidden />{s.streak.current} {s.streak.unit}</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-sm text-muted">
        <span className="tabular">
          {c.trackingMethod === "completion" ? `${formatNumber(s.totalLogged, 0)} of ${formatNumber(s.totalTarget, 0)} done` : `${formatNumber(s.totalLogged, c.valueDecimals)} / ${formatNumber(s.totalTarget, c.valueDecimals)} ${unitOf(c)}`}
        </span>
        <span>
          {s.phase === "upcoming" ? `Starts ${formatDateShort(c.startDate)} (${plural(s.daysUntilStart, "day")})` : s.phase === "running" ? `${plural(s.daysRemaining, "day")} left` : s.phase === "completed" ? "Finished" : ""}
        </span>
      </div>

      {showLog && s.phase === "running" && (
        <div className="relative z-10 flex items-center justify-between gap-3 rounded-xl bg-surface-2 p-2.5 pl-3.5">
          <div className="min-w-0 text-sm">
            {slot ? (
              <>
                <div className="font-semibold">{slot.kind === "week" ? "This week" : slot.kind === "total" ? "Overall goal" : "Today"}</div>
                <div className="truncate text-muted tabular">
                  {c.trackingMethod === "completion" && slot.kind === "session"
                    ? "Not done yet"
                    : `${formatValue(slot.achieved, c.unit, c.trackingMethod, c.valueDecimals)} of ${formatValue(slot.target, c.unit, c.trackingMethod, c.valueDecimals)}`}
                </div>
              </>
            ) : done ? (
              <div className="font-semibold text-success">Today&apos;s session done ✓</div>
            ) : (
              <div className="text-muted">{s.next ? `Next: ${formatDateShort(s.next.windowStart)}` : "Nothing scheduled today"}</div>
            )}
          </div>
          <LogButton
            variant={slot ? "accent" : "outline"}
            t={{
              challengeId: c.id, title: c.title, trackingMethod: c.trackingMethod, unit: c.unit, decimals: c.valueDecimals, today: s.today,
              slotId: slot?.id, slotDate: slot?.windowStart, target: slot?.target, achieved: slot?.achieved,
            }}
          />
        </div>
      )}
    </Card>
  );
}
