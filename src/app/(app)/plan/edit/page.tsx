import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PlanEditor } from "@/components/plan/plan-editor";
import { requireCtx } from "@/lib/auth/session";
import { contentOf } from "@/lib/plan/content";
import { getPlanData } from "@/lib/services/plan";

export const metadata: Metadata = { title: "Edit plan" };
export const dynamic = "force-dynamic";

export default async function EditPlanPage() {
  const { ctx } = await requireCtx();
  const data = await getPlanData(ctx);
  if (!data) redirect("/plan");
  return <PlanEditor templateKey={data.templateKey} title={data.template.title} initial={contentOf(data.template)} schedule={data.template.schedule} edited={data.edited} />;
}
