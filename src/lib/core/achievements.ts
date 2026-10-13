import { startOfIsoWeek } from "./dates";
import type { ChallengeProgress } from "./progress";
import type { ChallengeCore } from "./types";

export const ACHIEVEMENT_TYPES = [
  "first_log",
  "streak_bronze",
  "streak_silver",
  "streak_gold",
  "halfway",
  "target_reached",
  "overachiever",
  "perfect_week",
  "challenge_completed",
  "early_finish",
] as const;
export type AchievementType = (typeof ACHIEVEMENT_TYPES)[number];

export function achievementInfo(type: AchievementType, unit: "days" | "sessions" | "weeks" = "sessions") {
  const n = streakThresholds(unit);
  const table: Record<AchievementType, { title: string; description: string; emoji: string }> = {
    first_log: { title: "First step", description: "Logged your first activity.", emoji: "👟" },
    streak_bronze: { title: `${n[0]}-${unit.replace(/s$/, "")} streak`, description: `Completed ${n[0]} ${unit} in a row.`, emoji: "🔥" },
    streak_silver: { title: `${n[1]}-${unit.replace(/s$/, "")} streak`, description: `Completed ${n[1]} ${unit} in a row.`, emoji: "⚡" },
    streak_gold: { title: `${n[2]}-${unit.replace(/s$/, "")} streak`, description: `Completed ${n[2]} ${unit} in a row.`, emoji: "🏆" },
    halfway: { title: "Halfway there", description: "Reached 50% of the overall target.", emoji: "⛰️" },
    target_reached: { title: "Target reached", description: "Logged at least the full overall target.", emoji: "🎯" },
    overachiever: { title: "Overachiever", description: "Beat the target of a scheduled session.", emoji: "🚀" },
    perfect_week: { title: "Perfect week", description: "Completed every scheduled session in a week.", emoji: "✅" },
    challenge_completed: { title: "Challenge completed", description: "Finished the challenge.", emoji: "🏁" },
    early_finish: { title: "Early finisher", description: "Completed the challenge before its end date.", emoji: "⏱️" },
  };
  return table[type];
}

export function streakThresholds(unit: "days" | "sessions" | "weeks"): [number, number, number] {
  return unit === "weeks" ? [2, 4, 12] : [3, 7, 30];
}

/** Every achievement the challenge currently qualifies for (pure; persisted by the service layer). */
export function evaluateAchievements(challenge: Pick<ChallengeCore, "status" | "endDate" | "completedLocalDate">, p: ChallengeProgress): AchievementType[] {
  const earned: AchievementType[] = [];
  if (p.logCount > 0) earned.push("first_log");

  const [a, b, c] = streakThresholds(p.streak.unit);
  if (p.streak.longest >= a) earned.push("streak_bronze");
  if (p.streak.longest >= b) earned.push("streak_silver");
  if (p.streak.longest >= c) earned.push("streak_gold");

  if (p.totalTarget > 0 && p.goalPercent >= 50) earned.push("halfway");
  if (p.targetReached) earned.push("target_reached");
  if (p.slots.some((s) => s.kind !== "total" && s.exceeded)) earned.push("overachiever");

  const weeks = new Map<string, { counted: number; done: number }>();
  for (const s of p.slots) {
    if (s.kind === "total" || ["cancelled", "skipped", "excused"].includes(s.state)) continue;
    const key = startOfIsoWeek(s.windowStart);
    const w = weeks.get(key) ?? { counted: 0, done: 0 };
    w.counted += 1;
    if (s.state === "completed") w.done += 1;
    weeks.set(key, w);
  }
  if ([...weeks.values()].some((w) => w.counted >= 2 && w.counted === w.done)) earned.push("perfect_week");

  if (challenge.status === "completed") {
    earned.push("challenge_completed");
    if (challenge.completedLocalDate && challenge.completedLocalDate < challenge.endDate) earned.push("early_finish");
  }
  return earned;
}
