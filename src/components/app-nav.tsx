"use client";
import { CalendarCheck, LayoutList, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Today", icon: CalendarCheck },
  { href: "/challenges", label: "Challenges", icon: LayoutList },
  { href: "/challenges/new", label: "New", icon: Plus },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(path: string, href: string) {
  if (href === "/challenges") return path === "/challenges" || (path.startsWith("/challenges/") && !path.startsWith("/challenges/new"));
  return path === href || path.startsWith(href + "/");
}

export function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur md:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(path, href);
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium", active ? "text-primary" : "text-muted")}>
                <Icon className="size-5" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function TopNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {items.map(({ href, label }) => {
        const active = isActive(path, href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("rounded-lg px-3 py-2 text-sm font-medium", active ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface-2")}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
