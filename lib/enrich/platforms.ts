export type PlatformCompany = {
  source: "alibaba" | "madeInChina" | "indiamart";
  name: string;
  products?: string[];
  emails?: string[];
  phones?: string[];
  website?: string;
  location?: string;
};

type SearchItem = { title: string; link: string; displayLink: string; snippet?: string; homepage?: string };

import { searchWeb } from "./web";

/**
 * Мінімальний пошук компаній за назвою на платформах.
 * Повертаємо по кілька верхніх збігів, з тайм-аутом на джерело.
 */
export async function findPlatformsByName(
  name: string,
  enabled: { alibaba: boolean; madeInChina: boolean; indiamart: boolean },
  timeoutMs: number
): Promise<PlatformCompany[]> {
  const tasks: Array<Promise<PlatformCompany[]>> = [];

  function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return new Promise((resolve, reject) => {
      p.then(v => { clearTimeout(t); resolve(v); }).catch(err => { clearTimeout(t); reject(err); });
    });
  }

  async function run(source: PlatformCompany["source"], site: string): Promise<PlatformCompany[]> {
    try {
      const q = `site:${site} ${name}`;
      const res = await searchWeb(q, 5, 1); // 5 результатів достатньо
      const items = (res?.items ?? []) as SearchItem[];
      return items.slice(0, 3).map(it => ({
        source,
        name: it.title || name,
        website: it.homepage || it.link,
      }));
    } catch {
      return [];
    }
  }

  if (enabled.alibaba) tasks.push(withTimeout(run("alibaba", "alibaba.com"), timeoutMs).catch(() => []));
  if (enabled.madeInChina) tasks.push(withTimeout(run("madeInChina", "made-in-china.com"), timeoutMs).catch(() => []));
  if (enabled.indiamart) tasks.push(withTimeout(run("indiamart", "indiamart.com"), timeoutMs).catch(() => []));
  if (!tasks.length) return [];

  const results = await Promise.all(tasks);
  return results.flat();
}
