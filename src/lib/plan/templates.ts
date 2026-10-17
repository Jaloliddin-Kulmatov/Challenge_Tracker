import { MALAYSIA_SEM4 } from "./malaysia-semester4";
import type { PlanTemplate } from "./types";

export const PLAN_TEMPLATES: Record<string, PlanTemplate> = {
  [MALAYSIA_SEM4.key]: MALAYSIA_SEM4,
};
export const DEFAULT_PLAN_KEY = MALAYSIA_SEM4.key;

export function getTemplate(key: string): PlanTemplate | null {
  return PLAN_TEMPLATES[key] ?? null;
}
