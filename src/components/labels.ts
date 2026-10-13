import { achievementInfo, type AchievementType } from "@/lib/core/achievements";

export const ACHIEVEMENT_LABEL: Record<string, string> = Object.fromEntries(
  (["first_log", "streak_bronze", "streak_silver", "streak_gold", "halfway", "target_reached", "overachiever", "perfect_week", "challenge_completed", "early_finish"] as AchievementType[]).map((t) => {
    const i = achievementInfo(t);
    return [t, `${i.emoji} ${i.title}`];
  }),
);
