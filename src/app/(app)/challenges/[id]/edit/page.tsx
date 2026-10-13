import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EditChallenge } from "@/components/edit-challenge";
import { requireCtx } from "@/lib/auth/session";
import { getChallengeDetail } from "@/lib/services/challenges";

export const metadata: Metadata = { title: "Edit challenge" };
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { ctx } = await requireCtx();
  const d = await getChallengeDetail(ctx, id);
  if (!d) notFound();
  if (d.challenge.status === "completed" || d.challenge.status === "archived") redirect(`/challenges/${id}`);
  const started = d.progress.phase !== "upcoming";
  return (
    <div className="mx-auto max-w-2xl space-y-5" data-accent={d.challenge.color}>
      <Link href={`/challenges/${id}`} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-muted"><ArrowLeft className="size-4" /> Back to challenge</Link>
      <h1 className="text-2xl font-bold tracking-tight">Edit “{d.challenge.title}”</h1>
      <EditChallenge challenge={d.challenge} rule={d.currentRule} today={d.progress.today} started={started} hasLogs={d.logs.length > 0} />
    </div>
  );
}
