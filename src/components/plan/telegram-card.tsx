"use client";
import { Send } from "lucide-react";
import * as React from "react";
import {
  connectTelegramAction, disconnectTelegramAction, sendTelegramTestAction, setTelegramReminderAction, telegramStateAction,
} from "@/app/actions/plan";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

export interface TelegramProps {
  /** False when the server has no bot token, so nothing can be connected yet. */
  configured: boolean;
  linked: boolean;
  enabled: boolean;
  time: string;
}

/** Evening reminders in Telegram, with tap-to-tick buttons. */
export function TelegramCard({ initial }: { initial: TelegramProps }) {
  const toast = useToast();
  const [linked, setLinked] = React.useState(initial.linked);
  const [enabled, setEnabled] = React.useState(initial.enabled);
  const [time, setTime] = React.useState(initial.time);
  const [busy, setBusy] = React.useState<"connect" | "save" | "test" | "off" | null>(null);
  const [waiting, setWaiting] = React.useState(false);

  // after "Connect", the person goes to Telegram and presses Start; look for the link every few seconds
  React.useEffect(() => {
    if (!waiting) return;
    let stopped = false;
    const started = Date.now();
    const id = window.setInterval(async () => {
      if (Date.now() - started > 10 * 60_000) return void setWaiting(false);
      try {
        const res = await telegramStateAction();
        if (!stopped && res.ok && res.data.linked) {
          setLinked(true);
          setEnabled(res.data.enabled);
          setTime(res.data.time);
          setWaiting(false);
          toast.success("Telegram connected.");
        }
      } catch {
        /* try again on the next tick */
      }
    }, 3000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [waiting, toast]);

  async function connect() {
    setBusy("connect");
    try {
      const res = await connectTelegramAction();
      if (!res.ok) return void toast.error(res.unauthenticated ? "Your session has expired. Please log in again." : res.error);
      window.open(res.data.url, "_blank", "noopener");
      setWaiting(true);
    } catch {
      toast.error("Couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  }

  async function save(nextEnabled: boolean, nextTime: string) {
    const before = { enabled, time };
    setEnabled(nextEnabled);
    setTime(nextTime);
    setBusy("save");
    try {
      const res = await setTelegramReminderAction({ enabled: nextEnabled, time: nextTime });
      if (!res.ok) {
        setEnabled(before.enabled);
        setTime(before.time);
        return void toast.error(res.error);
      }
      toast.success(nextEnabled ? `I'll message you at ${nextTime}.` : "Telegram reminder turned off.");
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
      const res = await sendTelegramTestAction();
      if (res.ok) toast.success("Sent. Check Telegram.");
      else toast.error(res.error);
    } catch {
      toast.error("Couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Telegram? You will stop getting reminders there.")) return;
    setBusy("off");
    try {
      const res = await disconnectTelegramAction();
      if (!res.ok) return void toast.error(res.error);
      setLinked(false);
      setEnabled(false);
      toast.success("Telegram disconnected.");
    } catch {
      toast.error("Couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="space-y-3 p-3">
      <div className="flex items-center gap-3">
        <Send className="size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Telegram reminder</div>
          <p className="text-sm text-muted">
            {!linked
              ? "Get your unticked tasks in Telegram and tap them to tick them."
              : enabled
                ? `Every day at ${time}. Tap a task in the chat to tick it. Send /today any time.`
                : "Connected, but reminders are off."}
          </p>
        </div>
        {linked && (
          <label className="relative inline-flex min-h-11 cursor-pointer items-center">
            <input
              type="checkbox"
              role="switch"
              aria-label="Send me a Telegram reminder every evening"
              className="peer sr-only"
              checked={enabled}
              disabled={busy === "save"}
              onChange={(e) => save(e.target.checked, time)}
            />
            <span className="h-7 w-12 rounded-full bg-border transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/50" aria-hidden />
            <span className="absolute left-0.5 size-6 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" aria-hidden />
          </label>
        )}
      </div>

      {!initial.configured && (
        <p role="note" className="rounded-xl bg-accent/10 px-3 py-2 text-sm">
          Telegram isn't set up on this server yet. Whoever runs the app needs to create a bot with @BotFather and set <code>TELEGRAM_BOT_TOKEN</code>, <code>TELEGRAM_BOT_USERNAME</code> and <code>TELEGRAM_WEBHOOK_SECRET</code> (see the README, “Telegram bot”).
        </p>
      )}

      {initial.configured && !linked && (
        <div className="space-y-2">
          <Button loading={busy === "connect"} onClick={connect}><Send className="size-4" aria-hidden /> Connect Telegram</Button>
          {waiting && <p role="status" className="text-sm text-muted">Waiting for you to press <strong>Start</strong> in Telegram… this page updates by itself.</p>}
        </div>
      )}

      {linked && (
        <div className="flex flex-wrap items-center gap-3">
          {enabled && (
            <label className="flex items-center gap-2 text-sm text-muted">
              Time
              <Input aria-label="Telegram reminder time" type="time" className="w-32" value={time} onChange={(e) => setTime(e.target.value)} onBlur={() => time !== initial.time && /^\d\d:\d\d$/.test(time) && save(true, time)} />
            </label>
          )}
          <Button variant="secondary" size="sm" loading={busy === "test"} onClick={test}>Send me today's tasks now</Button>
          <Button variant="ghost" size="sm" loading={busy === "off"} onClick={disconnect}>Disconnect</Button>
        </div>
      )}
    </Card>
  );
}
