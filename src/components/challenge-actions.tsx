"use client";
import { Archive, MoreHorizontal, Pause, Pencil, Play, Trash2, Flag, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { archiveAction, completeAction, deleteChallengeAction, pauseAction, restoreAction, resumeAction } from "@/app/actions/challenges";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { LogButton, type LogTarget } from "@/components/log-sheet";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useRunner } from "@/components/use-runner";
import type { Phase } from "@/lib/core/progress";
import { cn } from "@/lib/utils";

type Pending = "pause" | "resume" | "complete" | "archive" | "delete" | null;

export function ChallengeActions({
  id, phase, targetReached, logTarget, endsEarly,
}: { id: string; phase: Phase; targetReached: boolean; logTarget: LogTarget; endsEarly: boolean }) {
  const { exec, pending } = useRunner();
  const router = useRouter();
  const [confirm, setConfirm] = React.useState<Pending>(null);
  const [menu, setMenu] = React.useState(false);

  const close = () => setConfirm(null);
  const copy: Record<Exclude<Pending, null>, { title: string; text: React.ReactNode; label: string; danger?: boolean; run: () => void }> = {
    pause: {
      title: "Pause this challenge?",
      text: "Days you're paused won't count as missed, and your end date moves back by the same number of days when you resume.",
      label: "Pause",
      run: () => exec(() => pauseAction(id), { success: "Challenge paused.", onOk: close }),
    },
    resume: {
      title: "Resume this challenge?",
      text: "Your end date is extended by the days you were paused and the schedule continues from today.",
      label: "Resume",
      run: () => exec(() => resumeAction(id), { success: "Welcome back – challenge resumed.", onOk: close }),
    },
    complete: {
      title: "Finish this challenge?",
      text: endsEarly
        ? "You're finishing before the end date. Remaining sessions stop counting, and your final results are saved. Logged history becomes read-only."
        : "Your final results are saved and your logged history becomes read-only.",
      label: "Finish challenge",
      run: () => exec(() => completeAction(id), { success: "Challenge completed! 🏁", onOk: close }),
    },
    archive: {
      title: "Archive this challenge?",
      text: "It disappears from your active lists but nothing is deleted. You can restore it from Challenges → Archived.",
      label: "Archive",
      run: () => exec(() => archiveAction(id), { success: "Challenge archived.", onOk: () => router.push("/challenges") }),
    },
    delete: {
      title: "Delete this challenge forever?",
      text: "This permanently deletes the challenge, its schedule, every log entry and any share links. This cannot be undone.",
      label: "Delete forever",
      danger: true,
      run: () => exec(() => deleteChallengeAction(id), { success: "Challenge deleted.", onOk: () => router.push("/challenges") }),
    },
  };
  const active = confirm ? copy[confirm] : null;
  const running = phase === "running";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {running && <LogButton t={logTarget} label={logTarget.trackingMethod === "completion" ? "Mark done" : "Log activity"} variant="accent" size="lg" className="flex-1 sm:flex-none" />}
      {(running || phase === "ended") && targetReached && (
        <Button variant="primary" size="lg" onClick={() => setConfirm("complete")}><Flag className="size-4" /> Finish challenge</Button>
      )}
      {phase === "paused" && <Button size="lg" onClick={() => setConfirm("resume")}><Play className="size-4" /> Resume</Button>}
      {phase === "ended" && !targetReached && <Button size="lg" onClick={() => setConfirm("complete")}><Flag className="size-4" /> Finish &amp; review</Button>}
      <Button variant="outline" size="icon" aria-label="More actions" onClick={() => setMenu(true)}><MoreHorizontal className="size-5" /></Button>

      <Sheet open={menu} onOpenChange={setMenu} title="Challenge options">
        <div className="grid gap-2">
          {["running", "paused", "upcoming", "ended"].includes(phase) && (
            <Link href={`/challenges/${id}/edit`} className={cn(buttonVariants({ variant: "outline" }), "justify-start")}><Pencil className="size-4" /> Edit targets &amp; dates</Link>
          )}
          {running && <Button variant="outline" className="justify-start" onClick={() => { setMenu(false); setConfirm("pause"); }}><Pause className="size-4" /> Pause challenge</Button>}
          {(running || phase === "paused") && !targetReached && <Button variant="outline" className="justify-start" onClick={() => { setMenu(false); setConfirm("complete"); }}><Flag className="size-4" /> Finish early</Button>}
          {phase === "archived" ? (
            <Button variant="outline" className="justify-start" loading={pending} onClick={() => exec(() => restoreAction(id), { success: "Challenge restored.", onOk: () => setMenu(false) })}><Undo2 className="size-4" /> Restore</Button>
          ) : (
            <Button variant="outline" className="justify-start" onClick={() => { setMenu(false); setConfirm("archive"); }}><Archive className="size-4" /> Archive</Button>
          )}
          <Button variant="outline" className="justify-start text-danger" onClick={() => { setMenu(false); setConfirm("delete"); }}><Trash2 className="size-4" /> Delete…</Button>
        </div>
      </Sheet>

      {active && (
        <ConfirmSheet open onOpenChange={(o) => !o && close()} title={active.title} description={active.text} confirmLabel={active.label} danger={active.danger} pending={pending} onConfirm={active.run} />
      )}
    </div>
  );
}
