// lib/db.ts
import { neon } from "@neondatabase/serverless";

// Лінива ініціалізація: створюємо клієнт у хендлері
export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DATABASE_URL");
  return neon(url);
}
