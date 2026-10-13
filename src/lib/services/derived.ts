/**
 * Derived, persisted state: milestones reached and achievements earned.
 * Both are *recomputed from the logs* after every change so they can never drift
 * (deleting a log can un-reach a milestone or un-earn a badge).
 */
import { eq, inArray } from "drizzle-orm";
import type { Executor } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { evaluateAchievements, type AchievementType } from "@/lib/core/achievements";
import { evaluateMilestones } from "@/lib/core/milestones";
import type { ChallengeProgress } from "@/lib/core/progress";
import type { ISODate } from "@/lib/core/dates";
import { loadBundles, num, progressOf, toCore } from "./bundle";

export interface DerivedChanges {
  progress: ChallengeProgress;
  reachedMilestones: string[];
  newAchievements: AchievementType[];
}

export async function recomputeDerived(tx: Executor, challengeId: string, today: ISODate): Promise<DerivedChanges> {
  const bundle = (await loadBundles(tx, [challengeId])).get(challengeId);
  if (!bundle) throw new Error("Challenge vanished during recompute");
  const progress = progressOf(bundle, today);

  // ---- milestones ----------------------------------------------------------
  const results = evaluateMilestones(
    bundle.milestones.map((m) => ({
      id: m.id,
      thresholdPercent: m.thresholdPercent === null ? null : Number(m.thresholdPercent),
      thresholdValue: m.thresholdValue === null ? null : num(m.thresholdValue),
    })),
    bundle.logs,
    progress.totalTarget,
  );
  const reachedMilestones: string[] = [];
  for (const m of bundle.milestones) {
    const r = results.get(m.id) ?? null;
    const was = m.reachedAt !== null;
    if (!r && !was) continue;
    if (r && was && m.reachedLocalDate === r.reachedLocalDate && m.reachedAt?.getTime() === r.reachedAt.getTime()) continue;
    if (r && !was) reachedMilestones.push(m.title);
    await tx
      .update(s.milestones)
      .set({ reachedAt: r?.reachedAt ?? null, reachedLocalDate: r?.reachedLocalDate ?? null })
      .where(eq(s.milestones.id, m.id));
  }

  // ---- achievements --------------------------------------------------------
  const wanted = evaluateAchievements(toCore(bundle.challenge), progress);
  const have = new Set(bundle.achievements.map((a) => a.type));
  const toAdd = wanted.filter((t) => !have.has(t));
  if (toAdd.length > 0) {
    await tx
      .insert(s.achievements)
      .values(toAdd.map((type) => ({ userId: bundle.challenge.ownerId, challengeId, type })))
      .onConflictDoNothing();
  }
  const stale = bundle.achievements.filter((a) => !wanted.includes(a.type as AchievementType)).map((a) => a.id);
  if (stale.length > 0) await tx.delete(s.achievements).where(inArray(s.achievements.id, stale));

  return { progress, reachedMilestones, newAchievements: toAdd };
}
