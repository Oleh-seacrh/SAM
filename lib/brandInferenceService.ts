import type { InferenceInput, BrandMatch } from "@/lib/brand";

export async function inferBrandsClient(input: InferenceInput): Promise<BrandMatch[]> {
  const res = await fetch("/api/brand-inference", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    let j: any = {};
    try { j = await res.json(); } catch {}
    throw new Error(j?.error || `HTTP ${res.status}`);
  }
  const j = await res.json();
  return Array.isArray(j?.matches) ? j.matches : [];
}
