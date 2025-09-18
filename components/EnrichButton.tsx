"use client";
import { useState } from "react";

export function EnrichButton({ input }: { input: string }) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<any>(null);

  async function run() {
    setLoading(true);
    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ input })
      }).then(r => r.json());
      setPreview(res);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button onClick={run} className="px-3 py-2 rounded-md bg-white/10 hover:bg-white/20" disabled={loading}>
        {loading ? "Enriching..." : "Enrich"}
      </button>
      {preview && (
        <div className="text-xs whitespace-pre-wrap bg-black/30 p-3 rounded">
          <div className="font-semibold mb-1">Trace</div>
          {preview.trace?.map((t: string, i: number) => <div key={i}>• {t}</div>)}
          <div className="mt-2 font-semibold">Organization</div>
          <div>Name: {preview.organization?.name || "-"}</div>
          <div>Domain: {preview.organization?.domain || "-"}</div>
          <div>Status: {preview.status}</div>
        </div>
      )}
    </div>
  );
}
