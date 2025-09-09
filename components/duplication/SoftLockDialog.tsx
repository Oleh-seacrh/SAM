"use client";
import Link from "next/link";
import { useEffect } from "react";

type Candidate = {
  id: string | number;
  name: string;
  domain?: string | null;
  country?: string | null;
  org_type?: string | null;
  match?: { domain_exact?: boolean; name_exact?: boolean; name_partial?: boolean; via_email?: string | null };
};

export default function SoftLockDialog({
  open,
  candidates,
  onClose,
  onCreateAnyway,
}: {
  open: boolean;
  candidates: Candidate[];
  onClose: () => void;
  onCreateAnyway: () => void;
}) {
  useEffect(() => {
    // блокуємо scroll фону, коли відкрито
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      {/* overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* modal */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-xl rounded-2xl bg-neutral-900 border border-neutral-700 shadow-2xl">
          <div className="px-5 py-4 border-b border-neutral-800">
            <h3 className="text-lg font-semibold">Possible duplicates found</h3>
            <p className="text-sm text-neutral-400">We detected similar organizations by domain, name or email.</p>
          </div>

          <div className="p-5 space-y-3 max-h-[60vh] overflow-auto">
            {candidates.length === 0 ? (
              <div className="text-sm text-neutral-400">No candidates.</div>
            ) : (
              <ul className="space-y-2">
                {candidates.map((o) => (
                  <li key={o.id} className="rounded-xl border border-neutral-800 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{o.name}</div>
                        <div className="text-xs text-neutral-400">
                          {o.domain ? o.domain : "—"} • {o.country ?? "—"} • {o.org_type ?? "—"}
                          {o.match?.via_email ? ` • via ${o.match.via_email}` : ""}
                          {o.match?.domain_exact ? " • domain exact" : ""}
                          {o.match?.name_exact ? " • name exact" : ""}
                        </div>
                      </div>
                      <Link href={`/orgs/${o.id}`} className="text-sm underline hover:no-underline" target="_blank">
                        Open existing
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="px-5 py-4 flex items-center justify-end gap-2 border-t border-neutral-800">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-neutral-700">
              Cancel
            </button>
            <button
              onClick={onCreateAnyway}
              className="px-4 py-2 rounded-xl bg-white text-black font-medium"
            >
              Create anyway
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
