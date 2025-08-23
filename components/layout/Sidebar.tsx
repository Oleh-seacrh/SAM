"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const items = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/searches", label: "Searches" },
  { href: "/results", label: "Results" },
  { href: "/analysis", label: "Analysis" },
  { href: "/email", label: "Email" },
  { href: "/clients", label: "Clients" },
  { href: "/settings", label: "Settings" }
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-60 border-r border-white/10 bg-[var(--card)]">
      <div className="h-14 flex items-center px-4 text-lg font-semibold">SAM</div>
      <nav className="px-2 pb-4 space-y-1">
        {items.map((it) => {
          const active = pathname?.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={clsx(
                "block rounded-md px-3 py-2 text-sm hover:bg-white/5",
                active ? "bg-white/10" : "text-[var(--muted)]"
              )}
            >
              {it.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
