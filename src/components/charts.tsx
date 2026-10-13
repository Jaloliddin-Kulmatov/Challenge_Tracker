"use client";
import * as React from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DayPoint, WeekPoint } from "@/lib/core/progress";
import { formatDateShort } from "@/lib/core/dates";
import { formatNumber } from "@/lib/core/format";

const ACTUAL = "var(--chart-actual)";
const PLAN = "var(--chart-plan)";
const GRID = "var(--chart-grid)";
const AXIS = { fontSize: 12, fill: "var(--muted)" } as const;

function TooltipBox({ active, payload, label, unit, decimals, title }: {
  active?: boolean; payload?: { name?: string; value?: number | null; color?: string }[]; label?: string; unit: string; decimals: number; title: (l: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-sm shadow-lg">
      <div className="mb-1 font-semibold">{title(String(label))}</div>
      {payload.filter((p) => p.value !== null && p.value !== undefined).map((p) => (
        <div key={p.name} className="flex items-center gap-2 tabular">
          <span className="inline-block size-2.5 rounded-full" style={{ background: p.color }} aria-hidden />
          <span className="text-muted">{p.name}</span>
          <span className="ml-auto pl-4 font-semibold">{formatNumber(Number(p.value), decimals)} {unit}</span>
        </div>
      ))}
    </div>
  );
}

function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="min-h-9 cursor-pointer py-1.5 font-medium text-primary">View as table</summary>
      <div className="max-h-64 overflow-auto rounded-xl border border-border">
        <table className="w-full text-left tabular">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-surface-2"><tr>{head.map((h) => <th key={h} scope="col" className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-border">{r.map((c, j) => <td key={j} className="px-3 py-1.5">{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}

/** Cumulative logged vs planned over the whole challenge. */
export function ProgressChart({ daily, today, unit, decimals }: { daily: DayPoint[]; today: string; unit: string; decimals: number }) {
  const data = daily.map((d) => ({ date: d.date, Logged: d.cumulativeLogged, Plan: d.cumulativePlanned }));
  const showToday = today >= daily[0]!.date && today <= daily.at(-1)!.date;
  return (
    <div>
      <div className="h-60 w-full" role="img" aria-label="Line chart of cumulative amount logged compared with the plan">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="date" tick={AXIS} tickFormatter={formatDateShort} interval="preserveStartEnd" minTickGap={40} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} width={44} axisLine={false} tickLine={false} tickFormatter={(v) => formatNumber(Number(v), 0)} />
            <Tooltip content={<TooltipBox unit={unit} decimals={decimals} title={(l) => formatDateShort(l)} />} />
            <Legend verticalAlign="top" height={28} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
            {showToday && <ReferenceLine x={today} stroke={PLAN} strokeDasharray="2 3" />}
            <Line name="Plan" type="monotone" dataKey="Plan" stroke={PLAN} strokeWidth={2} strokeDasharray="6 4" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            <Line name="Logged" type="monotone" dataKey="Logged" stroke={ACTUAL} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <DataTable
        caption="Cumulative progress by day"
        head={["Date", `Logged (${unit})`, `Plan (${unit})`]}
        rows={daily.filter((d) => d.cumulativeLogged !== null).slice(-60).map((d) => [d.date, d.cumulativeLogged ?? "", formatNumber(d.cumulativePlanned, decimals)])}
      />
    </div>
  );
}

/** Logged vs planned per ISO week. */
export function WeeklyChart({ weekly, unit, decimals }: { weekly: WeekPoint[]; unit: string; decimals: number }) {
  const data = weekly.map((w) => ({ week: w.weekStart, Logged: w.logged, Plan: w.planned }));
  return (
    <div>
      <div className="h-56 w-full" role="img" aria-label="Bar chart of amount logged each week compared with the plan">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="week" tick={AXIS} tickFormatter={formatDateShort} interval="preserveStartEnd" minTickGap={24} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} width={44} axisLine={false} tickLine={false} tickFormatter={(v) => formatNumber(Number(v), 0)} />
            <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<TooltipBox unit={unit} decimals={decimals} title={(l) => `Week of ${formatDateShort(l)}`} />} />
            <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12 }} />
            <Bar name="Logged" dataKey="Logged" fill={ACTUAL} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
            <Line name="Plan" type="stepAfter" dataKey="Plan" stroke={PLAN} strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3, fill: PLAN, stroke: "var(--surface)", strokeWidth: 2 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <DataTable caption="Progress by week" head={["Week of", `Logged (${unit})`, `Plan (${unit})`, "Sessions done"]} rows={weekly.map((w) => [w.weekStart, w.logged, w.planned, `${w.sessionsCompleted}/${w.sessionsCounted}`])} />
    </div>
  );
}
