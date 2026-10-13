"use client";
import { useRouter } from "next/navigation";
import * as React from "react";
import { updateNotificationsAction, updateProfileAction } from "@/app/actions/challenges";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { useRunner } from "@/components/use-runner";
import { authClient } from "@/lib/auth/client";
import type { NotificationPrefs } from "@/lib/services/profile";

export function ProfileForm({ name: initialName, email, timezone: initialTz, zones }: { name: string; email: string; timezone: string; zones: string[] }) {
  const { exec, pending } = useRunner();
  const [name, setName] = React.useState(initialName);
  const [tz, setTz] = React.useState(initialTz);
  const [error, setError] = React.useState<string | null>(null);
  const [detected, setDetected] = React.useState<string | null>(null);
  React.useEffect(() => setDetected(Intl.DateTimeFormat().resolvedOptions().timeZone), []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await exec(() => updateProfileAction({ name, timezone: tz }), { silentError: true, success: "Profile saved." });
    if (res && !res.ok) setError(res.error);
  }
  return (
    <Card>
      <form onSubmit={save} className="space-y-4" noValidate>
        <CardTitle>Profile &amp; time zone</CardTitle>
        <Field label="Name" htmlFor="p-name"><Input id="p-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email" htmlFor="p-email"><Input id="p-email" value={email} readOnly disabled /></Field>
        <Field label="Time zone" htmlFor="p-tz" hint="Decides which calendar day “today” is. Changing it never moves activity you already logged – each entry keeps the day it was recorded on.">
          <Select id="p-tz" value={tz} onChange={(e) => setTz(e.target.value)}>
            {!zones.includes(tz) && <option value={tz}>{tz}</option>}
            {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
          </Select>
        </Field>
        {detected && detected !== tz && (
          <button type="button" className="text-sm font-semibold text-primary" onClick={() => setTz(detected)}>Use this device&apos;s time zone ({detected})</button>
        )}
        {error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{error}</p>}
        <Button type="submit" loading={pending}>Save profile</Button>
      </form>
    </Card>
  );
}

export function NotificationsForm({ prefs }: { prefs: NotificationPrefs }) {
  const { exec, pending } = useRunner();
  const [p, setP] = React.useState(prefs);
  const [error, setError] = React.useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await exec(() => updateNotificationsAction(p), { silentError: true, success: "Preferences saved." });
    if (res && !res.ok) setError(res.error);
  }
  return (
    <Card>
      <form onSubmit={save} className="space-y-4" noValidate>
        <CardTitle>Reminders</CardTitle>
        <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">Your preferences are saved. Sending reminders needs an email or push provider to be connected by whoever hosts this app – see the README (“Notifications”). Until then nothing is sent.</p>
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input type="checkbox" className="size-5" checked={p.dailyReminderEnabled} onChange={(e) => setP({ ...p, dailyReminderEnabled: e.target.checked })} /> Daily reminder</label>
        <Field label="Reminder time" htmlFor="n-time"><Input id="n-time" type="time" value={p.reminderTime} onChange={(e) => setP({ ...p, reminderTime: e.target.value })} /></Field>
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input type="checkbox" className="size-5" checked={p.weeklySummaryEnabled} onChange={(e) => setP({ ...p, weeklySummaryEnabled: e.target.checked })} /> Weekly summary</label>
        <Field label="Channel" htmlFor="n-ch">
          <Select id="n-ch" value={p.channel} onChange={(e) => setP({ ...p, channel: e.target.value as NotificationPrefs["channel"] })}>
            <option value="email">Email</option><option value="push">Push notification</option><option value="none">None</option>
          </Select>
        </Field>
        {error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{error}</p>}
        <Button type="submit" loading={pending}>Save preferences</Button>
      </form>
    </Card>
  );
}

export function AccountActions() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <Card className="space-y-3">
      <CardTitle>Account</CardTitle>
      <div className="flex flex-wrap gap-3">
        <a href="/api/export" download className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold hover:bg-surface-2">Download my data (JSON)</a>
        <Button
          variant="outline" loading={busy}
          onClick={async () => { setBusy(true); try { await authClient.signOut(); } finally { router.replace("/login"); router.refresh(); } }}
        >
          Log out
        </Button>
      </div>
    </Card>
  );
}
