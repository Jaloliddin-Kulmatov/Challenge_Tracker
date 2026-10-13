import { Check } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getSessionUser()) redirect("/dashboard");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-bold tracking-tight">
        <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-fg"><Check className="size-5" aria-hidden /></span>
        Challenge Tracker
      </Link>
      <div className="rounded-3xl border border-border bg-surface p-6 shadow-sm">{children}</div>
    </main>
  );
}
