import type { ChallengeCore, LogRecord, PauseRecord, SlotRecord, TargetRule } from "@/lib/core/types";
import { generateSlots } from "@/lib/core/schedule";
import { computeProgress } from "@/lib/core/progress";
import type { ISODate } from "@/lib/core/dates";

export function rule(partial: Partial<TargetRule> & Pick<TargetRule, "frequency" | "effectiveFrom">): TargetRule {
  return { weekdays: [], sessionTarget: null, weeklyTarget: null, weekdayTargets: null, totalTarget: null, ...partial };
}

let seq = 0;
export function slotsFrom(rules: TargetRule[], from: ISODate, to: ISODate, decimals = 1): SlotRecord[] {
  return generateSlots(rules, from, to, decimals).map((p) => ({
    ...p,
    id: `s${++seq}`,
    naturalStart: p.windowStart,
    status: "planned",
    isCustomized: false,
    label: null,
    timeOfDay: null,
  }));
}

export function log(localDate: ISODate, value: number, slotId: string | null = null, hour = 12): LogRecord {
  return {
    id: `l${++seq}`,
    value,
    localDate,
    occurredAt: new Date(`${localDate}T${String(hour).padStart(2, "0")}:00:00Z`),
    scheduledActivityId: slotId,
  };
}

export function challenge(partial: Partial<ChallengeCore> = {}): ChallengeCore {
  return {
    startDate: "2025-03-03", // a Monday
    endDate: "2025-03-16",
    status: "active",
    trackingMethod: "quantity",
    valueDecimals: 1,
    completedLocalDate: null,
    ...partial,
  };
}

export function progress(opts: {
  c?: Partial<ChallengeCore>;
  rules: TargetRule[];
  today: ISODate;
  logs?: (slots: SlotRecord[]) => ReturnType<typeof log>[];
  pauses?: PauseRecord[];
  slotStatus?: Record<number, SlotRecord["status"]>;
}) {
  const ch = challenge(opts.c);
  const slots = slotsFrom(opts.rules, ch.startDate, ch.endDate, ch.valueDecimals);
  for (const [i, s] of Object.entries(opts.slotStatus ?? {})) slots[Number(i)]!.status = s;
  const logs = opts.logs ? opts.logs(slots) : [];
  return {
    slots,
    progress: computeProgress({
      challenge: ch,
      frequency: opts.rules.at(-1)?.frequency ?? null,
      slots,
      logs,
      pauses: opts.pauses ?? [],
      today: opts.today,
    }),
  };
}
