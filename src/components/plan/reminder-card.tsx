"use client";
import { Bell } from "lucide-react";
import * as React from "react";
import { sendTestReminderAction, setPlanReminderAction } from "@/app/actions/plan";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

export interface ReminderProps {
  enabled: boolean;
  time: string;
  email: string;
  /** False when the server has no email provider key, so nothing can be sent yet. */
  configured: boolean;
}

/** One-tap evening email: "you haven't ticked these yet". */
export function ReminderCard({ initial }: { initial: ReminderProps }) {
  const toast = useToast();
  const [enabled, setEnabled] = React.useState(initial.enabled);
  const [time, setTime] = React.useState(initial.time);
  const [busy, setBusy] = React.useState<"save" | "test" | null>(null);

  async function save(nextEnabled: boolean, nextTime: string) {
    const before = { enabled, time };
    setEnabled(nextEnabled);
    setTime(nextTime);
    setBusy("save");
    try {
      const res = await setPlanReminderAction({ enabled: nextEnabled, time: nextTime });
      if (!res.ok) {
        setEnabled(before.enabled);
        setTime(before.time);
        toast.error(res.error);
        return;
      }
      toast.success(nextEnabled ? `I'll email you at ${nextTime}.` : "Reminder turned off.");
    } catch {
      setEnabled(before.enabled);
      setTime(before.time);
      toast.error("Couldn't reach the server. Nothing was changed.");
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    try {
      const res = await sendTestReminderAction();
      if (res.ok) toast.success(`Test email sent to ${res.data.email}.`);
      else toast.error(res.error);
    } catch {
      toast.error("Couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="space-y-3 p-3">
      <div className="flex items-center gap-3">
        <Bell className="size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Evening email reminder</div>
          <p className="text-sm text-muted">{enabled ? `Every day at ${time} to ${initial.email}, with what's still unticked.` : "Get an email in the evening so you don't forget to tick your day."}</p>
        </div>
        <label className="relative inline-flex min-h-11 cursor-pointer items-center">
          <input
            type="checkbox"
            role="switch"
            aria-label="Email me a reminder every evening"
            className="peer sr-only"
            checked={enabled}
            disabled={busy === "save"}
            onChange={(e) => save(e.target.checked, time)}
          />
          <span className="h-7 w-12 rounded-full bg-border transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/50" aria-hidden />
          <span className="absolute left-0.5 size-6 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" aria-hidden />
        </label>
      </div>
      {enabled && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            Time
            <Input aria-label="Reminder time" type="time" className="w-32" value={time} onChange={(e) => setTime(e.target.value)} onBlur={() => time !== initial.time && /^\d\d:\d\d$/.test(time) && save(true, time)} />
          </label>
          <Button variant="secondary" size="sm" loading={busy === "test"} onClick={test} disabled={!initial.configured}>Send me a test email</Button>
        </div>
      )}
      {!initial.configured && (
        <p role="note" className="rounded-xl bg-accent/10 px-3 py-2 text-sm">
          Email sending isn't connected on this server yet, so nothing will be sent. Whoever runs the app needs to set <code>RESEND_API_KEY</code> and <code>CRON_SECRET</code> (see the README, “Email reminders”).
        </p>
      )}
    </Card>
  );
}
