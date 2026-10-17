"use client";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** A big, thumb-friendly checkbox row. */
export function Tick({
  checked, disabled, onToggle, title, detail, time, highlightTime,
}: {
  checked: boolean; disabled?: boolean; onToggle: () => void; title: string; detail?: string; time?: string; highlightTime?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "flex min-h-12 w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55",
        checked ? "bg-primary/10" : "hover:bg-surface-2 active:bg-surface-2",
      )}
    >
      <span
        aria-hidden
        className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border-2 transition-colors", checked ? "border-primary bg-primary text-primary-fg" : "border-subtle")}
      >
        {checked && <Check className="size-4" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[15px] font-medium leading-snug", checked && "text-muted line-through decoration-1")}>{title}</span>
        {detail && <span className="block text-sm text-muted">{detail}</span>}
      </span>
      {time && (
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular", highlightTime ? "bg-accent/15 text-accent" : "bg-surface-2 text-muted")}>{time}</span>
      )}
    </button>
  );
}
