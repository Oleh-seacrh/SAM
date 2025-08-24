// /components/ui/Badge.tsx
"use client";
export function Badge({ tone, children }: { tone: "good" | "maybe" | "bad"; children: any }) {
  const cls =
    tone === "good"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : tone === "maybe"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
      : "border-rose-500/40 bg-rose-500/10 text-rose-300";
  return <span className={`text-xs rounded-md px-2 py-1 border ${cls}`}>{children}</span>;
}
