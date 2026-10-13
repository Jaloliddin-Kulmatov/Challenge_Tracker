import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import type { Db } from "@/lib/db/client";
import { localDateIn } from "@/lib/core/dates";
import type { ChallengeProgress } from "@/lib/core/progress";
import { parseInput, shareSchema } from "@/lib/validation";
import { loadBundles, progressOf } from "./bundle";
import { lockOwned, toChallengeView } from "./challenges";
import type { Ctx } from "./context";
import { badState, notFound } from "./errors";
import type { ChallengeView, MilestoneView, ShareView } from "./types";

const MAX_ACTIVE_SHARES = 5;

export async function createShare(ctx: Ctx, challengeId: string, raw: unknown): Promise<ShareView> {
  const input = parseInput(shareSchema, raw);
  return ctx.db.transaction(async (tx) => {
    await lockOwned(tx, ctx, challengeId);
    const active = await tx
      .select({ id: s.challengeShares.id })
      .from(s.challengeShares)
      .where(and(eq(s.challengeShares.challengeId, challengeId), isNull(s.challengeShares.revokedAt)));
    if (active.length >= MAX_ACTIVE_SHARES) throw badState("You already have several active share links. Revoke one first.");
    const token = randomBytes(24).toString("base64url");
    const expiresAt = input.expiresInDays ? new Date(ctx.now.getTime() + input.expiresInDays * 86_400_000) : null;
    const [row] = await tx.insert(s.challengeShares).values({ challengeId, token, showNotes: input.showNotes, expiresAt }).returning();
    return { id: row!.id, token: row!.token, showNotes: row!.showNotes, expiresAt: row!.expiresAt?.toISOString() ?? null, revokedAt: null };
  });
}

export async function revokeShare(ctx: Ctx, challengeId: string, shareId: string) {
  await ctx.db.transaction(async (tx) => {
    await lockOwned(tx, ctx, challengeId);
    const res = await tx
      .update(s.challengeShares)
      .set({ revokedAt: ctx.now })
      .where(and(eq(s.challengeShares.id, shareId), eq(s.challengeShares.challengeId, challengeId), isNull(s.challengeShares.revokedAt)))
      .returning({ id: s.challengeShares.id });
    if (res.length === 0) throw notFound("That share link");
  });
}

export interface SharedChallenge {
  ownerName: string;
  challenge: ChallengeView;
  progress: Pick<
    ChallengeProgress,
    | "phase" | "goalPercent" | "goalPercentCapped" | "totalLogged" | "totalTarget" | "daily" | "weekly" | "streak"
    | "adherencePercent" | "sessionsCompleted" | "sessionsMissed" | "sessionsCounted" | "daysRemaining" | "daysTotal" | "daysElapsed" | "pace"
  >;
  milestones: MilestoneView[];
  notes: { date: string; text: string }[];
}

/** Public, read-only view for a share link. Exposes statistics only – never email, other challenges, or (by default) notes. */
export async function getSharedChallenge(db: Db, token: string, now: Date): Promise<SharedChallenge | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const [share] = await db.select().from(s.challengeShares).where(eq(s.challengeShares.token, token)).limit(1);
  if (!share || share.revokedAt || (share.expiresAt && share.expiresAt.getTime() <= now.getTime())) return null;
  const bundle = (await loadBundles(db, [share.challengeId])).get(share.challengeId);
  if (!bundle) return null;
  const [owner] = await db.select({ name: s.user.name, timezone: s.user.timezone }).from(s.user).where(eq(s.user.id, bundle.challenge.ownerId)).limit(1);
  if (!owner) return null;
  const p = progressOf(bundle, localDateIn(now, owner.timezone));
  return {
    ownerName: owner.name,
    challenge: toChallengeView(bundle.challenge),
    progress: {
      phase: p.phase, goalPercent: p.goalPercent, goalPercentCapped: p.goalPercentCapped, totalLogged: p.totalLogged, totalTarget: p.totalTarget,
      daily: p.daily, weekly: p.weekly, streak: p.streak, adherencePercent: p.adherencePercent, sessionsCompleted: p.sessionsCompleted,
      sessionsMissed: p.sessionsMissed, sessionsCounted: p.sessionsCounted, daysRemaining: p.daysRemaining, daysTotal: p.daysTotal, daysElapsed: p.daysElapsed, pace: p.pace,
    },
    milestones: bundle.milestones.map((m) => ({
      id: m.id, title: m.title, thresholdPercent: m.thresholdPercent === null ? null : Number(m.thresholdPercent),
      thresholdValue: m.thresholdValue === null ? null : Number(m.thresholdValue), resolvedValue: null, isCustom: m.isCustom, reachedLocalDate: m.reachedLocalDate,
    })),
    notes: share.showNotes ? bundle.logs.filter((l) => l.notes).slice(-20).map((l) => ({ date: l.localDate, text: l.notes! })) : [],
  };
}
