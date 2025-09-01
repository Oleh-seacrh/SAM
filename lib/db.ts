// lib/db.ts
import { neon } from "@neondatabase/serverless";

/**
 * Лінива ініціалізація клієнта Neon.
 * Викликаємо getSql() у кожному handler’і.
 */
export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Missing DATABASE_URL");
  }
  return neon(url);
}
