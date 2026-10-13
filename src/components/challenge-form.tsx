"use client";
import { useRouter } from "next/navigation";
import * as React from "react";
import { createChallengeAction } from "@/app/actions/challenges";
import { draftToInput, emptyDraft, RuleEditor, ruleToDraft, type RuleDraft } from "@/components/rule-editor";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, Input, Segmented, Select, Textarea } from "@/components/ui/field";
import { useRunner } from "@/components/use-runner";
import { addDays, daysInclusive, diffDays } from "@/lib/core/dates";
import { describeRule, formatNumber } from "@/lib/core/format";
import { generateSlots, normalizeRule, validateRule } from "@/lib/core/schedule";
import { TEMPLATES, UNIT_PRESETS, type ChallengeTemplate } from "@/lib/core/presets";
import { CATEGORIES, type Category, type TrackingMethod } from "@/lib/core/types";
import { CATEGORY_EMOJI, CATEGORY_LABEL } from "@/lib/ui-helpers";
import { cn } from "@/lib/utils";
import { COLORS } from "@/lib/validation/colors";

const DURATIONS = [7, 14, 21, 30, 60, 90];

export function ChallengeForm({ today }: { today: string }) {
  const router = useRouter();
  const { exec, pending } = useRunner();
  const [templateId, setTemplateId] = React.useState<string>("custom");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [category, setCategory] = React.useState<Category>("fitness");
  const [tracking, setTracking] = React.useState<TrackingMethod>("quantity");
  const [unitChoice, setUnitChoice] = React.useState("km");
  const [customUnit, setCustomUnit] = React.useState("");
  const [decimals, setDecimals] = React.useState(1);
  const [start, setStart] = React.useState(today);
  const [days, setDays] = React.useState("30");
  const [color, setColor] = React.useState<(typeof COLORS)[number]>("emerald");
  const [draft, setDraft] = React.useState<RuleDraft>(emptyDraft());
  const [milestones, setMilestones] = React.useState<{ title: string; value: string }[]>([]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  const unit = tracking === "completion" ? "" : unitChoice === "custom" ? customUnit.trim() : unitChoice;
  const durationDays = Number.parseInt(days, 10);
  const validDuration = Number.isInteger(durationDays) && durationDays >= 1 && durationDays <= 730;
  const end = validDuration ? addDays(start, durationDays - 1) : start;
  const effectiveDecimals = tracking === "completion" ? 0 : decimals;

  function applyTemplate(t: ChallengeTemplate | null) {
    setErrors({});
    if (!t) { setTemplateId("custom"); return; }
    setTemplateId(t.id);
    setTitle(t.name);
    setDescription(t.description);
    setCategory(t.category);
    setTracking(t.trackingMethod);
    if (t.unit) {
      const preset = UNIT_PRESETS.find((p) => p.unit === t.unit);
      setUnitChoice(preset ? preset.unit : "custom");
      setCustomUnit(preset ? "" : t.unit);
    }
    setDecimals(t.valueDecimals);
    setDays(String(t.durationDays));
    setDraft(ruleToDraft({ ...t.rule }));
  }

  function onUnitChange(v: string) {
    setUnitChoice(v);
    const preset = UNIT_PRESETS.find((p) => p.unit === v);
    if (preset) setDecimals(preset.decimals);
  }

  // Live preview using exactly the same scheduling code as the server.
  const preview = React.useMemo(() => {
    if (!validDuration) return { problem: "Enter a duration between 1 and 730 days." };
    const input = draftToInput(draft);
    const rule = normalizeRule({ effectiveFrom: start, frequency: input.frequency, weekdays: input.weekdays ?? [], sessionTarget: input.sessionTarget ?? null, weeklyTarget: input.weeklyTarget ?? null, weekdayTargets: input.weekdayTargets ?? null, totalTarget: input.totalTarget ?? null }, tracking);
    const problems = validateRule(rule, effectiveDecimals, tracking);
    if (problems.length) return { problem: problems[0] };
    const slots = generateSlots([rule], start, end, effectiveDecimals);
    if (!slots.length) return { problem: "No sessions fall between the start and end dates." };
    const total = slots.reduce((n, s) => n + s.targetValue, 0);
    return { sessions: slots.filter((s) => s.kind === "session").length, weeks: slots.filter((s) => s.kind === "week").length, total, rule };
  }, [draft, start, end, validDuration, tracking, effectiveDecimals]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    const res = await exec(
      () => createChallengeAction({
        title, description: description || null, category, trackingMethod: tracking,
        unit: tracking === "quantity" ? unit : null, valueDecimals: effectiveDecimals, color,
        startDate: start, endDate: end, rule: draftToInput(draft),
        customMilestones: milestones.filter((m) => m.title.trim() && m.value).map((m) => ({ title: m.title.trim(), thresholdValue: Number.parseFloat(m.value) })),
      }),
      { silentError: true, success: "Challenge created!", onOk: (d) => router.push(`/challenges/${d.id}`) },
    );
    if (res && !res.ok) {
      setErrors(res.fieldErrors ?? {});
      setFormError(res.error);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {formError && <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">{formError}</p>}

      <section aria-labelledby="tpl-h" className="space-y-2">
        <h2 id="tpl-h" className="text-sm font-semibold text-muted">Start from a template (optional)</h2>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <button type="button" onClick={() => applyTemplate(null)} aria-pressed={templateId === "custom"} className={cn("min-h-11 shrink-0 rounded-xl border px-3.5 text-sm font-medium", templateId === "custom" ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface")}>✨ From scratch</button>
          {TEMPLATES.map((t) => (
            <button key={t.id} type="button" onClick={() => applyTemplate(t)} aria-pressed={templateId === t.id} className={cn("min-h-11 shrink-0 rounded-xl border px-3.5 text-sm font-medium", templateId === t.id ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface")}>
              {CATEGORY_EMOJI[t.category]} {t.name}
            </button>
          ))}
        </div>
      </section>

      <Card className="space-y-4">
        <CardTitle>About your challenge</CardTitle>
        <Field label="Name" htmlFor="c-title" error={errors.title}>
          <Input id="c-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Run 100 km in 30 days" aria-invalid={!!errors.title} />
        </Field>
        <Field label="Description (optional)" htmlFor="c-desc" error={errors.description}>
          <Textarea id="c-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category" htmlFor="c-cat">
            <Select id="c-cat" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_EMOJI[c]} {CATEGORY_LABEL[c]}</option>)}
            </Select>
          </Field>
          <div className="space-y-1.5">
            <span className="block text-sm font-medium" id="c-color-l">Colour</span>
            <div role="radiogroup" aria-labelledby="c-color-l" className="flex min-h-11 flex-wrap items-center gap-2">
              {COLORS.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} data-accent={c} onClick={() => setColor(c)}
                  className={cn("size-7 rounded-full bg-accent ring-offset-2 ring-offset-surface", color === c && "ring-2 ring-foreground")} />
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <CardTitle>What do you track?</CardTitle>
        <Segmented label="Tracking method" value={tracking} onChange={setTracking} options={[
          { value: "quantity", label: "A number", description: "km, pages, minutes…" },
          { value: "completion", label: "Done / not done", description: "No measurement" },
        ]} />
        {tracking === "quantity" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Unit" htmlFor="c-unit" error={errors.unit}>
              <Select id="c-unit" value={unitChoice} onChange={(e) => onUnitChange(e.target.value)}>
                {UNIT_PRESETS.map((p) => <option key={p.unit} value={p.unit}>{p.label}</option>)}
                <option value="custom">Custom…</option>
              </Select>
            </Field>
            {unitChoice === "custom" ? (
              <Field label="Custom unit" htmlFor="c-cunit" error={errors.unit}>
                <Input id="c-cunit" value={customUnit} maxLength={16} onChange={(e) => setCustomUnit(e.target.value)} placeholder="e.g. laps" />
              </Field>
            ) : (
              <Field label="Decimal places" htmlFor="c-dec">
                <Select id="c-dec" value={decimals} onChange={(e) => setDecimals(Number(e.target.value))}>
                  <option value={0}>None (whole numbers)</option><option value={1}>1 (e.g. 5.5)</option><option value={2}>2 (e.g. 5.25)</option>
                </Select>
              </Field>
            )}
            {unitChoice === "custom" && (
              <Field label="Decimal places" htmlFor="c-dec2" className="col-span-2">
                <Select id="c-dec2" value={decimals} onChange={(e) => setDecimals(Number(e.target.value))}>
                  <option value={0}>None (whole numbers)</option><option value={1}>1 (e.g. 5.5)</option><option value={2}>2 (e.g. 5.25)</option>
                </Select>
              </Field>
            )}
          </div>
        )}
      </Card>

      <Card className="space-y-4">
        <CardTitle>When?</CardTitle>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date" htmlFor="c-start" error={errors.startDate}>
            <Input id="c-start" type="date" value={start} min={addDays(today, -31)} onChange={(e) => e.target.value && setStart(e.target.value)} />
          </Field>
          <Field label="Duration (days)" htmlFor="c-days" error={errors.endDate} hint={validDuration ? `Ends ${end}` : undefined}>
            <Input id="c-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          {DURATIONS.map((d) => (
            <button key={d} type="button" onClick={() => setDays(String(d))} aria-pressed={days === String(d)} className={cn("min-h-9 rounded-full px-3 text-sm font-medium", days === String(d) ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted")}>{d} days</button>
          ))}
        </div>
        {diffDays(today, start) > 0 && <p className="text-sm text-muted">This challenge will start in {diffDays(today, start)} day(s). You can start logging from then.</p>}
      </Card>

      <Card className="space-y-4">
        <CardTitle>Your target</CardTitle>
        <RuleEditor draft={draft} onChange={setDraft} tracking={tracking} unit={unit} errors={errors} />
        <div className="rounded-xl bg-surface-2 p-3 text-sm" aria-live="polite">
          {"problem" in preview && preview.problem ? (
            <span className="text-muted">{preview.problem}</span>
          ) : "rule" in preview && preview.rule ? (
            <>
              <div className="font-semibold">{describeRule(preview.rule, unit, tracking, effectiveDecimals)}</div>
              <div className="mt-0.5 text-muted tabular">
                {preview.sessions ? `${preview.sessions} sessions` : `${preview.weeks} weeks`} · {tracking === "completion" ? `${formatNumber(preview.total ?? 0, 0)} completions` : `${formatNumber(preview.total ?? 0, effectiveDecimals)} ${unit} in total`} · {daysInclusive(start, end)} days
              </div>
            </>
          ) : null}
        </div>
      </Card>

      {tracking === "quantity" && (
        <Card className="space-y-3">
          <CardTitle>Milestones</CardTitle>
          <p className="text-sm text-muted">You&apos;ll automatically get 25%, 50%, 75% and 100% milestones. Add your own if you like.</p>
          {milestones.map((m, i) => (
            <div key={i} className="grid grid-cols-[1fr_6rem_auto] items-end gap-2">
              <Field label="Name" htmlFor={`m-t-${i}`}><Input id={`m-t-${i}`} value={m.title} onChange={(e) => setMilestones(milestones.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} /></Field>
              <Field label={`At (${unit})`} htmlFor={`m-v-${i}`}><Input id={`m-v-${i}`} inputMode="decimal" value={m.value} onChange={(e) => setMilestones(milestones.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} /></Field>
              <Button type="button" variant="ghost" onClick={() => setMilestones(milestones.filter((_, j) => j !== i))} aria-label="Remove milestone">✕</Button>
            </div>
          ))}
          {milestones.length < 5 && <Button type="button" variant="outline" size="sm" onClick={() => setMilestones([...milestones, { title: "", value: "" }])}>+ Add milestone</Button>}
        </Card>
      )}

      <Button type="submit" size="lg" className="w-full" loading={pending}>Create challenge</Button>
    </form>
  );
}
