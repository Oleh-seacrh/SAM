// lib/db.ts
import { neon } from "@neondatabase/serverless";

// Лінива ініціалізація клієнта БД
export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Missing DATABASE_URL");
  }
  return neon(url);
}
