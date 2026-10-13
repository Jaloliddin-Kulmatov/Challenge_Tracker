import type { Category, TargetRule, TrackingMethod } from "./types";

export interface UnitPreset {
  unit: string;
  label: string;
  decimals: number;
}

export const UNIT_PRESETS: UnitPreset[] = [
  { unit: "km", label: "Kilometres (km)", decimals: 1 },
  { unit: "mi", label: "Miles (mi)", decimals: 1 },
  { unit: "min", label: "Minutes (min)", decimals: 0 },
  { unit: "h", label: "Hours (h)", decimals: 1 },
  { unit: "pages", label: "Pages", decimals: 0 },
  { unit: "reps", label: "Repetitions", decimals: 0 },
  { unit: "steps", label: "Steps", decimals: 0 },
  { unit: "glasses", label: "Glasses of water", decimals: 0 },
  { unit: "kcal", label: "Calories (kcal)", decimals: 0 },
  { unit: "words", label: "Words", decimals: 0 },
  { unit: "$", label: "Money ($)", decimals: 2 },
];

export interface ChallengeTemplate {
  id: string;
  name: string;
  description: string;
  category: Category;
  trackingMethod: TrackingMethod;
  unit: string | null;
  valueDecimals: number;
  durationDays: number;
  rule: Omit<TargetRule, "effectiveFrom">;
}

const blank = { weekdays: [], sessionTarget: null, weeklyTarget: null, weekdayTargets: null, totalTarget: null };

export const TEMPLATES: ChallengeTemplate[] = [
  {
    id: "run-100k",
    name: "Run 100 km in 30 days",
    description: "Three runs a week, building to a hundred kilometres.",
    category: "fitness",
    trackingMethod: "quantity",
    unit: "km",
    valueDecimals: 1,
    durationDays: 30,
    rule: { ...blank, frequency: "weekly_days", weekdays: [2, 4, 6], weeklyTarget: 24 },
  },
  {
    id: "study-2h",
    name: "Study 2 hours every day",
    description: "Protect two focused hours each day for exam preparation.",
    category: "study",
    trackingMethod: "quantity",
    unit: "min",
    valueDecimals: 0,
    durationDays: 60,
    rule: { ...blank, frequency: "daily", sessionTarget: 120 },
  },
  {
    id: "read-20",
    name: "Read 20 pages a day",
    description: "A small daily reading habit.",
    category: "study",
    trackingMethod: "quantity",
    unit: "pages",
    valueDecimals: 0,
    durationDays: 30,
    rule: { ...blank, frequency: "daily", sessionTarget: 20 },
  },
  {
    id: "workout-4x",
    name: "Work out 4× a week",
    description: "Four workout sessions every week – just tick them off.",
    category: "fitness",
    trackingMethod: "completion",
    unit: null,
    valueDecimals: 0,
    durationDays: 56,
    rule: { ...blank, frequency: "weekly_days", weekdays: [1, 2, 4, 6], weeklyTarget: 4 },
  },
  {
    id: "meditate",
    name: "Meditate every day",
    description: "No numbers – did you do it today?",
    category: "mindfulness",
    trackingMethod: "completion",
    unit: null,
    valueDecimals: 0,
    durationDays: 21,
    rule: { ...blank, frequency: "daily", sessionTarget: 1 },
  },
  {
    id: "steps-weekly",
    name: "70,000 steps a week",
    description: "Hit a weekly step goal on whichever days suit you.",
    category: "health",
    trackingMethod: "quantity",
    unit: "steps",
    valueDecimals: 0,
    durationDays: 42,
    rule: { ...blank, frequency: "weekly_flexible", weeklyTarget: 70000 },
  },
  {
    id: "write-30k",
    name: "Write 30,000 words in 60 days",
    description: "One big overall target, no fixed schedule.",
    category: "creative",
    trackingMethod: "quantity",
    unit: "words",
    valueDecimals: 0,
    durationDays: 60,
    rule: { ...blank, frequency: "total", totalTarget: 30000 },
  },
];
