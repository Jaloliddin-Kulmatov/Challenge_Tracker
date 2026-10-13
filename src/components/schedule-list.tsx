"use client";
import { CalendarClock, Check, ChevronDown, MoreVertical } from "lucide-react";
import * as React from "react";
import { addExtraSessionAction, rescheduleSlotAction, setSlotSkippedAction, setSlotTargetAction } from "@/app/actions/challenges";
import { LogButton, type LogTarget } from "@/components/log-sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useRunner } from "@/components/use-runner";
import { addDays, formatDateShort, isoWeekday, startOfIsoWeek } from "@/lib/core/dates";
import { formatNumber, formatValue, WEEKDAY_SHORT } from "@/lib/core/format";
import type { SlotEvaluation, SlotState } from "@/lib/core/progress";
import { SLOT_STATE_LABEL } from "@/lib/ui-helpers";
import { cn } from "@/lib/utils";

const TONE: Record<SlotState, "neutral" | "good" | "warn" | "bad" | "info"> = {
  completed: "good", missed: "bad", due: "info", upcoming: "neutral", skipped: "neutral", excused: "warn", cancelled: "neutral",
};

interface Props {
  slots: SlotEvaluation[];
  today: string;
  locked: boolean;
  canLogToday: boolean;
  challenge: { id: string; title: string; trackingMethod: "completion" | "quantity"; unit: string | null; decimals: number; startDate: string; endDate: string };
}

