"use client";
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, Flame, Pencil } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { saveMetricsAction, setCheckAction } from "@/app/actions/plan";
import { ReminderCard, type ReminderProps } from "@/components/plan/reminder-card";
import { TelegramCard, type TelegramProps } from "@/components/plan/telegram-card";
import { Tick } from "@/components/plan/tick";
import { AnalysisCard, DayTimeline, WeekdayTimeline } from "@/components/plan/timeline-view";
import { Badge, Card, CardTitle, ProgressBar } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { addDays, compareDates, diffDays, formatDateLong, formatDateShort, isoWeekday, minDate, type ISODate } from "@/lib/core/dates";
import { formatNumber, WEEKDAY_LONG } from "@/lib/core/format";
import {
  booksCount, checkKey, currentWeek, dailyTasksFor, dayCount, dayNumber, goalsCount, monthCount, monthFor, monthStats, nextMonth,
  perfectDays, planPhase, weekCount, weekOf, weekPlan, weekRange, type Count, type Target,
} from "@/lib/plan/logic";
import type { MonthPlan, PlanTemplate } from "@/lib/plan/types";
import type { MetricView } from "@/lib/services/plan";
import { cn } from "@/lib/utils";

interface Props {
  template: PlanTemplate;
  today: ISODate;
  initialChecks: string[];
  initialMetrics: MetricView[];
  reminder: ReminderProps;
  telegram: TelegramProps;
}

const pct = (c: Count) => (c.total === 0 ? 0 : (c.done / c.total) * 100);

