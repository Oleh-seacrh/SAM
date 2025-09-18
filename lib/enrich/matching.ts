import { stripLegal } from "./normalize";

export function nameSimilarity(a: string, b: string): number {
  a = stripLegal(a.toLowerCase());
  b = stripLegal(b.toLowerCase());
  // Спрощена евристика як заглушка (потім підключиш JW/rapidfuzz)
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.87;
  return 0.7;
}