export function ScheduleList({ slots, today, locked, canLogToday, challenge }: Props) {
  const [showAll, setShowAll] = React.useState(false);
  const [editing, setEditing] = React.useState<SlotEvaluation | null>(null);
  const [adding, setAdding] = React.useState(false);

  const visible = slots.filter((s) => s.state !== "cancelled");
  const weeks = new Map<string, SlotEvaluation[]>();
  for (const s of visible) {
    const key = startOfIsoWeek(s.windowStart);
    weeks.set(key, [...(weeks.get(key) ?? []), s]);
  }
  const thisWeek = startOfIsoWeek(today);
  const entries = [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b));
  // by default show the current week and the next two (or the final three weeks if the challenge is over)
  const idx = entries.findIndex(([k]) => k >= thisWeek);
  const from = idx === -1 ? Math.max(0, entries.length - 3) : Math.max(0, idx - 1);
  const shown = showAll ? entries : entries.slice(from, from + 3);

  const target = (s: SlotEvaluation): LogTarget => ({
    challengeId: challenge.id, title: challenge.title, trackingMethod: challenge.trackingMethod, unit: challenge.unit, decimals: challenge.decimals,
    today, slotId: s.id, slotDate: s.windowStart, target: s.target, achieved: s.achieved,
  });
  const fmt = (n: number) => formatValue(n, challenge.unit, challenge.trackingMethod, challenge.decimals);
  const progressText = (s: SlotEvaluation) =>
    challenge.trackingMethod === "completion" && s.kind === "session"
      ? s.achieved >= s.target ? "Done" : "Not done yet"
      : challenge.trackingMethod === "completion"
        ? `${formatNumber(s.achieved, 0)} of ${formatNumber(s.target, 0)} times`
        : `${fmt(s.achieved)} / ${fmt(s.target)}`;

  return (
    <div className="space-y-4">
      {shown.map(([weekStart, items]) => (
        <section key={weekStart} aria-label={`Week of ${formatDateShort(weekStart)}`}>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
            {weekStart === thisWeek ? "This week" : `Week of ${formatDateShort(weekStart)}`}
          </h3>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {items.map((s) => {
              const isTotal = s.kind === "total";
              const isWeek = s.kind === "week";
              const canLog = !locked && canLogToday && (s.state === "due" || s.state === "missed") && s.windowStart <= today;
              const label = isTotal ? "Overall goal" : isWeek ? `${formatDateShort(s.windowStart)} – ${formatDateShort(s.windowEnd)}` : `${WEEKDAY_SHORT[isoWeekday(s.windowStart) - 1]}, ${formatDateShort(s.windowStart)}`;
              return (
                <li key={s.id} className={cn("flex items-center gap-3 px-3.5 py-3", s.windowStart <= today && today <= s.windowEnd && "bg-accent/5")}>
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-full text-xs", s.state === "completed" ? "bg-success text-primary-fg" : "bg-surface-2 text-muted")} aria-hidden>
                    {s.state === "completed" ? <Check className="size-4" /> : s.kind === "session" ? isoWeekday(s.windowStart) : "Σ"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-medium">{label}</span>
                      {s.label && <span className="text-sm text-muted">· {s.label}</span>}
                      {s.isCustomized && <span className="text-xs text-subtle" title="You edited this session">edited</span>}
                    </div>
                    <div className="text-sm text-muted tabular">
                      {s.state === "skipped" || s.state === "excused" ? SLOT_STATE_LABEL[s.state] : progressText(s)}
                      {s.exceeded && <span className="ml-1.5 font-medium text-success">+{Math.round(s.percent - 100)}%</span>}
                    </div>
                  </div>
                  <Badge tone={TONE[s.state]} className="hidden sm:inline-flex">{SLOT_STATE_LABEL[s.state]}</Badge>
                  {s.state !== "skipped" && s.state !== "excused" && <span className={cn("sm:hidden text-xs font-semibold", s.state === "missed" ? "text-danger" : s.state === "completed" ? "text-success" : "text-muted")}>{SLOT_STATE_LABEL[s.state]}</span>}
                  {canLog && <LogButton t={target(s)} size="sm" variant={s.state === "due" ? "accent" : "outline"} label={challenge.trackingMethod === "completion" ? "Done" : "Log"} />}
                  {!locked && !isTotal && (
                    <Button variant="ghost" size="icon" className="size-9" aria-label={`Edit session on ${formatDateShort(s.windowStart)}`} onClick={() => setEditing(s)}><MoreVertical className="size-4" /></Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {entries.length > 3 ? (
          <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}><ChevronDown className={cn("size-4 transition-transform", showAll && "rotate-180")} /> {showAll ? "Show fewer weeks" : `Show all ${entries.length} weeks`}</Button>
        ) : <span />}
        {!locked && <Button variant="outline" size="sm" onClick={() => setAdding(true)}><CalendarClock className="size-4" /> Add extra session</Button>}
      </div>

      {editing && <SlotSheet slot={editing} today={today} challenge={challenge} onClose={() => setEditing(null)} />}
      {adding && <AddSheet today={today} challenge={challenge} onClose={() => setAdding(false)} />}
    </div>
  );
}

function SlotSheet({ slot, today, challenge, onClose }: { slot: SlotEvaluation; today: string; challenge: Props["challenge"]; onClose: () => void }) {
  const { exec, pending } = useRunner();
  const [date, setDate] = React.useState(slot.windowStart >= today ? slot.windowStart : today);
  const [target, setTarget] = React.useState(String(slot.rawTarget));
  const [error, setError] = React.useState<string | null>(null);
  const past = slot.windowEnd < today;
  const hasLogs = slot.achieved > 0;
  const isSession = slot.kind === "session";
  const run = async (fn: Parameters<typeof exec>[0], success: string) => {
    setError(null);
    const res = await exec(fn, { silentError: true, success, onOk: onClose });
    if (res && !res.ok) setError(res.error);
  };
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="Edit session" description={`${formatDateShort(slot.windowStart)}${slot.label ? ` · ${slot.label}` : ""}`}>
      <div className="space-y-5">
        {isSession && (
          <div className="space-y-2">
            <Field label="Move to another day" htmlFor="slot-date" hint={hasLogs ? "This session has activity logged – edit or delete that first." : "Handy for making up a missed session."}>
              <div className="flex gap-2">
                <Input id="slot-date" type="date" min={today > challenge.startDate ? today : challenge.startDate} max={challenge.endDate} value={date} onChange={(e) => setDate(e.target.value)} disabled={hasLogs} />
                <Button variant="secondary" loading={pending} disabled={hasLogs || date === slot.windowStart} onClick={() => run(() => rescheduleSlotAction(slot.id, date), "Session moved.")}>Move</Button>
              </div>
            </Field>
          </div>
        )}
        {challenge.trackingMethod === "quantity" && (
          <Field label={`Target${challenge.unit ? ` (${challenge.unit})` : ""}`} htmlFor="slot-target" hint={past ? "Past sessions keep the target they had." : undefined}>
            <div className="flex gap-2">
              <Input id="slot-target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value.replace(",", "."))} disabled={past} />
              <Button variant="secondary" loading={pending} disabled={past || Number(target) === slot.rawTarget} onClick={() => run(() => setSlotTargetAction(slot.id, Number.parseFloat(target)), "Target updated.")}>Save</Button>
            </div>
          </Field>
        )}
        <div className="space-y-1.5">
          {slot.state === "skipped" ? (
            <Button variant="outline" className="w-full" loading={pending} onClick={() => run(() => setSlotSkippedAction(slot.id, false), "Session restored.")}>Un-skip this session</Button>
          ) : (
            <Button variant="outline" className="w-full" loading={pending} disabled={hasLogs} onClick={() => run(() => setSlotSkippedAction(slot.id, true), "Session skipped.")}>Skip this session</Button>
          )}
          <p className="text-xs text-muted">Skipped sessions don&apos;t count as missed or towards your target.</p>
        </div>
        {error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{error}</p>}
      </div>
    </Sheet>
  );
}

function AddSheet({ today, challenge, onClose }: { today: string; challenge: Props["challenge"]; onClose: () => void }) {
  const { exec, pending } = useRunner();
  const min = today > challenge.startDate ? today : challenge.startDate;
  const [date, setDate] = React.useState(min > challenge.endDate ? challenge.endDate : addDays(min, 0));
  const [target, setTarget] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await exec(
      () => addExtraSessionAction(challenge.id, { date, target: challenge.trackingMethod === "quantity" ? Number.parseFloat(target) : undefined, label: label || undefined }),
      { silentError: true, success: "Session added.", onOk: onClose },
    );
    if (res && !res.ok) setError(res.error);
  }
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="Add an extra session" description="A one-off session outside your normal schedule.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Day" htmlFor="add-date"><Input id="add-date" type="date" min={min} max={challenge.endDate} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        {challenge.trackingMethod === "quantity" && (
          <Field label={`Target${challenge.unit ? ` (${challenge.unit})` : ""}`} htmlFor="add-target"><Input id="add-target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value.replace(",", "."))} /></Field>
        )}
        <Field label="Label (optional)" htmlFor="add-label"><Input id="add-label" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Long run" /></Field>
        {error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={pending}>Add session</Button>
      </form>
    </Sheet>
  );
}
