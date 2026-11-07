"use client";
import { Trash2 } from "lucide-react";
import * as React from "react";
import { addTodoAction, deleteTodoAction, setTodoDoneAction } from "@/app/actions/todos";
import { Tick } from "@/components/plan/tick";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatDateShort, type ISODate } from "@/lib/core/dates";
import type { Todo } from "@/lib/services/todos";

/** One-off to-dos (the plan's tasks above repeat; these happen once). Also fed by messaging the Telegram bot. */
export function TodoCard({ initial, today }: { initial: Todo[]; today: ISODate }) {
  const toast = useToast();
  const [items, setItems] = React.useState<Todo[]>(initial);
  const [title, setTitle] = React.useState("");
  const [due, setDue] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const sorted = [...items].sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await addTodoAction({ title, dueDate: due || null });
      if (!res.ok) return void setError(res.unauthenticated ? "Your session has expired. Please log in again." : res.error);
      setItems((l) => [...l, res.data]);
      setTitle("");
      setDue("");
    } catch {
      setError("Couldn't reach the server. Nothing was added.");
    } finally {
      setBusy(false);
    }
  }

  /** Finish with an instant update; put it back and say so if the server can't be reached or says no. */
  async function finish(t: Todo) {
    setItems((l) => l.filter((x) => x.id !== t.id));
    try {
      const res = await setTodoDoneAction(t.id, true);
      if (!res.ok) throw new Error(res.error);
    } catch {
      setItems((l) => [...l, t]);
      toast.error("Couldn't save that. Try again.");
    }
  }

  async function remove(t: Todo) {
    const before = items;
    setItems((l) => l.filter((x) => x.id !== t.id));
    try {
      const res = await deleteTodoAction(t.id);
      if (!res.ok) throw new Error(res.error);
    } catch {
      setItems(before);
      toast.error("Couldn't delete that. Try again.");
    }
  }

  return (
    <Card className="space-y-3 p-3">
      <div>
        <h2 id="todos-h" className="text-base font-semibold">To-do</h2>
        <p className="text-sm text-muted">One-off things. You can also just send them to the Telegram bot.</p>
      </div>
      <form onSubmit={add} className="flex flex-wrap items-center gap-2" noValidate>
        <Input aria-label="New to-do" className="min-w-0 flex-1 basis-48" value={title} maxLength={200} placeholder="Buy a SIM card" onChange={(e) => setTitle(e.target.value)} />
        <Input aria-label="Due date (optional)" type="date" className="w-40" value={due} onChange={(e) => setDue(e.target.value)} />
        <Button type="submit" loading={busy} disabled={title.trim() === ""}>Add</Button>
      </form>
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
      {sorted.length === 0 ? (
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">Nothing to do. 🎉</p>
      ) : (
        <ul className="space-y-0.5">
          {sorted.map((t) => (
            <li key={t.id} className="flex items-center gap-1">
              <div className="min-w-0 flex-1">
                <Tick
                  title={t.title}
                  detail={t.dueDate ? (t.dueDate < today ? `Overdue since ${formatDateShort(t.dueDate)}` : t.dueDate === today ? "Due today" : `Due ${formatDateShort(t.dueDate)}`) : undefined}
                  checked={false}
                  onToggle={() => finish(t)}
                />
              </div>
              <Button variant="ghost" size="icon" className="size-10 shrink-0" aria-label={`Delete ${t.title}`} onClick={() => remove(t)}><Trash2 className="size-4 text-muted" /></Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
