// server-only
import { neon } from "@neondatabase/serverless";

export function getSql() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("Missing DATABASE_URL/POSTGRES_URL");
  return neon(url);
}

// helper: JS string[] -> Postgres text[] literal safely
export function toPgTextArray(arr: string[]) {
  const safe = (s: string) => `"${s.replace(/"/g, '\\"')}"`;
  return `{${(arr || []).map(safe).join(",")}}`;
}
