"use client";
import { useRouter } from "next/navigation";
import * as React from "react";
import { changeEndDateAction, changeRuleAction, rescheduleUpcomingAction, updateDetailsAction } from "@/app/actions/challenges";
import { draftToInput, RuleEditor, ruleToDraft } from "@/components/rule-editor";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useRunner } from "@/components/use-runner";
import { addDays, daysInclusive, formatDateLong } from "@/lib/core/dates";
import { CATEGORIES, type Category, type Frequency, type TargetRule } from "@/lib/core/types";
import { CATEGORY_EMOJI, CATEGORY_LABEL } from "@/lib/ui-helpers";
import { cn } from "@/lib/utils";
import { COLORS } from "@/lib/validation/colors";
import type { ChallengeView } from "@/lib/services/types";

function useSection() {
  const { exec, pending } = useRunner();
  const [error, setError] = React.useState<{ message: string; fields: Record<string, string> } | null>(null);
  return {
    pending, error,
    async save<T,>(fn: () => Promise<import("@/app/actions/util").ActionResult<T>>, success: string) {
      setError(null);
      const res = await exec(fn, { silentError: true, success });
      if (res && !res.ok) setError({ message: res.error, fields: res.fieldErrors ?? {} });
    },
  };
}

const ErrorLine = ({ e }: { e: { message: string } | null }) => (e ? <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{e.message}</p> : null);

export function EditChallenge({ challenge: c, rule, today, started, hasLogs }: { challenge: ChallengeView; rule: TargetRule | null; today: string; started: boolean; hasLogs: boolean }) {
  const router = useRouter();
  void router;
  return (
    <div className="space-y-5">
      <DetailsSection c={c} />
      <TargetSection c={c} rule={rule} today={today} started={started} />
      <LengthSection c={c} today={today} started={started} hasLogs={hasLogs} />
    </div>
  );
}

function DetailsSection({ c }: { c: ChallengeView }) {
  const s = useSection();
  const [title, setTitle] = React.useState(c.title);
  const [description, setDescription] = React.useState(c.description ?? "");
  const [category, setCategory] = React.useState<Category>(c.category);
  const [color, setColor] = React.useState<(typeof COLORS)[number]>(c.color as (typeof COLORS)[number]);
  return (
    <Card className="space-y-4">
      <CardTitle>Details</CardTitle>
      <Field label="Name" htmlFor="ed-title" error={s.error?.fields.title}><Input id="ed-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Description" htmlFor="ed-desc"><Textarea id="ed-desc" value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" htmlFor="ed-cat">
          <Select id="ed-cat" value={category} onChange={(e) => setCategory(e.target.value as Category)}>{CATEGORIES.map((x) => <option key={x} value={x}>{CATEGORY_EMOJI[x]} {CATEGORY_LABEL[x]}</option>)}</Select>
        </Field>
        <div className="space-y-1.5">
          <span className="block text-sm font-medium" id="ed-color-l">Colour</span>
          <div role="radiogroup" aria-labelledby="ed-color-l" className="flex min-h-11 flex-wrap items-center gap-2">
            {COLORS.map((x) => <button key={x} type="button" role="radio" aria-checked={color === x} aria-label={x} data-accent={x} onClick={() => setColor(x)} className={cn("size-7 rounded-full bg-accent ring-offset-2 ring-offset-surface", color === x && "ring-2 ring-foreground")} />)}
          </div>
        </div>
      </div>
      <ErrorLine e={s.error} />
      <Button loading={s.pending} onClick={() => s.save(() => updateDetailsAction(c.id, { title, description: description || null, category, color }), "Details saved.")}>Save details</Button>
    </Card>
  );
}

function TargetSection({ c, rule, today, started }: { c: ChallengeView; rule: TargetRule | null; today: string; started: boolean }) {
  const s = useSection();
  const [draft, setDraft] = React.useState(() => ruleToDraft(rule));
  const [from, setFrom] = React.useState(today);
  const isTotal = rule?.frequency === "total";
  const allowed: Frequency[] | undefined = !started ? undefined : isTotal ? ["total"] : ["daily", "weekly_days", "weekly_flexible"];
  return (
    <Card className="space-y-4">
      <CardTitle>Targets</CardTitle>
      <p className="text-sm text-muted">
        {started ? "Sessions before the change date keep the targets they had, and anything you've already logged is untouched. Sessions you edited by hand are left alone." : "This challenge hasn't started, so the whole plan will be regenerated."}
      </p>
      <RuleEditor draft={draft} onChange={setDraft} tracking={c.trackingMethod} unit={c.unit ?? ""} errors={s.error?.fields} idPrefix="ed-rule" allowed={allowed} />
      {started && !isTotal && (
        <Field label="Apply from" htmlFor="ed-from" error={s.error?.fields.effectiveFrom} hint="Weekly goals always start on a Monday – we'll move the date forward if needed.">
          <Input id="ed-from" type="date" min={today} max={c.endDate} value={from} onChange={(e) => setFrom(e.target.value || today)} />
        </Field>
      )}
      <ErrorLine e={s.error} />
      <Button loading={s.pending} onClick={() => s.save(() => changeRuleAction(c.id, { rule: draftToInput(draft), effectiveFrom: started && !isTotal ? from : undefined }), "Targets updated.")}>Update targets</Button>
    </Card>
  );
}

function LengthSection({ c, today, started, hasLogs }: { c: ChallengeView; today: string; started: boolean; hasLogs: boolean }) {
  const s = useSection();
  const [start, setStart] = React.useState(c.startDate);
  const [end, setEnd] = React.useState(c.endDate);
  void hasLogs;
  return (
    <Card className="space-y-4">
      <CardTitle>Dates &amp; length</CardTitle>
      <p className="text-sm text-muted">
        Currently {formatDateLong(c.startDate)} → {formatDateLong(c.endDate)} ({daysInclusive(c.startDate, c.endDate)} days).
        {started ? " Lengthening adds sessions to the end; shortening removes unlogged sessions past the new end date. Logged activity is never deleted." : ""}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date" htmlFor="ed-start" error={s.error?.fields.startDate}>
          <Input id="ed-start" type="date" value={start} min={today} disabled={started} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="End date" htmlFor="ed-end" error={s.error?.fields.endDate}>
          <Input id="ed-end" type="date" value={end} min={started ? c.startDate : start} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        {[7, 14, 30].map((n) => <button key={n} type="button" onClick={() => setEnd(addDays(end, n))} className="min-h-9 rounded-full bg-surface-2 px-3 text-sm font-medium">+{n} days</button>)}
      </div>
      <ErrorLine e={s.error} />
      <Button
        loading={s.pending}
        disabled={end === c.endDate && start === c.startDate}
        onClick={() => s.save(() => (started ? changeEndDateAction(c.id, end) : rescheduleUpcomingAction(c.id, { startDate: start, endDate: end })), "Dates updated.")}
      >
        Update dates
      </Button>
    </Card>
  );
}
