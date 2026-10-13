"use client";
import * as React from "react";
import { Field, Input, Segmented } from "@/components/ui/field";
import { WEEKDAY_SHORT } from "@/lib/core/format";
import type { Frequency, TargetRule } from "@/lib/core/types";
import type { RuleInput } from "@/lib/validation";
import { cn } from "@/lib/utils";

export interface RuleDraft {
  frequency: Frequency;
  weekdays: number[];
  sessionTarget: string;
  weeklyTarget: string;
  perDay: boolean;
  weekdayTargets: Record<string, string>;
  totalTarget: string;
}

export const emptyDraft = (): RuleDraft => ({
  frequency: "daily", weekdays: [1, 3, 5], sessionTarget: "", weeklyTarget: "", perDay: false, weekdayTargets: {}, totalTarget: "",
});

export function ruleToDraft(r: Omit<TargetRule, "effectiveFrom"> | null): RuleDraft {
  if (!r) return emptyDraft();
  const s = (n: number | null) => (n === null ? "" : String(n));
  return {
    frequency: r.frequency,
    weekdays: r.weekdays.length ? r.weekdays : [1, 3, 5],
    sessionTarget: s(r.sessionTarget),
    weeklyTarget: s(r.weeklyTarget),
    perDay: !!r.weekdayTargets,
    weekdayTargets: r.weekdayTargets ? Object.fromEntries(Object.entries(r.weekdayTargets).map(([k, v]) => [k, String(v)])) : {},
    totalTarget: s(r.totalTarget),
  };
}

