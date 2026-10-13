"use client";
import { Pencil, Trash2 } from "lucide-react";
import * as React from "react";
import { deleteLogAction, updateLogAction } from "@/app/actions/challenges";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useRunner } from "@/components/use-runner";
import { formatDateLong } from "@/lib/core/dates";
import { formatValue } from "@/lib/core/format";
import type { LogView } from "@/lib/services/types";

interface Props {
  logs: LogView[];
  locked: boolean;
  today: string;
  challenge: { trackingMethod: "completion" | "quantity"; unit: string | null; decimals: number; startDate: string; endDate: string };
}

export function LogList({ logs, locked, today, challenge }: Props) {
  const [edit, setEdit] = React.useState<LogView | null>(null);
  const [del, setDel] = React.useState<LogView | null>(null);
  const { exec, pending } = useRunner();
  const [showAll, setShowAll] = React.useState(false);
  const shown = showAll ? logs : logs.slice(0, 10);
  const fmt = (n: number) => formatValue(n, challenge.unit, challenge.trackingMethod, challenge.decimals);

  if (logs.length === 0) return <p className="rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted">Nothing logged yet. Your activity will appear here.</p>;
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {shown.map((l) => (
          <li key={l.id} className="flex items-start gap-3 px-3.5 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold tabular">{fmt(l.value)}</span>
                <span className="text-sm text-muted">{formatDateLong(l.localDate)} · {l.time}</span>
              </div>
              {l.notes && <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-muted">{l.notes}</p>}
            </div>
            {!locked && (
              <>
                <Button variant="ghost" size="icon" className="size-9" aria-label="Edit entry" onClick={() => setEdit(l)}><Pencil className="size-4" /></Button>
                <Button variant="ghost" size="icon" className="size-9 text-danger" aria-label="Delete entry" onClick={() => setDel(l)}><Trash2 className="size-4" /></Button>
              </>
            )}
          </li>
        ))}
      </ul>
      {logs.length > 10 && <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>{showAll ? "Show fewer" : `Show all ${logs.length} entries`}</Button>}

      {edit && <EditSheet log={edit} today={today} challenge={challenge} onClose={() => setEdit(null)} />}
      {del && (
        <ConfirmSheet
          open onOpenChange={(o) => !o && setDel(null)} title="Delete this entry?" danger pending={pending} confirmLabel="Delete"
          description={<>Remove <strong>{fmt(del.value)}</strong> logged on {formatDateLong(del.localDate)}? Your progress, streaks and milestones will be recalculated.</>}
          onConfirm={() => exec(() => deleteLogAction(del.id), { success: "Entry deleted.", onOk: () => setDel(null) })}
        />
      )}
    </div>
  );
}

function EditSheet({ log, today, challenge, onClose }: { log: LogView; today: string; challenge: Props["challenge"]; onClose: () => void }) {
  const { exec, pending } = useRunner();
  const [value, setValue] = React.useState(String(log.value));
  const [date, setDate] = React.useState(log.localDate);
  const [time, setTime] = React.useState(log.time);
  const [notes, setNotes] = React.useState(log.notes ?? "");
  const [error, setError] = React.useState<{ message: string; fields: Record<string, string> } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await exec(
      () => updateLogAction({
        logId: log.id,
        value: challenge.trackingMethod === "quantity" ? Number.parseFloat(value) : undefined,
        localDate: date, time, notes: notes || null,
      }),
      { silentError: true, success: "Entry updated.", onOk: onClose },
    );
    if (res && !res.ok) setError({ message: res.error, fields: res.fieldErrors ?? {} });
  }
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="Edit entry">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {challenge.trackingMethod === "quantity" && (
          <Field label={`Amount${challenge.unit ? ` (${challenge.unit})` : ""}`} htmlFor="e-value" error={error?.fields.value}>
            <Input id="e-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(",", "."))} />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" htmlFor="e-date" error={error?.fields.localDate}>
            <Input id="e-date" type="date" value={date} min={challenge.startDate} max={today < challenge.endDate ? today : challenge.endDate} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Time" htmlFor="e-time" error={error?.fields.time}><Input id="e-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        </div>
        <Field label="Notes" htmlFor="e-notes" error={error?.fields.notes}><Textarea id="e-notes" value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} /></Field>
        {error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{error.message}</p>}
        <Button type="submit" size="lg" className="w-full" loading={pending}>Save changes</Button>
      </form>
    </Sheet>
  );
}
