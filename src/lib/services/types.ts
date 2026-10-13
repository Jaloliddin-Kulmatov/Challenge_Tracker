import type { ChallengeProgress, SlotEvaluation } from "@/lib/core/progress";
import type { AchievementType } from "@/lib/core/achievements";
import type { ISODate } from "@/lib/core/dates";
import type { Category, ChallengeStatus, TargetRule, TrackingMethod } from "@/lib/core/types";

export interface ChallengeView {
  id: string;
  title: string;
  description: string | null;
  category: Category;
  trackingMethod: TrackingMethod;
  unit: string | null;
  valueDecimals: number;
  color: string;
  startDate: ISODate;
  endDate: ISODate;
  originalEndDate: ISODate;
  status: ChallengeStatus;
  completedLocalDate: ISODate | null;
  completedEarly: boolean;
}

export interface LogView {
  id: string;
  value: number;
  localDate: ISODate;
  /** Wall-clock "HH:mm" in the zone the activity was logged in. */
  time: string;
  timezone: string;
  notes: string | null;
  scheduledActivityId: string | null;
}

export interface MilestoneView {
  id: string;
  title: string;
  thresholdPercent: number | null;
  thresholdValue: number | null;
  /** Resolved against the current overall target. */
  resolvedValue: number | null;
  isCustom: boolean;
  reachedLocalDate: ISODate | null;
}

export interface ShareView {
  id: string;
  token: string;
  showNotes: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface AchievementView {
  type: AchievementType;
  earnedAt: string;
  challengeId?: string;
  challengeTitle?: string;
}

export interface ChallengeDetail {
  challenge: ChallengeView;
  progress: ChallengeProgress;
  rules: TargetRule[];
  currentRule: TargetRule | null;
  pauses: { startDate: ISODate; endDate: ISODate | null }[];
  milestones: MilestoneView[];
  achievements: AchievementView[];
  shares: ShareView[];
  logs: LogView[];
}

export interface ChallengeSummary {
  challenge: ChallengeView;
  phase: ChallengeProgress["phase"];
  today: ISODate;
  goalPercent: number;
  goalPercentCapped: number;
  totalLogged: number;
  totalTarget: number;
  pace: ChallengeProgress["pace"];
  streak: ChallengeProgress["streak"];
  adherencePercent: number | null;
  daysRemaining: number;
  daysUntilStart: number;
  targetReached: boolean;
  rule: TargetRule | null;
  /** Open slots that can be logged against right now. */
  due: SlotEvaluation[];
  /** Slots covering today that are already complete. */
  doneToday: SlotEvaluation[];
  /** Next upcoming slot (if nothing is due). */
  next: SlotEvaluation | null;
}

export interface DashboardData {
  today: ISODate;
  timezone: string;
  challenges: ChallengeSummary[];
  recentAchievements: AchievementView[];
}

export interface LogResult {
  log: LogView;
  deduplicated: boolean;
  reachedMilestones: string[];
  newAchievements: AchievementType[];
  progress: Pick<ChallengeProgress, "totalLogged" | "totalTarget" | "goalPercent" | "targetReached">;
}
