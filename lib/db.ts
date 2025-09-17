import { neon } from "@neondatabase/serverless";

/** Повертає singleton sql-тег від Neon */
let _sql: any;
export function getSql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Missing DATABASE_URL");
    _sql = neon(url);
  }
  return _sql;
}

/** Back-compat: дехто імпортує { sql } напряму */
export const sql = getSql();

/**
 * Перетворює масив JS у літерал Postgres text[].
 * Повертає null, якщо масив порожній/невизначений — тоді в БД запишеться NULL.
 * Приклад: toPgTextArray(['a','b']) -> {"a","b"}
 */
export function toPg
