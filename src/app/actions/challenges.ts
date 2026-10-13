"use server";
import * as svc from "@/lib/services/challenges";
import * as logs from "@/lib/services/logs";
import * as slots from "@/lib/services/slots";
import * as shares from "@/lib/services/shares";
import * as profile from "@/lib/services/profile";
import { run } from "./util";

// Challenges ---------------------------------------------------------------
export const createChallengeAction = async (raw: unknown) => run((ctx) => svc.createChallenge(ctx, raw));
export const updateDetailsAction = async (id: string, raw: unknown) => run((ctx) => svc.updateChallengeDetails(ctx, id, raw));
export const changeRuleAction = async (id: string, raw: unknown) => run(async (ctx) => void (await svc.changeTargetRule(ctx, id, raw)));
export const changeEndDateAction = async (id: string, end: string) => run(async (ctx) => void (await svc.changeEndDate(ctx, id, end)));
export const rescheduleUpcomingAction = async (id: string, raw: unknown) => run(async (ctx) => void (await svc.rescheduleUpcoming(ctx, id, raw)));
export const pauseAction = async (id: string) => run(async (ctx) => void (await svc.pauseChallenge(ctx, id)));
export const resumeAction = async (id: string) => run(async (ctx) => void (await svc.resumeChallenge(ctx, id)));
export const completeAction = async (id: string) => run(async (ctx) => void (await svc.completeChallenge(ctx, id)));
export const archiveAction = async (id: string) => run((ctx) => svc.archiveChallenge(ctx, id));
export const restoreAction = async (id: string) => run((ctx) => svc.restoreChallenge(ctx, id));
export const deleteChallengeAction = async (id: string) => run((ctx) => svc.deleteChallenge(ctx, id));
export const addMilestoneAction = async (id: string, raw: unknown) => run(async (ctx) => void (await svc.addMilestone(ctx, id, raw)));
export const deleteMilestoneAction = async (id: string, milestoneId: string) => run((ctx) => svc.deleteMilestone(ctx, id, milestoneId));

// Logs ---------------------------------------------------------------------
export const createLogAction = async (raw: unknown) => run((ctx) => logs.createLog(ctx, raw));
export const updateLogAction = async (raw: unknown) => run((ctx) => logs.updateLog(ctx, raw));
export const deleteLogAction = async (logId: string) => run(async (ctx) => void (await logs.deleteLog(ctx, logId)));

// Schedule -----------------------------------------------------------------
export const rescheduleSlotAction = async (slotId: string, date: string) => run(async (ctx) => void (await slots.rescheduleSlot(ctx, slotId, date)));
export const setSlotTargetAction = async (slotId: string, value: number) => run(async (ctx) => void (await slots.setSlotTarget(ctx, slotId, value)));
export const setSlotSkippedAction = async (slotId: string, skipped: boolean) => run(async (ctx) => void (await slots.setSlotSkipped(ctx, slotId, skipped)));
export const addExtraSessionAction = async (id: string, raw: unknown) => run(async (ctx) => void (await slots.addExtraSession(ctx, id, raw)));

// Sharing ------------------------------------------------------------------
export const createShareAction = async (id: string, raw: unknown) => run((ctx) => shares.createShare(ctx, id, raw));
export const revokeShareAction = async (id: string, shareId: string) => run((ctx) => shares.revokeShare(ctx, id, shareId));

// Settings -----------------------------------------------------------------
export const updateProfileAction = async (raw: unknown) => run((ctx) => profile.updateProfile(ctx, raw));
export const updateNotificationsAction = async (raw: unknown) => run((ctx) => profile.updateNotificationPrefs(ctx, raw));
