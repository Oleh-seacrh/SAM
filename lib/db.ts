// lib/db.ts
import { neon } from "@neondatabase/serverless";

/** Lazy singleton для Neon sql */
let _sql: any;
export function getSql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Missing DATABASE_URL");
    _sql = neon(url);
  }
  return _sql;
}

/** Back-compat: тег-функція sql (працює як await sql`...`) */
export const sql: any = (...args: any[]) => getSql()(...args);

/** Построїти літерал Postgres text[] з масиву рядків. Повертає null для порожніх. */
export function toPgTextArray(arr?: Array<string | null | undefined> | null): string | null {
  if (!arr || !arr.length) return null;
  const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const items = arr
    .filter((v): v is string => v != null && String(v).length > 0)
    .map((v) => `"${esc(String(v))}"`);
  return `{${items.join(",")}}`;
}
