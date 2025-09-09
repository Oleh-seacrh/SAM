"use client";
import Link from "next/link";

export default function DuplicateBanner({ items, onOverride }: {
  items: Array<{ id: number; name: string; domain?: string | null; via?: string }>;
  onOverride: () => void;
}) {
  if (!items?.length) return null;
  return (
    <div className="rounded-2xl border p-4 space-y-3 bg-yellow-50">
      <div className="text-sm font-medium">Possible duplicates found:</div>
      <ul className="list-disc pl-5 text-sm space-y-1">
        {items.map((o) => (
          <li key={o.id}>
            <Link className="underline" href={`/orgs/${o.id}`} target="_blank">
              {o.name}
            </Link>
            {o.domain ? ` • ${o.domain}` : ""}
            {o.via ? ` • via ${o.via}` : ""}
          </li>
        ))}
      </ul>
      <button type="button" className="px-3 py-1 rounded-xl border" onClick={onOverride}>
        Create anyway
      </button>
    </div>
  );
}
