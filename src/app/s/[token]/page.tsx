import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProgressChart, WeeklyChart } from "@/components/charts";
import { Badge, Card, CardTitle, ProgressBar, Stat } from "@/components/ui/card";
import { formatDateShort } from "@/lib/core/dates";
import { formatNumber, formatValue } from "@/lib/core/format";
import { getDb } from "@/lib/db/client";
import { getSharedChallenge } from "@/lib/services/shares";
import { CATEGORY_EMOJI, CATEGORY_LABEL, PHASE_LABEL, PHASE_TONE, unitOf } from "@/lib/ui-helpers";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shared challenge", robots: { index: false, follow: false } };

export default async function SharedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const shared = await getSharedChallenge(getDb(), token, new Date());
  if (!shared) notFound();
  const { challenge: c, progress: p } = shared;
  const fmt = (n: number) => formatValue(n, c.unit, c.trackingMethod, c.valueDecimals);
  const unit = unitOf(c) || "times";
  return (
    <main data-accent={c.color} className="mx-auto max-w-3xl space-y-5 px-4 py-8">
      <p className="text-sm text-muted">Shared by <strong>{shared.ownerName}</strong> · read-only</p>
      <header className="space-y-2">
        <div className="flex flex-wrap gap-2"><Badge>{CATEGORY_EMOJI[c.category]} {CATEGORY_LABEL[c.category]}</Badge><Badge tone={PHASE_TONE[p.phase]}>{PHASE_LABEL[p.phase]}</Badge></div>
        <h1 className="text-3xl font-bold tracking-tight">{c.title}</h1>
        {c.description && <p className="whitespace-pre-wrap text-muted">{c.description}</p>}
        <p className="text-sm text-muted">{formatDateShort(c.startDate)} → {formatDateShort(c.endDate)}</p>
      </header>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Statistics">
        <Stat label="Progress" value={fmt(p.totalLogged)} hint={<><ProgressBar value={p.goalPercentCapped} className="mb-1 mt-1" label="Progress" />{formatNumber(p.goalPercent, 1)}% of {fmt(p.totalTarget)}</>} />
        <Stat label="Streak" value={p.streak.current} hint={`${p.streak.unit} · best ${p.streak.longest}`} />
        <Stat label="Sessions" value={p.sessionsCounted ? `${p.sessionsCompleted}/${p.sessionsCounted}` : "–"} hint={p.adherencePercent !== null ? `${p.adherencePercent}% adherence` : undefined} />
        <Stat label="Days" value={`${p.daysElapsed}/${p.daysTotal}`} hint={p.pace ? (p.pace === "ahead" ? "Ahead of plan" : p.pace === "behind" ? "Behind plan" : "On track") : undefined} />
      </section>
      <Card><CardTitle>Progress vs plan</CardTitle><div className="mt-3"><ProgressChart daily={p.daily} today={new Date().toISOString().slice(0, 10)} unit={unit} decimals={c.valueDecimals} /></div></Card>
      {p.weekly.length > 1 && <Card><CardTitle>Week by week</CardTitle><div className="mt-3"><WeeklyChart weekly={p.weekly} unit={unit} decimals={c.valueDecimals} /></div></Card>}
      {shared.notes.length > 0 && (
        <Card>
          <CardTitle>Notes</CardTitle>
          <ul className="mt-3 space-y-2 text-sm">{shared.notes.map((n, i) => <li key={i}><span className="text-muted">{formatDateShort(n.date)}</span> – {n.text}</li>)}</ul>
        </Card>
      )}
      <p className="pt-4 text-center text-sm text-muted">Track your own goals with <Link href="/signup" className="font-semibold text-primary">Challenge Tracker</Link>.</p>
    </main>
  );
}
