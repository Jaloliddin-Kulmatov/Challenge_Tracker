"use client";
import { Minus, Plus } from "lucide-react";
import * as React from "react";
import { createLogAction } from "@/app/actions/challenges";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useRunner } from "@/components/use-runner";
import { ACHIEVEMENT_LABEL } from "@/components/labels";
import { formatNumber } from "@/lib/core/format";

export interface LogTarget {
  challengeId: string;
  title: string;
  trackingMethod: "completion" | "quantity";
  unit: string | null;
  decimals: number;
  /** Optional: the scheduled session this log is for. */
  slotId?: string | null;
  slotDate?: string;
  target?: number;
  achieved?: number;
  today: string;
}

export function LogSheet({ open, onOpenChange, t }: { open: boolean; onOpenChange: (o: boolean) => void; t: LogTarget }) {
  const { exec, pending } = useRunner();
  const remaining = t.target !== undefined ? Math.max(0, +(t.target - (t.achieved ?? 0)).toFixed(t.decimals)) : undefined;
  const initial = remaining && remaining > 0 ? remaining : (t.target ?? 1);
  const [value, setValue] = React.useState(String(initial));
  const [date, setDate] = React.useState(t.slotDate && t.slotDate <= t.today ? t.slotDate : t.today);
  const [time, setTime] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<{ message: string; fields: Record<string, string> } | null>(null);
  // One idempotency key per open sheet: a double tap or retry can never create two logs.
  const requestId = React.useRef<string>("");
  React.useEffect(() => {
    if (open) {
      requestId.current = crypto.randomUUID();
      setError(null);
      setValue(String(initial));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const step = t.decimals === 0 ? 1 : t.decimals === 1 ? 0.5 : 0.25;
  const bump = (d: number) => {
    const n = Number.parseFloat(value || "0");
    setValue(String(Math.max(0, +(n + d).toFixed(t.decimals))));
  };
  const unit = t.unit ? ` ${t.unit}` : "";
  const quick = Array.from(new Set([remaining, t.target].filter((x): x is number => !!x && x > 0)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const num = Number.parseFloat(value);
    if (t.trackingMethod === "quantity" && (!Number.isFinite(num) || num <= 0)) {
      setError({ message: "Enter how much you did.", fields: { value: "Enter a number greater than zero." } });
      return;
    }
    const res = await exec(
      () => createLogAction({
        challengeId: t.challengeId,
        value: t.trackingMethod === "quantity" ? num : undefined,
        localDate: date !== t.today ? date : undefined,
        time: time || undefined,
        notes: notes || undefined,
        scheduledActivityId: t.slotId || undefined,
        clientRequestId: requestId.current,
      }),
      {
        silentError: true,
        success: (d) => {
          const extras = [...d.reachedMilestones.map((m) => `🎯 ${m}`), ...d.newAchievements.map((a) => `${ACHIEVEMENT_LABEL[a] ?? a}`)];
          const base = d.deduplicated ? "Already logged." : t.trackingMethod === "completion" ? "Marked as done!" : `Logged ${formatNumber(d.log.value, t.decimals)}${unit}!`;
          return extras.length ? `${base} ${extras.join(" · ")}` : base;
        },
        onOk: () => {
          onOpenChange(false);
          setNotes("");
          setTime("");
        },
      },
    );
    if (res && !res.ok) setError({ message: res.error, fields: res.fieldErrors ?? {} });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t.trackingMethod === "completion" ? "Mark as done" : "Log activity"} description={t.title}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {t.trackingMethod === "quantity" && (
          <Field label={`How much${t.unit ? ` (${t.unit})` : ""}?`} htmlFor="log-value" error={error?.fields.value}>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" aria-label="Decrease" onClick={() => bump(-step)}><Minus className="size-5" /></Button>
              <Input
                id="log-value" inputMode="decimal" autoComplete="off" value={value} aria-invalid={!!error?.fields.value}
                onChange={(e) => setValue(e.target.value.replace(",", "."))} className="h-14 text-center text-2xl font-bold tabular" autoFocus
              />
              <Button type="button" variant="outline" size="icon" aria-label="Increase" onClick={() => bump(step)}><Plus className="size-5" /></Button>
            </div>
            {quick.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {quick.map((q) => (
                  <button key={q} type="button" onClick={() => setValue(String(q))} className="min-h-9 rounded-full bg-surface-2 px-3 text-sm font-medium hover:bg-border">
                    {q === remaining && q !== t.target ? "Remaining " : q === t.target && q === remaining ? "Target " : "Target "}
                    {formatNumber(q, t.decimals)}{unit}
                  </button>
                ))}
              </div>
            )}
          </Field>
        )}
        {t.trackingMethod === "completion" && <p className="text-sm text-muted">Tap the button to record that you did it.</p>}

        <details className="rounded-xl border border-border px-3 py-2">
          <summary className="min-h-9 cursor-pointer py-1.5 text-sm font-medium">More options (date, time, notes)</summary>
          <div className="space-y-3 pb-2 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" htmlFor="log-date" error={error?.fields.localDate}>
                <Input id="log-date" type="date" value={date} max={t.today} onChange={(e) => setDate(e.target.value || t.today)} />
              </Field>
              <Field label="Time (optional)" htmlFor="log-time" error={error?.fields.time}>
                <Input id="log-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </Field>
            </div>
            <Field label="Notes (optional)" htmlFor="log-notes" error={error?.fields.notes}>
              <Textarea id="log-notes" value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} placeholder="How did it go?" />
            </Field>
          </div>
        </details>

        {error && !Object.keys(error.fields).length && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{error.message}</p>}
        {error && Object.keys(error.fields).length > 0 && <p role="alert" className="text-sm font-medium text-danger">{error.message}</p>}
        <Button type="submit" size="lg" className="w-full" loading={pending}>{t.trackingMethod === "completion" ? "Done ✓" : "Save"}</Button>
      </form>
    </Sheet>
  );
}

export function LogButton({ t, label, variant = "primary", size = "default", className }: { t: LogTarget; label?: string; variant?: "primary" | "accent" | "outline" | "secondary"; size?: "default" | "sm" | "lg"; className?: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        {label ?? (t.trackingMethod === "completion" ? "Mark done" : "Log")}
      </Button>
      <LogSheet open={open} onOpenChange={setOpen} t={t} />
    </>
  );
}
