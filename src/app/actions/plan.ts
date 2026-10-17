"use server";
import * as plan from "@/lib/services/plan";
import { run } from "./util";

export const startPlanAction = async (templateKey?: string) => run((ctx) => plan.startPlan(ctx, templateKey));
// Ticks and numbers are kept in client state, so these don't revalidate the page.
export const setCheckAction = async (raw: unknown) => run((ctx) => plan.setCheck(ctx, raw), { revalidate: false });
export const saveMetricsAction = async (raw: unknown) => run((ctx) => plan.saveMetrics(ctx, raw), { revalidate: false });
