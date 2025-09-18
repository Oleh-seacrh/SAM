export function nameSimilarity(a: string, b: string): number {
  a = stripLegal(a.toLowerCase()); b = stripLegal(b.toLowerCase());
  // Дуже проста JW-заглушка; заміниш на твою реалізацію або lib
  return a === b ? 1 : (a.includes(b) || b.includes(a)) ? 0.85 : 0.7;
}
