"use client";
import { Check, Circle, Trash2 } from "lucide-react";
import * as React from "react";
import { addMilestoneAction, deleteMilestoneAction } from "@/app/actions/challenges";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useRunner } from "@/components/use-runner";
import { formatDateShort } from "@/lib/core/dates";
import { formatValue } from "@/lib/core/format";
import type { MilestoneView } from "@/lib/services/types";

export function MilestonesPanel({
  challengeId, milestones, locked, challenge,
}: { challengeId: string; milestones: MilestoneView[]; locked: boolean; challenge: { trackingMethod: "completion" | "quantity"; unit: string | null; decimals: number } }) {
  const { exec, pending } = useRunner();
  const [title, setTitle] = React.useState("");
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const sorted = [...milestones].sort((a, b) => (a.resolvedValue ?? Infinity) - (b.resolvedValue ?? Infinity));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await exec(() => addMilestoneAction(challengeId, { title, thresholdValue: Number.parseFloat(value) }), {
      silentError: true, success: "Milestone added.", onOk: () => { setTitle(""); setValue(""); },
    });
    if (res && !res.ok) setError(res.error);
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {sorted.map((m) => (
          <li key={m.id} className="flex items-center gap-3 text-sm">
            {m.reachedLocalDate ? <Check className="size-5 shrink-0 text-success" aria-label="Reached" /> : <Circle className="size-5 shrink-0 text-subtle" aria-label="Not reached yet" />}
            <div className="min-w-0 flex-1">
              <div className="font-medium">{m.title}</div>
              <div className="text-muted tabular">
                {m.resolvedValue !== null ? formatValue(m.resolvedValue, challenge.unit, challenge.trackingMethod, challenge.decimals) : "–"}
                {m.thresholdPercent !== null && ` (${m.thresholdPercent}%)`}
                {m.reachedLocalDate && ` · reached ${formatDateShort(m.reachedLocalDate)}`}
              </div>
            </div>
            {m.isCustom && !locked && (
              <Button variant="ghost" size="icon" className="size-9 text-danger" aria-label={`Delete milestone ${m.title}`} loading={pending} onClick={() => exec(() => deleteMilestoneAction(challengeId, m.id), { success: "Milestone removed." })}><Trash2 className="size-4" /></Button>
            )}
          </li>
        ))}
      </ul>
      {!locked && (
        <form onSubmit={add} className="grid grid-cols-[1fr_6.5rem_auto] items-end gap-2 border-t border-border pt-3" noValidate>
          <Field label="Custom milestone" htmlFor="ms-title"><Input id="ms-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. First 50" /></Field>
          <Field label={`At${challenge.unit ? ` (${challenge.unit})` : ""}`} htmlFor="ms-value"><Input id="ms-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(",", "."))} /></Field>
          <Button type="submit" variant="secondary" loading={pending}>Add</Button>
          {error && <p role="alert" className="col-span-full text-xs font-medium text-danger">{error}</p>}
        </form>
      )}
    </div>
  );
}
