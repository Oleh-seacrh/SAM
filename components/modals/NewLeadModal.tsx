"use client";
import { useEffect, useMemo, useState } from "react";
import SoftLockDialog from "@/components/duplication/SoftLockDialog";

function useDebounced<T>(value: T, ms = 500) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export default function NewLeadModal({ open, onClose, defaultType = "prospect" }: {
  open: boolean;
  onClose: () => void;
  defaultType?: "client" | "prospect" | "supplier";
}) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [emailsInput, setEmailsInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [dupes, setDupes] = useState<any[]>([]);
  const [softLockOpen, setSoftLockOpen] = useState(false);
  const [override, setOverride] = useState(false);

  const dName = useDebounced(name);
  const dDomain = useDebounced(domain);
  const dEmails = useDebounced(emailsInput);

  const emails = useMemo(
    () => dEmails.split(/[,\s;]+/).map(x => x.trim()).filter(Boolean),
    [dEmails]
  );

  useEffect(() => {
    if (!open) return;
    const run = async () => {
      if (!dName && !dDomain && emails.length === 0) { setDupes([]); return; }
      try {
        const params = new URLSearchParams();
        if (dName) params.set("name", dName);
        if (dDomain) params.set("domain", dDomain.toLowerCase());
        if (emails[0]) params.set("company_email", emails[0].toLowerCase());
        if (emails[1]) params.set("personal_email", emails[1].toLowerCase());
        const res = await fetch(`/api/orgs/dedupe?${params.toString()}`);
        const data = await res.json();
        setDupes(data?.duplicates ?? []);
      } catch {}
    };
    run();
  }, [open, dName, dDomain, emails]);

  const reset = () => {
    setName(""); setDomain(""); setEmailsInput("");
    setDupes([]); setOverride(false); setSoftLockOpen(false); setLoading(false);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(override ? { "x-allow-duplicate": "true" } : {}),
        },
        body: JSON.stringify({
          name: name || undefined,
          domain: domain || undefined,
          emails,
          org_type: defaultType,
        }),
      });

      if (res.status === 409) {
        const data = await res.json().catch(() => ({}));
        if (data?.error === "DUPLICATE_SOFTLOCK") {
          setDupes(data?.duplicates ?? []);
          setSoftLockOpen(true);
          setOverride(false);
          return;
        }
        if (data?.error === "DUPLICATE_HARDLOCK") {
          alert(data?.detail || "Duplicate");
          return;
        }
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data?.detail || "Error");
        return;
      }

      onClose(); reset();
      // TODO: router.refresh()
    } finally {
      setLoading(false);
    }
  };

  const onCreateAnyway = () => {
    setOverride(true);
    setSoftLockOpen(false);
    onSubmit({ preventDefault() {} } as any);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[50]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <form onSubmit={onSubmit}
          className="w-full max-w-2xl rounded-2xl bg-neutral-900 border border-neutral-700 shadow-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">New Lead</h3>
            <button type="button" onClick={onClose} className="text-neutral-400 hover:text-white">✕</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-sm">Name (optional)</span>
              <input className="w-full border border-neutral-700 bg-neutral-950 rounded-xl px-3 py-2"
                     value={name} onChange={e => setName(e.target.value)} placeholder="Acme Inc." />
            </label>

            <label className="space-y-1">
              <span className="text-sm">Website / Domain</span>
              <input className="w-full border border-neutral-700 bg-neutral-950 rounded-xl px-3 py-2"
                     value={domain} onChange={e => setDomain(e.target.value)} placeholder="acme.com" />
            </label>

            <label className="md:col-span-2 space-y-1">
              <span className="text-sm">Emails (comma/space separated)</span>
              <input className="w-full border border-neutral-700 bg-neutral-950 rounded-xl px-3 py-2"
                     value={emailsInput} onChange={e => setEmailsInput(e.target.value)}
                     placeholder="info@acme.com, sales@acme.com" />
            </label>
          </div>

          {dupes.length > 0 && (
            <div className="rounded-xl border border-yellow-600/40 bg-yellow-500/10 px-3 py-2 text-sm">
              {dupes.length} potential duplicate{dupes.length > 1 ? "s" : ""} found.
              <button type="button" className="underline ml-2" onClick={() => setSoftLockOpen(true)}>
                Review
              </button>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-neutral-700">Cancel</button>
            <button disabled={loading} className="px-4 py-2 rounded-xl bg-white text-black font-medium disabled:opacity-50">
              {loading ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>

      <SoftLockDialog
        open={softLockOpen}
        candidates={dupes}
        onClose={() => setSoftLockOpen(false)}
        onCreateAnyway={onCreateAnyway}
      />
    </div>
  );
}
