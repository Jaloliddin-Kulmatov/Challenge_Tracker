import { CalendarCheck, LineChart, Repeat, Share2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const features = [
  { icon: Repeat, title: "Any challenge", text: "Distance, pages, minutes, reps – or just done / not done. Daily, specific weekdays, a weekly total, or one big goal." },
  { icon: CalendarCheck, title: "Automatic schedule", text: "Your targets become a plan. Move, skip or add sessions; change future targets without touching your history." },
  { icon: LineChart, title: "Honest statistics", text: "Progress, pace, streaks, missed sessions and charts – always derived from what you actually logged." },
  { icon: Share2, title: "Share your progress", text: "Send a read-only link to a friend or coach. Revoke it any time." },
];

export default async function Home() {
  if (await getSessionUser()) redirect("/dashboard");
  return (
    <main className="mx-auto max-w-3xl px-5 py-14">
      <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Set a goal. Log it. See it through.</h1>
      <p className="mt-4 max-w-xl text-lg text-muted">A flexible tracker for running, studying, working out, reading – any challenge you can describe. Built to be used one-handed, mid-run.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/signup" className={cn(buttonVariants({ size: "lg" }))}>Get started – it&apos;s free</Link>
        <Link href="/login" className={cn(buttonVariants({ size: "lg", variant: "outline" }))}>Log in</Link>
      </div>
      <ul className="mt-14 grid gap-4 sm:grid-cols-2">
        {features.map(({ icon: Icon, title, text }) => (
          <li key={title} className="rounded-2xl border border-border bg-surface p-5">
            <Icon className="mb-3 size-6 text-primary" aria-hidden />
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted">{text}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