export function PlanView({ template: t, today, initialChecks, initialMetrics, reminder, telegram }: Props) {
  const templateKey = t.key;
  const toast = useToast();
  const [checks, setChecks] = React.useState<Set<string>>(() => new Set(initialChecks));
  const [busy, setBusy] = React.useState<Set<string>>(() => new Set());
  const [metrics, setMetrics] = React.useState<MetricView[]>(initialMetrics);

  const phase = planPhase(t, today);
  const nowWeek = currentWeek(t, today);
  const clampedToday = phase === "upcoming" ? t.startDate : minDate(today, t.endDate);
  const [day, setDay] = React.useState<ISODate>(clampedToday);
  const canTickDay = compareDates(day, today) <= 0 && compareDates(day, t.startDate) >= 0 && compareDates(day, t.endDate) <= 0;

  /** Tick/untick with an instant update; if the server says no (or can't be reached) put it back and say so. */
  const toggle = React.useCallback(
    async (taskKey: string, period: string) => {
      const key = checkKey(taskKey, period);
      if (busy.has(key)) return;
      const next = !checks.has(key);
      const apply = (on: boolean) =>
        setChecks((prev) => {
          const copy = new Set(prev);
          if (on) copy.add(key);
          else copy.delete(key);
          return copy;
        });
      apply(next);
      setBusy((b) => new Set(b).add(key));
      try {
        const res = await setCheckAction({ templateKey, taskKey, period, checked: next });
        if (!res.ok) {
          apply(!next);
          toast.error(res.unauthenticated ? "Your session has expired. Please log in again." : res.error);
        }
      } catch {
        apply(!next);
        toast.error("Couldn't save that tick – check your connection and try again.");
      } finally {
        setBusy((b) => {
          const copy = new Set(b);
          copy.delete(key);
          return copy;
        });
      }
    },
    [busy, checks, templateKey, toast],
  );

  const tickProps = (taskKey: string, period: string, locked = false) => ({
    checked: checks.has(checkKey(taskKey, period)),
    disabled: locked || busy.has(checkKey(taskKey, period)),
    onToggle: () => toggle(taskKey, period),
  });

  const { day: dayN, total: totalDays } = dayNumber(t, today);
  const weekDone = weekCount(t, checks, nowWeek);
  const perfect = perfectDays(t, checks, today);
  const thisMonth = monthFor(t, phase === "upcoming" ? t.startDate : today);
  const upcomingMonth = nextMonth(t, thisMonth);

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------------- header */}
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
            <p className="text-sm text-muted">{t.subtitle}</p>
          </div>
          <Link href="/plan/edit" className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3.5 text-sm font-semibold text-muted hover:bg-border">
            <Pencil className="size-4" aria-hidden /> Edit
          </Link>
        </div>
        {phase === "upcoming" && (
          <p role="status" className="rounded-2xl bg-accent/10 px-4 py-3 text-sm">
            Your plan starts on <strong>{formatDateLong(t.startDate)}</strong> – in {diffDays(today, t.startDate)} day(s). Have a look around; ticking starts on day one.
          </p>
        )}
        {phase === "finished" && <p role="status" className="rounded-2xl bg-success/15 px-4 py-3 text-sm">🏁 The plan has finished. You can still go back and fill in earlier days.</p>}
        <div className="grid grid-cols-2 gap-3">
          <Card className="space-y-1.5 p-3">
            <div className="text-xs font-medium text-muted">Plan</div>
            <div className="text-lg font-bold tabular">{phase === "upcoming" ? "Not started" : `Day ${dayN} / ${totalDays}`}</div>
            <ProgressBar value={phase === "upcoming" ? 0 : (dayN / totalDays) * 100} label="Plan progress" />
            <div className="text-xs text-subtle">Week {nowWeek} of {t.weeks.length}</div>
          </Card>
          <Card className="space-y-1.5 p-3">
            <div className="text-xs font-medium text-muted">Week {nowWeek}</div>
            <div className="text-lg font-bold tabular">{weekDone.done} / {weekDone.total}</div>
            <ProgressBar value={pct(weekDone)} label="This week's progress" />
            <div className="flex items-center gap-1 text-xs text-subtle"><Flame className="size-3.5" aria-hidden /> {perfect} perfect {perfect === 1 ? "day" : "days"}</div>
          </Card>
        </div>
        <ReminderCard initial={reminder} />
        <TelegramCard initial={telegram} />
        <nav aria-label="Sections" className="sticky top-14 z-10 -mx-4 flex gap-2 overflow-x-auto border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
          {[["goals", "Goals"], ["today", "Today"], ["month", "Month"], ["weeks", "Weeks"], ["schedule", "Schedule"], ["analysis", "Analysis"]].map(([id, label]) => (
            <a key={id} href={`#${id}`} className="min-h-9 shrink-0 rounded-full bg-surface-2 px-4 py-1.5 text-sm font-semibold text-muted hover:bg-border">{label}</a>
          ))}
        </nav>
      </header>

      {/* ------------------------------------------------------------ 1. goals */}
      <section id="goals" aria-labelledby="goals-h" className="scroll-mt-28">
        <GoalsCard t={t} checks={checks} tickProps={tickProps} metrics={metrics} />
      </section>

      {/* ------------------------------------------------------------ 2. today */}
      <section id="today" aria-labelledby="today-h" className="scroll-mt-28">
        <TodayCard t={t} day={day} setDay={setDay} today={today} canTickDay={canTickDay} checks={checks} tickProps={tickProps} />
      </section>

      {/* ----------------------------------------------------------- 3. months */}
      <section id="month" aria-labelledby="month-h" className="scroll-mt-28 space-y-3">
        <h2 id="month-h" className="text-lg font-semibold">Monthly goals</h2>
        <MonthCard t={t} month={thisMonth} label="This month" checks={checks} tickProps={tickProps} metrics={metrics} today={today} />
        {upcomingMonth && <MonthCard t={t} month={upcomingMonth} label="Next month" checks={checks} tickProps={tickProps} metrics={metrics} today={today} />}
        <AllMonths t={t} skip={[thisMonth.key, upcomingMonth?.key]} checks={checks} tickProps={tickProps} metrics={metrics} today={today} />
      </section>

      {/* ------------------------------------------------------------ 4. weeks */}
      <section id="weeks" aria-labelledby="weeks-h" className="scroll-mt-28 space-y-3">
        <h2 id="weeks-h" className="text-lg font-semibold">Week by week</h2>
        <p className="-mt-2 text-sm text-muted">Every week also includes the weekly goals. Tap a week to open it.</p>
        <div className="space-y-2">
          {t.weeks.map((w) => (
            <WeekCard
              key={w.n} t={t} n={w.n} today={today} open={w.n === nowWeek} checks={checks} tickProps={tickProps}
              metrics={metrics} onMetrics={setMetrics}
            />
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------- 5. schedule */}
      <section id="schedule" aria-labelledby="schedule-h" className="scroll-mt-28">
        <ScheduleCard t={t} today={today} />
      </section>

      {/* ---------------------------------------------------------- 6. analysis */}
      <section id="analysis" aria-labelledby="analysis-h" className="scroll-mt-28">
        <AnalysisCard t={t} />
      </section>
    </div>
  );
}

