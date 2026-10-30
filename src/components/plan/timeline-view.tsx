"use client";
import { AlertTriangle, Info } from "lucide-react";
import * as React from "react";
import { Tick } from "@/components/plan/tick";
import { Badge, Card } from "@/components/ui/card";
import type { ISODate } from "@/lib/core/dates";
import { WEEKDAY_LONG } from "@/lib/core/format";
import { dailyTasksFor } from "@/lib/plan/logic";
import { analyzeWeek, dateOfWeekday, timelineFor, toMin, untimedTasks, type Bucket, type TimelineItem } from "@/lib/plan/timeline";
import type { PlanTemplate } from "@/lib/plan/types";
import { cn } from "@/lib/utils";

type TickProps = (taskKey: string, period: string, locked?: boolean) => { checked: boolean; disabled: boolean; onToggle: () => void };

/** Colour and name of each kind of block (the stripe on the left of a block, and the analysis bars). */
export const KIND: Record<Bucket, { label: string; bar: string }> = {
  class: { label: "Classes", bar: "bg-[var(--chart-actual)]" },
  study: { label: "Study and tasks", bar: "bg-primary" },
  exercise: { label: "Exercise", bar: "bg-warning" },
  meal: { label: "Meals", bar: "bg-subtle" },
  travel: { label: "Travel", bar: "bg-border" },
  social: { label: "Social", bar: "bg-[#8e6bd9]" },
  rest: { label: "Free time", bar: "bg-surface-2 ring-1 ring-inset ring-border" },
  sleep: { label: "Sleep", bar: "bg-surface-2 ring-1 ring-inset ring-border" },
};

const range = (i: Pick<TimelineItem, "start" | "end">) => `${i.start}–${i.end === "24:00" ? "00:00" : i.end}`;

