"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import TranslateButton from "@/components/TranslateButton";
const items = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tasks", label: "Tasks" },
  { href: "/searches", label: "Searches" },
  { href: "/results", label: "Results" },
  { href: "/analysis", label: "Analysis" },
  { href: "/collect", label: "Collect" },
  { href: "/clients", label: "Clients" },
  { href: "/settings", label: "Settings" }
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-60 border-r border-white/10 bg-[var(--card)]">
      {/* шапка сайдбару з кнопкою перекладу праворуч */}
      <div className="h-14 flex items-center justify-between px-4">
        <span className="text-lg font-semibold">SAM</span>
        <TranslateButton />
      </div>

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
