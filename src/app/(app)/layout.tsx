import { Check } from "lucide-react";
import Link from "next/link";
import { BottomNav, TopNav } from "@/components/app-nav";
import { requireUser } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-dvh pb-24 md:pb-10">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold tracking-tight">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-fg"><Check className="size-5" aria-hidden /></span>
            <span>Challenge Tracker</span>
          </Link>
          <TopNav />
          <Link href="/settings" className="max-w-32 truncate text-sm text-muted hover:text-foreground" title={user.email}>{user.name}</Link>
        </div>
        {user.isDemo && (
          <div className="bg-warning/15 px-4 py-1.5 text-center text-xs font-semibold text-warning">
            Demo account – everything here is sample data created by the seed script, not real activity.
          </div>
        )}
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5">{children}</main>
      <BottomNav />
    </div>
  );
}
