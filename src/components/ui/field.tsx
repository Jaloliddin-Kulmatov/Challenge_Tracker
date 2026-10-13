import * as React from "react";
import { cn } from "@/lib/utils";

const control =
  "block w-full min-h-11 rounded-xl border border-border bg-surface px-3.5 py-2 text-foreground placeholder:text-subtle disabled:opacity-60 aria-[invalid=true]:border-danger";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(control, className)} {...p} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(control, "min-h-24", className)} {...p} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => (
  <select ref={ref} className={cn(control, "appearance-auto", className)} {...p} />
));
Select.displayName = "Select";

/** Label + control + hint + error, wired together for screen readers. */
export function Field({
  label, hint, error, htmlFor, children, className,
}: { label: string; hint?: React.ReactNode; error?: string; htmlFor: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p id={`${htmlFor}-hint`} className="text-xs text-muted">{hint}</p>}
      {error && <p id={`${htmlFor}-error`} role="alert" className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

export function Segmented<T extends string>({
  value, onChange, options, label, className,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: string; description?: string }[]; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("grid gap-2", className ?? "grid-cols-2")}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-11 rounded-xl border px-2 py-2 text-sm font-medium transition-colors",
            value === o.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-muted hover:bg-surface-2",
          )}
        >
          <span className="block">{o.label}</span>
          {o.description && <span className="block text-xs font-normal opacity-80">{o.description}</span>}
        </button>
      ))}
    </div>
  );
}
