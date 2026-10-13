import type { ChallengeView } from "@/lib/services/types";
import type { Phase, SlotState } from "@/lib/core/progress";
import { CATEGORIES } from "@/lib/core/types";

export const CATEGORY_LABEL: Record<(typeof CATEGORIES)[number], string> = {
  fitness: "Fitness", study: "Study", work: "Work", health: "Health", mindfulness: "Mindfulness", creative: "Creative", finance: "Finance", other: "Other",
};
export const CATEGORY_EMOJI: Record<(typeof CATEGORIES)[number], string> = {
  fitness: "🏃", study: "📚", work: "💼", health: "❤️", mindfulness: "🧘", creative: "🎨", finance: "💰", other: "⭐",
};

export const PHASE_LABEL: Record<Phase, string> = {
  upcoming: "Starts soon", running: "In progress", paused: "Paused", ended: "Ended – review & finish", completed: "Completed", archived: "Archived",
};
export const PHASE_TONE: Record<Phase, "neutral" | "good" | "warn" | "bad" | "info"> = {
  upcoming: "info", running: "good", paused: "warn", ended: "warn", completed: "good", archived: "neutral",
};

export const SLOT_STATE_LABEL: Record<SlotState, string> = {
  completed: "Done", missed: "Missed", due: "Today", upcoming: "Upcoming", skipped: "Skipped", excused: "Paused", cancelled: "Cancelled",
};

export function unitOf(c: Pick<ChallengeView, "unit" | "trackingMethod">) {
  return c.trackingMethod === "completion" ? "" : (c.unit ?? "");
}