type TickProps = (taskKey: string, period: string, locked?: boolean) => { checked: boolean; disabled: boolean; onToggle: () => void };

// ---------------------------------------------------------------------------
// 1. Overall goals
// ---------------------------------------------------------------------------
function GoalsCard({ t, checks, tickProps, metrics }: { t: PlanTemplate; checks: Set<string>; tickProps: TickProps; metrics: MetricView[] }) {
  const c = goalsCount(t, checks);
  const books = booksCount(t, checks);
  const end = t.months.at(-1)!;
  const latest = (pick: (m: MetricView) => number | null) => [...metrics].reverse().map(pick).find((v): v is number => v !== null) ?? null;
  const bestRun = metrics.reduce<number | null>((m, x) => (x.longRunKm !== null && (m === null || x.longRunKm > m) ? x.longRunKm : m), null);
  const stats = [
    { label: "Weight", value: latest((m) => m.weightKg), target: t.weightGoalKg, unit: " kg" },
    { label: "Best long run", value: bestRun, target: end.longRunKm, unit: " km" },
  ];
  return (
    <Card className="p-0">
      <details className="group">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
          <div>
            <h2 id="goals-h" className="text-base font-semibold">Overall goals by {formatDateShort(t.endDate)}</h2>
            <p className="text-sm text-muted">{c.done} of {c.total} achieved</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-16"><ProgressBar value={pct(c)} label="Goals achieved" /></div>
            <ChevronDown className="size-5 text-muted transition-transform group-open:rotate-180" aria-hidden />
          </div>
        </summary>
        <div className="space-y-1 border-t border-border px-2 py-2">
          {t.goals.map((g) => (
            <Tick key={g.key} title={g.area} detail={g.target} {...tickProps(`goal:${g.key}`, "once")} />
          ))}
          {t.books.length > 0 && (
            <div className="mt-2 border-t border-border pt-2">
              <h3 className="flex items-center gap-2 px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-subtle">
                <BookOpen className="size-3.5" aria-hidden /> Books · {books.done} of {books.total} finished
              </h3>
              {t.books.map((b) => (
                <Tick key={b.id} title={b.title} {...tickProps(`book:${b.id}`, "once")} />
              ))}
            </div>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2 px-1 pb-1">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl bg-surface-2 p-2.5">
                <div className="text-xs text-muted">{s.label}</div>
                <div className="font-bold tabular">{s.value === null ? "–" : `${formatNumber(s.value, 1)}${s.unit}`}</div>
                <div className="text-xs text-subtle">goal {formatNumber(s.target, 0)}{s.unit}</div>
              </div>
            ))}
          </div>
          <p className="px-3 pb-2 text-xs text-subtle">These numbers come from the Sunday review in each week below.</p>
        </div>
      </details>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 2. Today
// ---------------------------------------------------------------------------
function TodayCard({
  t, day, setDay, today, canTickDay, checks, tickProps,
}: { t: PlanTemplate; day: ISODate; setDay: (d: ISODate) => void; today: ISODate; canTickDay: boolean; checks: Set<string>; tickProps: TickProps }) {
  const tasks = dailyTasksFor(t, day);
  const c = dayCount(t, checks, day);
  const last = compareDates(today, t.startDate) < 0 ? t.startDate : minDate(today, t.endDate);
  const isToday = day === today;
  const rest = isoWeekday(day) === 7;
  const [view, setView] = React.useState<"timeline" | "list">("timeline");
  return (
    <Card className="space-y-3 p-0">
      <div className="flex items-center gap-2 px-3 pt-3">
        <Button variant="ghost" size="icon" className="size-10" aria-label="Previous day" disabled={compareDates(day, t.startDate) <= 0} onClick={() => setDay(addDays(day, -1))}><ChevronLeft className="size-5" /></Button>
        <div className="min-w-0 flex-1 text-center">
          <h2 id="today-h" className="text-base font-semibold">{isToday ? "Today" : WEEKDAY_LONG[isoWeekday(day) - 1]}</h2>
          <p className="text-sm text-muted">{formatDateLong(day)}</p>
        </div>
        <Button variant="ghost" size="icon" className="size-10" aria-label="Next day" disabled={compareDates(day, last) >= 0} onClick={() => setDay(addDays(day, 1))}><ChevronRight className="size-5" /></Button>
      </div>
      <div className="flex items-center gap-3 px-4">
        <div className="flex-1"><ProgressBar value={pct(c)} label="Day progress" /></div>
        <div className="text-sm font-bold tabular" aria-live="polite">{c.done} / {c.total}</div>
        {!isToday && compareDates(today, t.startDate) >= 0 && <Button variant="secondary" size="sm" onClick={() => setDay(last)}>Back to today</Button>}
      </div>
      <div role="group" aria-label="How to show the day" className="mx-4 flex gap-1 rounded-xl bg-surface-2 p-1">
        {([["timeline", "Timeline"], ["list", "Checklist"]] as const).map(([v, label]) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => setView(v)}
            className={cn("min-h-9 flex-1 rounded-lg text-sm font-semibold", view === v ? "bg-surface text-foreground shadow-sm" : "text-muted")}
          >
            {label}
          </button>
        ))}
      </div>
      {rest && <p className="mx-4 rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">😌 Rest day. Keep it light: German, reading and the 30-minute review.</p>}
      {!canTickDay && (
        <p role="status" className="mx-4 rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">
          {compareDates(day, today) > 0 ? "This day hasn't happened yet." : "Ticking starts when the plan begins."}
        </p>
      )}
      {view === "timeline" ? (
        <DayTimeline t={t} day={day} isToday={isToday} canTick={canTickDay} tickProps={tickProps} />
      ) : (
        <div className="space-y-0.5 px-2 pb-2">
          {tasks.map((task) => (
            <Tick
              key={task.taskKey}
              title={task.title}
              detail={task.detail}
              time={task.time}
              highlightTime={task.taskKey === "daily:exercise"}
              {...tickProps(task.taskKey, day, !canTickDay)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3. Months
// ---------------------------------------------------------------------------
function MonthCard({
  t, month, label, checks, tickProps, metrics, today,
}: { t: PlanTemplate; month: MonthPlan; label: string; checks: Set<string>; tickProps: TickProps; metrics: MetricView[]; today: ISODate }) {
  const c = monthCount(t, checks, month);
  const stats = monthStats(t, month, metrics, checks, today);
  const rows: { label: string; unit: string; decimals: number; stat: Target }[] = [
    { label: "Weight", unit: " kg", decimals: 1, stat: stats.weight },
    { label: "Long run", unit: " km", decimals: 0, stat: stats.longRun },
    { label: "Books finished", unit: "", decimals: 0, stat: stats.books },
  ];
  return (
    <Card className="space-y-3 p-3">
      <div className="flex items-start justify-between gap-3 px-1">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-subtle">{label}</div>
          <h3 className="text-base font-semibold">{month.name} · {month.focus}</h3>
        </div>
        <Badge tone={c.total > 0 && c.done === c.total ? "good" : "neutral"}>{c.done}/{c.total}</Badge>
      </div>
      <dl className="grid grid-cols-1 gap-1.5 sm:grid-cols-2" aria-label={`${month.name} numbers`}>
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2">
            <dt className="text-sm text-muted">{r.label}</dt>
            <dd className="text-sm tabular">
              <span className="font-bold">{r.stat.actual === null ? "–" : formatNumber(r.stat.actual, r.decimals)}</span>
              <span className="text-subtle"> / {r.stat.target === null ? "?" : formatNumber(r.stat.target, r.decimals)}{r.unit}</span>
            </dd>
          </div>
        ))}
      </dl>
      {stats.habits.length > 0 && (
        <details className="group px-1">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between text-sm font-semibold text-primary">
            Daily habits this month <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="space-y-1 pb-1 pt-1 text-sm">
            {stats.habits.map((h) => (
              <li key={h.label} className="space-y-0.5">
                <div className="flex justify-between"><span className="text-muted">{h.label}</span><span className="font-semibold tabular">{h.done}/{h.total}</span></div>
                <ProgressBar value={h.total === 0 ? 0 : (h.done / h.total) * 100} label={h.label} />
              </li>
            ))}
          </ul>
        </details>
      )}
      {month.results.length > 0 && (
        <div className="space-y-0.5">
          <div className="px-3 text-xs font-semibold uppercase tracking-wide text-subtle">Key results</div>
          {month.results.map((r) => (
            <Tick key={r.id} title={r.text} {...tickProps(`mres:${month.key}:${r.id}`, "once")} />
          ))}
        </div>
      )}
    </Card>
  );
}

function AllMonths({ t, skip, checks, tickProps, metrics, today }: { t: PlanTemplate; skip: (string | undefined)[]; checks: Set<string>; tickProps: TickProps; metrics: MetricView[]; today: ISODate }) {
  const rest = t.months.filter((m) => !skip.includes(m.key));
  if (rest.length === 0) return null;
  return (
    <details className="group rounded-2xl border border-border bg-surface">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-primary">
        Show the other months <ChevronDown className="size-5 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-3 border-t border-border p-3">
        {rest.map((m) => <MonthCard key={m.key} t={t} month={m} label="Month" checks={checks} tickProps={tickProps} metrics={metrics} today={today} />)}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// 4. Weeks
// ---------------------------------------------------------------------------
function WeekCard({
  t, n, today, open, checks, tickProps, metrics, onMetrics,
}: { t: PlanTemplate; n: number; today: ISODate; open: boolean; checks: Set<string>; tickProps: TickProps; metrics: MetricView[]; onMetrics: (m: MetricView[]) => void }) {
  const wp = weekPlan(t, n)!;
  const { start, end } = weekRange(t, n);
  const c = weekCount(t, checks, n);
  const started = compareDates(start, today) <= 0;
  const isNow = weekOf(t, today) === n;
  return (
    <details open={open} className={cn("group rounded-2xl border bg-surface", isNow ? "border-primary" : "border-border")}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="font-semibold">Week {n}</span>
            <span className="text-sm text-muted">{formatDateShort(start)} – {formatDateShort(end)}</span>
            {isNow && <Badge tone="info">Now</Badge>}
          </div>
          <div className="truncate text-sm text-muted">{wp.longRun}</div>
        </div>
        <div className="text-sm font-bold tabular text-muted">{c.done}/{c.total}</div>
        <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-3 border-t border-border px-2 py-3">
        <div>
          <h4 className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-subtle">This week</h4>
          {wp.tasks.map((task) => (
            <Tick key={task.id} title={task.text} {...tickProps(`wtask:${task.id}`, `W${n}`)} />
          ))}
        </div>
        <div>
          <h4 className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-subtle">Every week{!started && " (starts " + formatDateShort(start) + ")"}</h4>
          {t.weeklyGoals.map((g) => (
            <Tick key={g.key} title={g.area} detail={g.target} {...tickProps(`weekly:${g.key}`, `W${n}`, !started)} />
          ))}
        </div>
        <DayChips t={t} n={n} checks={checks} />
        {started && <NumbersForm n={n} metrics={metrics} onMetrics={onMetrics} />}
      </div>
    </details>
  );
}

function DayChips({ t, n, checks }: { t: PlanTemplate; n: number; checks: Set<string> }) {
  const { start } = weekRange(t, n);
  return (
    <div className="px-3">
      <h4 className="pb-1 text-xs font-semibold uppercase tracking-wide text-subtle">Daily tasks done</h4>
      <div className="grid grid-cols-7 gap-1 text-center">
        {Array.from({ length: 7 }, (_, i) => {
          const d = addDays(start, i);
          const c = dayCount(t, checks, d);
          const full = c.total > 0 && c.done === c.total;
          return (
            <div key={d} className={cn("rounded-lg py-1.5 text-xs", full ? "bg-primary/15 font-bold text-primary" : "bg-surface-2 text-muted")}>
              <div>{WEEKDAY_LONG[i]!.slice(0, 3)}</div>
              <div className="tabular">{c.done}/{c.total}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The Sunday review: log the numbers for the week. */
function NumbersForm({ n, metrics, onMetrics }: { n: number; metrics: MetricView[]; onMetrics: (m: MetricView[]) => void }) {
  const toast = useToast();
  const saved = metrics.find((m) => m.week === n);
  const str = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
  const [weight, setWeight] = React.useState(str(saved?.weightKg));
  const [run, setRun] = React.useState(str(saved?.longRunKm));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // "" → leave alone if nothing was saved, clear if something was; otherwise the number
  const field = (text: string, before: number | null | undefined): number | null | undefined | "bad" => {
    const v = text.trim().replace(",", ".");
    if (v === "") return before === null || before === undefined ? undefined : null;
    const num = Number(v);
    if (!Number.isFinite(num)) return "bad";
    return num;
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const f = { weightKg: field(weight, saved?.weightKg), longRunKm: field(run, saved?.longRunKm) };
    if (Object.values(f).includes("bad")) return setError("Please enter plain numbers.");
    setBusy(true);
    try {
      const res = await saveMetricsAction({ period: `W${n}`, ...f });
      if (!res.ok) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      const next: MetricView = {
        week: n,
        weightKg: f.weightKg === undefined ? (saved?.weightKg ?? null) : (f.weightKg as number | null),
        longRunKm: f.longRunKm === undefined ? (saved?.longRunKm ?? null) : (f.longRunKm as number | null),
      };
      onMetrics([...metrics.filter((m) => m.week !== n), next].sort((a, b) => a.week - b.week));
      toast.success(`Week ${n} numbers saved.`);
    } catch {
      setError("Couldn't reach the server. Nothing was saved.");
      toast.error("Couldn't reach the server. Nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3 rounded-xl bg-surface-2 p-3" noValidate>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-subtle">Sunday review · log the numbers</h4>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Weight (kg)" htmlFor={`w${n}-weight`}><Input id={`w${n}-weight`} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="e.g. 68.5" /></Field>
        <Field label="Long run (km)" htmlFor={`w${n}-run`}><Input id={`w${n}-run`} inputMode="decimal" value={run} onChange={(e) => setRun(e.target.value)} placeholder="e.g. 15" /></Field>
      </div>
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
      <Button type="submit" variant="secondary" loading={busy}>Save numbers</Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// 5. Weekly schedule ("blog" cards)
// ---------------------------------------------------------------------------
function ScheduleCard({ t, today }: { t: PlanTemplate; today: ISODate }) {
  const nowWd = isoWeekday(today);
  return (
    <div className="space-y-3">
      <div>
        <h2 id="schedule-h" className="text-lg font-semibold">My weekly schedule</h2>
        <p className="text-sm text-muted">Each day hour by hour: classes from the UM timetable (rooms checked against MAYA on 8 Oct 2026), study, meals and exercise at <strong>19:00</strong>. Lights out by 23:30.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {t.schedule.map((d) => {
          const isToday = d.weekday === nowWd;
          return (
            <article key={d.weekday} aria-label={WEEKDAY_LONG[d.weekday - 1]} className={cn("space-y-3 rounded-2xl border bg-surface p-4", isToday ? "border-primary" : "border-border")}>
              <header className="flex items-center justify-between">
                <h3 className="text-base font-semibold">{WEEKDAY_LONG[d.weekday - 1]}</h3>
                {isToday && <Badge tone="info">Today</Badge>}
              </header>
              <WeekdayTimeline t={t} weekday={d.weekday} />
            </article>
          );
        })}
      </div>
      <Card className="space-y-2 p-4">
        <h3 className="font-semibold">Key dates</h3>
        <ul className="space-y-1 text-sm">
          {t.keyDates.map((k) => (
            <li key={k.when} className="flex gap-3"><span className="w-24 shrink-0 font-semibold tabular">{k.when}</span><span className="text-muted">{k.what}</span></li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
