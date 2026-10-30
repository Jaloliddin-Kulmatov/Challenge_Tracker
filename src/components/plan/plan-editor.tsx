"use client";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { resetPlanContentAction, savePlanContentAction } from "@/app/actions/plan";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { WEEKDAY_LONG, WEEKDAY_SHORT } from "@/lib/core/format";
import { newId } from "@/lib/plan/content";
import { fromMin, parseRange, TIME_RE, toMin } from "@/lib/plan/timeline";
import { BLOCK_KINDS, type DailyTask, type MonthPlan, type PlanContent, type PlanTemplate, type TimelineBlock, type WeekPlan } from "@/lib/plan/types";
import { cn } from "@/lib/utils";

interface Props {
  templateKey: string;
  title: string;
  initial: PlanContent;
  /** The fixed university timetable, shown for context in the timeline editor. */
  schedule: PlanTemplate["schedule"];
  edited: boolean;
}

export function PlanEditor({ templateKey, title, initial, schedule, edited }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = React.useState<PlanContent>(initial);
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState<"save" | "reset" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const update = (fn: (d: PlanContent) => PlanContent) => {
    setDraft((d) => fn(d));
    setDirty(true);
  };

  async function save() {
    setError(null);
    setBusy("save");
    try {
      const content = { ...draft, timeline: draft.timeline.map((d) => ({ ...d, blocks: [...d.blocks].sort((a, b) => a.start.localeCompare(b.start)) })) };
      const res = await savePlanContentAction({ templateKey, content });
      if (!res.ok) {
        const msg = res.unauthenticated ? "Your session has expired. Please log in again." : res.error;
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success("Plan saved.");
      setDirty(false);
      router.push("/plan");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Nothing was saved.");
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    if (!window.confirm("Go back to the original plan? Your edits are removed; your ticks and numbers stay.")) return;
    setBusy("reset");
    try {
      const res = await resetPlanContentAction(templateKey);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Back to the original plan.");
      router.push("/plan");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Nothing was changed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 pb-40 md:pb-28">
      <header className="space-y-1">
        <Link href="/plan" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-primary"><ArrowLeft className="size-4" aria-hidden /> Back to my plan</Link>
        <h1 className="text-2xl font-bold tracking-tight">Edit plan</h1>
        <p className="text-sm text-muted">
          Change anything in “{title}”: rename, add or remove tasks, move targets. Ticks you already made stay with their task. The months and weeks themselves are fixed by the dates.
        </p>
      </header>

      <Section title="Overall goals" count={draft.goals.length} open>
        {draft.goals.map((g, i) => (
          <Row key={g.key} label={`Goal ${i + 1}`} onRemove={() => update((d) => ({ ...d, goals: d.goals.filter((x) => x.key !== g.key) }))}>
            <Input aria-label={`Goal ${i + 1} name`} value={g.area} maxLength={60} onChange={(e) => update((d) => ({ ...d, goals: d.goals.map((x) => (x.key === g.key ? { ...x, area: e.target.value } : x)) }))} placeholder="Area, e.g. Grades" />
            <Input aria-label={`Goal ${i + 1} target`} value={g.target} maxLength={200} onChange={(e) => update((d) => ({ ...d, goals: d.goals.map((x) => (x.key === g.key ? { ...x, target: e.target.value } : x)) }))} placeholder="What done looks like" />
          </Row>
        ))}
        <AddButton onClick={() => update((d) => ({ ...d, goals: [...d.goals, { key: newId("g"), area: "", target: "" }] }))}>Add a goal</AddButton>
      </Section>

      <Section title="Daily tasks" count={draft.dailyTasks.length} open>
        {draft.dailyTasks.map((task, i) => (
          <DailyRow
            key={task.key}
            index={i}
            task={task}
            onChange={(patch) => update((d) => ({ ...d, dailyTasks: d.dailyTasks.map((x) => (x.key === task.key ? { ...x, ...patch } : x)) }))}
            onRemove={() => update((d) => ({ ...d, dailyTasks: d.dailyTasks.filter((x) => x.key !== task.key) }))}
          />
        ))}
        <AddButton onClick={() => update((d) => ({ ...d, dailyTasks: [...d.dailyTasks, { key: newId("t"), title: "", weekdays: [1, 2, 3, 4, 5, 6, 7] }] }))}>Add a daily task</AddButton>
      </Section>

      <Section title="Weekly goals" count={draft.weeklyGoals.length}>
        {draft.weeklyGoals.map((g, i) => (
          <Row key={g.key} label={`Weekly goal ${i + 1}`} onRemove={() => update((d) => ({ ...d, weeklyGoals: d.weeklyGoals.filter((x) => x.key !== g.key) }))}>
            <Input aria-label={`Weekly goal ${i + 1} name`} value={g.area} maxLength={60} onChange={(e) => update((d) => ({ ...d, weeklyGoals: d.weeklyGoals.map((x) => (x.key === g.key ? { ...x, area: e.target.value } : x)) }))} placeholder="Area, e.g. YouTube" />
            <Input aria-label={`Weekly goal ${i + 1} target`} value={g.target} maxLength={200} onChange={(e) => update((d) => ({ ...d, weeklyGoals: d.weeklyGoals.map((x) => (x.key === g.key ? { ...x, target: e.target.value } : x)) }))} placeholder="e.g. 1 video" />
          </Row>
        ))}
        <AddButton onClick={() => update((d) => ({ ...d, weeklyGoals: [...d.weeklyGoals, { key: newId("w"), area: "", target: "" }] }))}>Add a weekly goal</AddButton>
      </Section>

      <Section title="Books to finish" count={draft.books.length}>
        {draft.books.map((b, i) => (
          <Row key={b.id} label={`Book ${i + 1}`} onRemove={() => update((d) => ({ ...d, books: d.books.filter((x) => x.id !== b.id) }))}>
            <Input aria-label={`Book ${i + 1} title`} value={b.title} maxLength={120} onChange={(e) => update((d) => ({ ...d, books: d.books.map((x) => (x.id === b.id ? { ...x, title: e.target.value } : x)) }))} placeholder="Title" />
          </Row>
        ))}
        <AddButton onClick={() => update((d) => ({ ...d, books: [...d.books, { id: newId("b"), title: "" }] }))}>Add a book</AddButton>
      </Section>

      <Section title="Daily timeline" count={draft.timeline.reduce((n, d) => n + d.blocks.length, 0)}>
        <p className="text-sm text-muted">The hour-by-hour plan of each weekday. Classes come from your timetable and can't be changed here; link a block to a daily task to tick it from the timeline.</p>
        {[1, 2, 3, 4, 5, 6, 7].map((wd) => (
          <DayEditor
            key={wd}
            weekday={wd}
            blocks={draft.timeline.find((d) => d.weekday === wd)?.blocks ?? []}
            tasks={draft.dailyTasks.filter((d) => d.weekdays.includes(wd))}
            classes={schedule.find((d) => d.weekday === wd)?.classes ?? []}
            onChange={(blocks) =>
              update((d) => ({ ...d, timeline: [...d.timeline.filter((x) => x.weekday !== wd), { weekday: wd, blocks }].sort((a, b) => a.weekday - b.weekday) }))
            }
          />
        ))}
      </Section>

      <Section title="Monthly targets" count={draft.months.length}>
        {draft.months.map((m) => (
          <MonthEditor key={m.key} month={m} onChange={(patch) => update((d) => ({ ...d, months: d.months.map((x) => (x.key === m.key ? { ...x, ...patch } : x)) }))} />
        ))}
      </Section>

      <Section title="Week by week" count={draft.weeks.length}>
        {draft.weeks.map((w) => (
          <WeekEditor key={w.n} week={w} onChange={(patch) => update((d) => ({ ...d, weeks: d.weeks.map((x) => (x.n === w.n ? { ...x, ...patch } : x)) }))} />
        ))}
      </Section>

      {edited && (
        <Button variant="outline" loading={busy === "reset"} onClick={reset}>Reset everything to the original plan</Button>
      )}

      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:bottom-0">
        <div className="mx-auto max-w-3xl space-y-2">
          {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
          <div className="flex gap-3">
            <Button className="flex-1" loading={busy === "save"} disabled={!dirty} onClick={save}>Save changes</Button>
            <Button variant="secondary" onClick={() => router.push("/plan")}>{dirty ? "Discard" : "Close"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, count, open, children }: { title: string; count: number; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group rounded-2xl border border-border bg-surface">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-4 py-3">
        <h2 className="text-base font-semibold">{title} <span className="text-sm font-normal text-muted">· {count}</span></h2>
        <span className="text-sm font-semibold text-primary group-open:hidden">Edit</span>
      </summary>
      <div className="space-y-3 border-t border-border p-3">{children}</div>
    </details>
  );
}

function Row({ label, onRemove, children }: { label: string; onRemove: () => void; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1 space-y-2">{children}</div>
      <Button variant="ghost" size="icon" aria-label={`Remove ${label}`} onClick={onRemove}><Trash2 className="size-5 text-danger" /></Button>
    </div>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <Button variant="secondary" size="sm" onClick={onClick}><Plus className="size-4" aria-hidden /> {children}</Button>;
}

function DailyRow({ task, index, onChange, onRemove }: { task: DailyTask; index: number; onChange: (p: Partial<DailyTask>) => void; onRemove: () => void }) {
  const toggleDay = (d: number) => {
    const has = task.weekdays.includes(d);
    onChange({ weekdays: has ? task.weekdays.filter((x) => x !== d) : [...task.weekdays, d].sort((a, b) => a - b) });
  };
  return (
    <Card className="space-y-2 p-3">
      <Row label={`Daily task ${index + 1}`} onRemove={onRemove}>
        <Input aria-label={`Daily task ${index + 1} title`} value={task.title} maxLength={120} onChange={(e) => onChange({ title: e.target.value })} placeholder="What to do each day" />
      </Row>
      <div role="group" aria-label={`Days for daily task ${index + 1}`} className="flex flex-wrap gap-1.5">
        {WEEKDAY_SHORT.map((label, i) => {
          const on = task.weekdays.includes(i + 1);
          return (
            <button
              key={label}
              type="button"
              aria-pressed={on}
              onClick={() => toggleDay(i + 1)}
              className={cn("min-h-10 min-w-11 rounded-full px-3 text-sm font-semibold", on ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted")}
            >
              {label}
            </button>
          );
        })}
      </div>
      <label className="flex items-center gap-2 text-sm text-muted">
        Time (optional)
        <Input
          aria-label={`Daily task ${index + 1} time`}
          type="time"
          className="w-32"
          value={task.time ?? ""}
          onChange={(e) => onChange({ time: e.target.value || undefined })}
        />
      </label>
    </Card>
  );
}

/** A number box that keeps what you type; reports a number, or null when empty. */
function NumInput({ label, value, onChange, decimals = false, placeholder }: { label: string; value: number | null; onChange: (v: number | null) => void; decimals?: boolean; placeholder?: string }) {
  const [text, setText] = React.useState(value === null ? "" : String(value));
  return (
    <label className="block space-y-1 text-xs font-medium text-muted">
      {label}
      <Input
        inputMode={decimals ? "decimal" : "numeric"}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          const v = e.target.value.trim().replace(",", ".");
          onChange(v === "" ? null : Number(v));
        }}
      />
    </label>
  );
}

function MonthEditor({ month, onChange }: { month: MonthPlan; onChange: (p: Partial<MonthPlan>) => void }) {
  return (
    <details className="group rounded-xl border border-border">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-3 py-2">
        <span className="font-semibold">{month.name}</span>
        <span className="text-sm text-muted">{month.focus}</span>
      </summary>
      <div className="space-y-3 border-t border-border p-3">
        <label className="block space-y-1 text-xs font-medium text-muted">
          Focus
          <Input aria-label={`${month.name} focus`} value={month.focus} maxLength={60} onChange={(e) => onChange({ focus: e.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <NumInput label="Long run (km)" decimals value={month.longRunKm} onChange={(v) => onChange({ longRunKm: v ?? Number.NaN })} />
          <NumInput label="Books finished by month end" value={month.books} onChange={(v) => onChange({ books: v ?? Number.NaN })} />
          <NumInput label="Weight (kg), blank = automatic" decimals value={month.weightKg} placeholder="auto" onChange={(v) => onChange({ weightKg: v })} />
        </div>
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-subtle">Key results</div>
          {month.results.map((r, i) => (
            <Row key={r.id} label={`${month.name} result ${i + 1}`} onRemove={() => onChange({ results: month.results.filter((x) => x.id !== r.id) })}>
              <Input aria-label={`${month.name} result ${i + 1}`} value={r.text} maxLength={120} onChange={(e) => onChange({ results: month.results.map((x) => (x.id === r.id ? { ...x, text: e.target.value } : x)) })} />
            </Row>
          ))}
          <AddButton onClick={() => onChange({ results: [...month.results, { id: newId("r"), text: "" }] })}>Add a result</AddButton>
        </div>
      </div>
    </details>
  );
}

function WeekEditor({ week, onChange }: { week: WeekPlan; onChange: (p: Partial<WeekPlan>) => void }) {
  return (
    <details className="group rounded-xl border border-border">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-3 py-2">
        <span className="font-semibold">Week {week.n}</span>
        <span className="text-sm text-muted">{week.tasks.length} tasks</span>
      </summary>
      <div className="space-y-3 border-t border-border p-3">
        <label className="block space-y-1 text-xs font-medium text-muted">
          Running note (shown for the Thursday long run)
          <Input aria-label={`Week ${week.n} running note`} value={week.longRun} maxLength={60} onChange={(e) => onChange({ longRun: e.target.value })} placeholder="e.g. long run 15 km" />
        </label>
        {week.tasks.map((task, i) => (
          <Row key={task.id} label={`week ${week.n} task ${i + 1}`} onRemove={() => onChange({ tasks: week.tasks.filter((x) => x.id !== task.id) })}>
            <Input aria-label={`Week ${week.n} task ${i + 1}`} value={task.text} maxLength={160} onChange={(e) => onChange({ tasks: week.tasks.map((x) => (x.id === task.id ? { ...x, text: e.target.value } : x)) })} />
          </Row>
        ))}
        <AddButton onClick={() => onChange({ tasks: [...week.tasks, { id: `w${week.n}t${Date.now()}`, text: "" }] })}>Add a task</AddButton>
      </div>
    </details>
  );
}

function DayEditor({
  weekday, blocks, tasks, classes, onChange,
}: { weekday: number; blocks: TimelineBlock[]; tasks: DailyTask[]; classes: PlanTemplate["schedule"][number]["classes"]; onChange: (b: TimelineBlock[]) => void }) {
  const name = WEEKDAY_LONG[weekday - 1]!;
  const patch = (id: string, p: Partial<TimelineBlock>) => onChange(blocks.map((b) => (b.id === id ? { ...b, ...p } : b)));
  return (
    <details className="group rounded-xl border border-border">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-3 py-2">
        <span className="font-semibold">{name}</span>
        <span className="text-sm text-muted">{blocks.length} blocks · {classes.length} classes</span>
      </summary>
      <div className="space-y-3 border-t border-border p-3">
        {classes.length > 0 && (
          <ul className="space-y-0.5 rounded-lg bg-surface-2 p-2 text-sm">
            {classes.map((c) => <li key={c.time + c.code}><span className="tabular font-semibold">{c.time}</span> · {c.code} {c.type} <span className="text-muted">(fixed)</span></li>)}
          </ul>
        )}
        {blocks.map((b, i) => (
          <Card key={b.id} className="space-y-2 p-3">
            <Row label={`${name} block ${i + 1}`} onRemove={() => onChange(blocks.filter((x) => x.id !== b.id))}>
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1 text-xs font-medium text-muted">
                  Start
                  <Input aria-label={`${name} block ${i + 1} start`} value={b.start} maxLength={5} inputMode="numeric" placeholder="19:00" onChange={(e) => patch(b.id, { start: e.target.value })} />
                </label>
                <label className="block space-y-1 text-xs font-medium text-muted">
                  End
                  <Input aria-label={`${name} block ${i + 1} end`} value={b.end} maxLength={5} inputMode="numeric" placeholder="20:00" onChange={(e) => patch(b.id, { end: e.target.value })} />
                </label>
              </div>
              <Select aria-label={`${name} block ${i + 1} task`} value={b.taskKey ?? ""} onChange={(e) => patch(b.id, { taskKey: e.target.value || undefined })}>
                <option value="">Not a task (own title)</option>
                {tasks.map((t) => <option key={t.key} value={t.key}>Task: {t.title}</option>)}
              </Select>
              {!b.taskKey && (
                <Input aria-label={`${name} block ${i + 1} title`} value={b.title} maxLength={80} placeholder="What is this block?" onChange={(e) => patch(b.id, { title: e.target.value })} />
              )}
              <Select aria-label={`${name} block ${i + 1} kind`} value={b.kind} onChange={(e) => patch(b.id, { kind: e.target.value as TimelineBlock["kind"] })}>
                {BLOCK_KINDS.map((k) => <option key={k} value={k}>{k[0]!.toUpperCase() + k.slice(1)}</option>)}
              </Select>
            </Row>
          </Card>
        ))}
        <AddButton
          onClick={() => {
            // a half-hour block right after the last one (or after the last class when the day has no blocks)
            const lastEnd = Math.max(0, ...blocks.map((x) => (TIME_RE.test(x.end) ? toMin(x.end) : 0)), ...classes.map((c) => toMin(parseRange(c.time)[1])));
            const start = Math.min(lastEnd, 23 * 60 + 30);
            onChange([...blocks, { id: newId("b"), start: fromMin(start), end: start + 30 >= 1440 ? "24:00" : fromMin(start + 30), kind: "rest", title: "" }]);
          }}
        >
          Add a block
        </AddButton>
      </div>
    </details>
  );
}