/** Minutes since midnight on the user's clock, once mounted (null on the server, so nothing mismatches). */
function useNowMinutes(active: boolean): number | null {
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!active) return setNow(null);
    const tick = () => {
      const d = new Date();
      setNow(d.getHours() * 60 + d.getMinutes());
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

/** One day as an hour-by-hour list. Blocks that are daily tasks can be ticked right here. */
export function DayTimeline({
  t, day, isToday, canTick, tickProps,
}: { t: PlanTemplate; day: ISODate; isToday: boolean; canTick: boolean; tickProps: TickProps }) {
  const items = timelineFor(t, day);
  const loose = untimedTasks(t, day); // tasks that should have a slot but don't (after an edit)
  const anytime = anytimeTasks(t, day, items); // tasks that are meant to be done at any time
  const nowMin = useNowMinutes(isToday);

  return (
    <div className="space-y-1 px-2 pb-2">
      {items.map((item) => {
        const current = nowMin !== null && nowMin >= toMin(item.start) && nowMin < toMin(item.end);
        return (
          <div key={item.id} className={cn("flex gap-2 rounded-xl", current && "bg-accent/10 ring-2 ring-accent/60")} aria-current={current ? "time" : undefined}>
            <div className="w-[3.1rem] shrink-0 pt-3 text-right text-xs font-semibold tabular text-muted">{item.start}</div>
            <span aria-hidden className={cn("my-1 w-1.5 shrink-0 rounded-full", KIND[item.kind].bar)} />
            <div className="min-w-0 flex-1">
              {item.taskKey ? (
                <Tick title={item.title} detail={item.detail} time={range(item)} highlightTime={item.kind === "exercise"} {...tickProps(item.taskKey, day, !canTick)} />
              ) : (
                <div className="px-2 py-2.5">
                  <div className={cn("text-[15px] leading-snug", item.kind === "class" ? "font-semibold" : "font-medium text-muted")}>{item.title}</div>
                  <div className="text-xs text-subtle tabular">{range(item)}{item.detail ? ` · ${item.detail}` : ""}</div>
                </div>
              )}
            </div>
          </div>
        );
      })}
      {(loose.length > 0 || anytime.length > 0) && (
        <div className="pt-2">
          <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-subtle">Any time today</div>
          {[...loose, ...anytime].map((task) => (
            <Tick key={task.taskKey} title={task.title} detail={task.detail} time={task.time} {...tickProps(task.taskKey, day, !canTick)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Today's tasks that have no block on the timeline (needs-no-slot ones, and any a user left without a time). */
function anytimeTasks(t: PlanTemplate, day: ISODate, items: TimelineItem[]) {
  const placed = new Set(items.map((i) => i.taskKey));
  const loose = new Set(untimedTasks(t, day).map((d) => d.taskKey));
  return dailyTasksFor(t, day).filter((d) => !placed.has(d.taskKey) && !loose.has(d.taskKey));
}

/** Read-only timeline of a typical day of the week (for the weekly schedule cards). */
export function WeekdayTimeline({ t, weekday }: { t: PlanTemplate; weekday: number }) {
  const items = timelineFor(t, dateOfWeekday(t, weekday));
  return (
    <ol className="space-y-1">
      {items.map((i) => (
        <li key={i.id} className="flex gap-2 text-sm">
          <span className="w-[5.6rem] shrink-0 text-xs font-semibold tabular text-muted">{range(i)}</span>
          <span aria-hidden className={cn("w-1.5 shrink-0 rounded-full", KIND[i.kind].bar)} />
          <span className={cn("min-w-0 flex-1", i.kind === "class" ? "font-semibold" : "text-muted")}>
            {i.title}
            {i.detail && <span className="block text-xs font-normal text-subtle">{i.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

const hoursText = (min: number) => `${Math.round((min / 60) * 10) / 10}`;

/** How the week is spent, and what looks tight. All figures come from the timeline above, so editing it updates them. */
export function AnalysisCard({ t }: { t: PlanTemplate }) {
  const a = analyzeWeek(t);
  const order: Bucket[] = ["class", "study", "exercise", "meal", "travel", "social", "rest"];
  const warnings = a.insights.filter((i) => i.level === "warn");
  const infos = a.insights.filter((i) => i.level === "info");
  return (
    <div className="space-y-3">
      <div>
        <h2 id="analysis-h" className="text-lg font-semibold">Analysis of my week</h2>
        <p className="text-sm text-muted">Where the hours go on each day, from wake-up to lights out. It updates when you edit the timeline.</p>
      </div>
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Legend">
          {order.map((b) => (
            <span key={b} className="inline-flex items-center gap-1.5 text-xs text-muted"><span aria-hidden className={cn("size-3 rounded-sm", KIND[b].bar)} />{KIND[b].label}</span>
          ))}
        </div>
        <div className="space-y-2.5">
          {a.days.map((d) => {
            const total = order.reduce((n, b) => n + d.minutes[b], 0) || 1;
            return (
              <div key={d.weekday} className="space-y-1">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-semibold">{WEEKDAY_LONG[d.weekday - 1]}</span>
                  <span className="text-xs text-muted tabular">{d.wake}–{d.sleepAt} · class {hoursText(d.minutes.class)} h · study {hoursText(d.minutes.study)} h · free {hoursText(d.minutes.rest)} h</span>
                </div>
                <div role="img" aria-label={`${WEEKDAY_LONG[d.weekday - 1]}: ${order.map((b) => `${KIND[b].label} ${hoursText(d.minutes[b])} hours`).join(", ")}`} className="flex h-3 overflow-hidden rounded-full bg-surface-2">
                  {order.map((b) => (d.minutes[b] > 0 ? <span key={b} className={KIND[b].bar} style={{ width: `${(d.minutes[b] / total) * 100}%` }} /> : null))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          {([["class", "Class hours"], ["study", "Study hours"], ["exercise", "Exercise"], ["rest", "Free time"]] as const).map(([b, label]) => (
            <div key={b} className="rounded-xl bg-surface-2 p-2.5">
              <div className="text-lg font-bold tabular">{a.hours[b]}</div>
              <div className="text-xs text-muted">{label} / week</div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="space-y-2 p-4">
        <h3 className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4 text-warning" aria-hidden /> Watch out {warnings.length > 0 && <Badge tone="warn">{warnings.length}</Badge>}</h3>
        {warnings.length === 0 ? <p className="text-sm text-muted">Nothing looks tight. 👍</p> : (
          <ul className="list-disc space-y-1 pl-5 text-sm">{warnings.map((w) => <li key={w.text}>{w.text}</li>)}</ul>
        )}
        <h3 className="flex items-center gap-2 pt-2 font-semibold"><Info className="size-4 text-primary" aria-hidden /> Good to know</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{infos.map((w) => <li key={w.text}>{w.text}</li>)}</ul>
      </Card>
    </div>
  );
}
