"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

export function ConfirmSheet({
  open, onOpenChange, title, description, confirmLabel, danger, pending, onConfirm,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description: React.ReactNode; confirmLabel: string; danger?: boolean; pending?: boolean; onConfirm: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title}>
      <div className="space-y-5">
        <div className="text-sm text-muted">{description}</div>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant={danger ? "danger" : "primary"} loading={pending} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </Sheet>
  );
}
