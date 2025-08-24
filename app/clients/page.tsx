"use client";

import { useCRM } from "@/hooks/use-crm";

export default function Page() {
  const { items, remove } = useCRM();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Clients (CRM)</h1>

      {items.length === 0 ? (
        <div className="rounded-xl bg-[var(--card)] p-4 border border-white/10 text-[var(--muted)]">
          Поки порожньо. Додай клієнтів зі сторінки <b>/searches</b>.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((cl) => (
            <li key={cl.id} className="rounded-xl bg-[var(--card)] p-4 border border-white/10">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <a href={cl.url} target="_blank" rel="noreferrer" className="text-lg font-medium hover:underline">
                    {cl.domain}
                  </a>
                  <div className="text-xs text-[var(--muted)] mt-1">
                    {new Date(cl.addedAt).toLocaleString()} • {cl.source ?? "manual"}
                  </div>
                  <div className="text-sm mt-1 text-white/90">{cl.title}</div>
                </div>
                <button
                  onClick={() => remove(cl.id)}
                  className="rounded-md text-sm px-3 py-1.5 border border-white/10 hover:bg-white/10"
                >
                  Видалити
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
