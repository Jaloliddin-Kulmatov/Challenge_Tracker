"use client";
import { Copy, Link2, Trash2 } from "lucide-react";
import * as React from "react";
import { createShareAction, revokeShareAction } from "@/app/actions/challenges";
import { Button } from "@/components/ui/button";
import { useRunner } from "@/components/use-runner";
import { useToast } from "@/components/ui/toast";
import type { ShareView } from "@/lib/services/types";

export function SharePanel({ challengeId, shares }: { challengeId: string; shares: ShareView[] }) {
  const { exec, pending } = useRunner();
  const toast = useToast();
  const [showNotes, setShowNotes] = React.useState(false);
  const [days, setDays] = React.useState<string>("");
  const url = (t: string) => `${window.location.origin}/s/${t}`;

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(url(token));
      toast.success("Link copied.");
    } catch {
      toast.error("Couldn't copy automatically – select the link and copy it manually.");
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Anyone with the link can see this challenge&apos;s progress and charts – but not your email, other challenges{showNotes ? "" : " or notes"}. You can revoke a link at any time.</p>
      {shares.length > 0 && (
        <ul className="space-y-2">
          {shares.map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded-xl bg-surface-2 p-2.5 text-sm">
              <Link2 className="size-4 shrink-0 text-muted" aria-hidden />
              <input readOnly aria-label="Share link" value={typeof window === "undefined" ? `/s/${s.token}` : url(s.token)} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 bg-transparent text-xs" />
              <Button variant="ghost" size="icon" className="size-9" aria-label="Copy link" onClick={() => copy(s.token)}><Copy className="size-4" /></Button>
              <Button variant="ghost" size="icon" className="size-9 text-danger" aria-label="Revoke link" loading={pending} onClick={() => exec(() => revokeShareAction(challengeId, s.id), { success: "Link revoked." })}><Trash2 className="size-4" /></Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" checked={showNotes} onChange={(e) => setShowNotes(e.target.checked)} className="size-4" /> Include my notes</label>
        <label className="flex items-center gap-2 text-sm">Expires
          <select value={days} onChange={(e) => setDays(e.target.value)} className="min-h-9 rounded-lg border border-border bg-surface px-2">
            <option value="">never</option><option value="7">in 7 days</option><option value="30">in 30 days</option><option value="90">in 90 days</option>
          </select>
        </label>
        <Button variant="secondary" loading={pending} onClick={() => exec(() => createShareAction(challengeId, { showNotes, expiresInDays: days ? Number(days) : null }), { success: "Share link created." })}>Create link</Button>
      </div>
    </div>
  );
}