const num = (v: string): number | null => {
  const n = Number.parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export function draftToInput(d: RuleDraft): RuleInput {
  const base: RuleInput = { frequency: d.frequency, weekdays: [], sessionTarget: null, weeklyTarget: null, weekdayTargets: null, totalTarget: null };
  switch (d.frequency) {
    case "daily": return { ...base, sessionTarget: num(d.sessionTarget) };
    case "weekly_days": {
      const weekdays = [...d.weekdays].sort();
      if (d.perDay) {
        const targets: Record<string, number> = {};
        for (const w of weekdays) { const v = num(d.weekdayTargets[String(w)] ?? ""); if (v !== null) targets[String(w)] = v; }
        return { ...base, weekdays, weekdayTargets: targets };
      }
      return { ...base, weekdays, weeklyTarget: num(d.weeklyTarget) };
    }
    case "weekly_flexible": return { ...base, weeklyTarget: num(d.weeklyTarget) };
    case "total": return { ...base, totalTarget: num(d.totalTarget) };
  }
}

const FREQ_OPTIONS: { value: Frequency; label: string; description: string }[] = [
  { value: "daily", label: "Every day", description: "Same target daily" },
  { value: "weekly_days", label: "Chosen days", description: "e.g. Mon · Wed · Sat" },
  { value: "weekly_flexible", label: "Weekly goal", description: "Any days you like" },
  { value: "total", label: "Overall goal", description: "No fixed schedule" },
];

export function RuleEditor({
  draft, onChange, tracking, unit, errors, idPrefix = "rule", allowed,
}: {
  draft: RuleDraft; onChange: (d: RuleDraft) => void; tracking: "completion" | "quantity"; unit: string; errors?: Record<string, string>; idPrefix?: string; allowed?: Frequency[];
}) {
  const set = (patch: Partial<RuleDraft>) => onChange({ ...draft, ...patch });
  const isQty = tracking === "quantity";
  const u = isQty && unit ? ` (${unit})` : "";
  const err = errors?.rule;

  return (
    <div className="space-y-4">
      <Segmented
        label="How often"
        value={draft.frequency}
        onChange={(frequency) => set({ frequency })}
        options={allowed ? FREQ_OPTIONS.filter((o) => allowed.includes(o.value)) : FREQ_OPTIONS}
        className={allowed && allowed.length === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-4"}
      />

      {draft.frequency === "daily" && isQty && (
        <Field label={`Target per day${u}`} htmlFor={`${idPrefix}-session`} error={err}>
          <Input id={`${idPrefix}-session`} inputMode="decimal" value={draft.sessionTarget} onChange={(e) => set({ sessionTarget: e.target.value })} placeholder="e.g. 5" />
        </Field>
      )}
      {draft.frequency === "daily" && !isQty && <p className="text-sm text-muted">One tick per day. Each day counts when you mark it done.</p>}

      {draft.frequency === "weekly_days" && (
        <div className="space-y-3">
          <div>
            <div className="mb-1.5 text-sm font-medium" id={`${idPrefix}-days-label`}>Which days?</div>
            <div role="group" aria-labelledby={`${idPrefix}-days-label`} className="grid grid-cols-7 gap-1.5">
              {WEEKDAY_SHORT.map((label, i) => {
                const day = i + 1;
                const on = draft.weekdays.includes(day);
                return (
                  <button
                    key={day} type="button" aria-pressed={on}
                    onClick={() => set({ weekdays: on ? draft.weekdays.filter((d) => d !== day) : [...draft.weekdays, day] })}
                    className={cn("min-h-11 rounded-xl border text-xs font-semibold sm:text-sm", on ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface text-muted")}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          {isQty ? (
            <>
              <Segmented
                label="Target style" value={draft.perDay ? "each" : "split"} onChange={(v) => set({ perDay: v === "each" })}
                options={[{ value: "split", label: "Weekly total", description: "Split evenly" }, { value: "each", label: "Per day", description: "Set each day" }]}
              />
              {!draft.perDay ? (
                <Field label={`Weekly total${u}`} htmlFor={`${idPrefix}-weekly`} error={err} hint={draft.weekdays.length ? `Split across ${draft.weekdays.length} days.` : undefined}>
                  <Input id={`${idPrefix}-weekly`} inputMode="decimal" value={draft.weeklyTarget} onChange={(e) => set({ weeklyTarget: e.target.value })} placeholder="e.g. 24" />
                </Field>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[...draft.weekdays].sort().map((day) => (
                    <Field key={day} label={`${WEEKDAY_SHORT[day - 1]}${u}`} htmlFor={`${idPrefix}-d${day}`} error={undefined}>
                      <Input id={`${idPrefix}-d${day}`} inputMode="decimal" value={draft.weekdayTargets[String(day)] ?? ""} onChange={(e) => set({ weekdayTargets: { ...draft.weekdayTargets, [String(day)]: e.target.value } })} />
                    </Field>
                  ))}
                  {err && <p role="alert" className="col-span-full text-xs font-medium text-danger">{err}</p>}
                </div>
              )}
            </>
          ) : (
            err && <p role="alert" className="text-xs font-medium text-danger">{err}</p>
          )}
        </div>
      )}

      {draft.frequency === "weekly_flexible" && (
        <Field label={isQty ? `Target per week${u}` : "Times per week"} htmlFor={`${idPrefix}-weekly`} error={err} hint="Do it on whichever days suit you. The week runs Monday to Sunday.">
          <Input id={`${idPrefix}-weekly`} inputMode="decimal" value={draft.weeklyTarget} onChange={(e) => set({ weeklyTarget: e.target.value })} placeholder={isQty ? "e.g. 30" : "e.g. 3"} />
        </Field>
      )}

      {draft.frequency === "total" && (
        <Field label={isQty ? `Overall target${u}` : "Times in total"} htmlFor={`${idPrefix}-total`} error={err} hint="Reach it by the end date at your own pace – we'll show whether you're ahead or behind.">
          <Input id={`${idPrefix}-total`} inputMode="decimal" value={draft.totalTarget} onChange={(e) => set({ totalTarget: e.target.value })} placeholder={isQty ? "e.g. 100" : "e.g. 20"} />
        </Field>
      )}
    </div>
  );
}
