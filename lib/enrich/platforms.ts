export type PlatformCompany = {
  source: "alibaba" | "madeInChina" | "indiamart" | "facebook" | "linkedin";
  name: string;
  products?: string[];
  emails?: string[];
  phones?: string[];
  website?: string;
  location?: string;
};

type SearchItem = { title: string; link: string; displayLink: string; snippet?: string; homepage?: string };

import { searchWeb } from "./web";
import { parsePage } from "../crawl/parsePage";

/**
 * Покращений пошук на платформах з множинними запитами та парсингом сторінок
 */
export async function findPlatformsByName(
  name: string,
  enabled: { alibaba: boolean; madeInChina: boolean; indiamart: boolean },
  timeoutMs: number,
  options?: {
    email?: string;
    phone?: string;
    parsePage?: boolean; // Чи парсити знайдені сторінки для витягування контактів
  }
): Promise<PlatformCompany[]> {
  const tasks: Array<Promise<PlatformCompany[]>> = [];

  function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return new Promise((resolve, reject) => {
      p.then(v => { clearTimeout(t); resolve(v); }).catch(err => { clearTimeout(t); reject(err); });
    });
  }

  async function run(
    source: PlatformCompany["source"],
    site: string,
    platformName: string
  ): Promise<PlatformCompany[]> {
    try {
      // Множинні запити для кращого покриття
      const queries = [];
      
      // 1. Назва + платформа
      if (name) {
        queries.push(`site:${site} "${name}"`);
        queries.push(`site:${site} ${name}`);
      }
      
      // 2. Email + платформа
      if (options?.email) {
        queries.push(`site:${site} "${options.email}"`);
      }
      
      // 3. Телефон + платформа
      if (options?.phone) {
        const cleanPhone = options.phone.replace(/\D/g, '');
        if (cleanPhone.length >= 8) {
          queries.push(`site:${site} "${cleanPhone}"`);
        }
      }

      const allResults: PlatformCompany[] = [];
      const seenUrls = new Set<string>();

      // Виконуємо всі запити паралельно
      const searchResults = await Promise.all(
        queries.slice(0, 3).map(q => // Максимум 3 запити щоб не перевантажити
          searchWeb(q, 3, 1).catch(() => null)
        )
      );

      for (const res of searchResults) {
        if (!res?.items) continue;
        const items = res.items as SearchItem[];

        for (const item of items.slice(0, 2)) {
          const url = item.link || item.homepage;
          if (!url || seenUrls.has(url)) continue;
          seenUrls.add(url);

          const company: PlatformCompany = {
            source,
            name: item.title || name,
            website: url,
          };

          // Якщо потрібно парсити сторінку
          if (options?.parsePage && url) {
            try {
              const pageData = await parsePage(url, { timeout: 5000 });
              if (pageData) {
                company.emails = pageData.emails || [];
                company.phones = pageData.phones || [];
                company.location = pageData.country || undefined;
              }
            } catch (e) {
              console.warn(`Failed to parse ${url}:`, e);
            }
          }

          allResults.push(company);
        }
      }

      return allResults.slice(0, 3); // Максимум 3 результати
    } catch (e) {
      console.error(`Platform search error for ${site}:`, e);
      return [];
    }
  }

  if (enabled.alibaba) {
    tasks.push(withTimeout(run("alibaba", "alibaba.com", "Alibaba"), timeoutMs).catch(() => []));
  }
  if (enabled.madeInChina) {
    tasks.push(withTimeout(run("madeInChina", "made-in-china.com", "Made-in-China"), timeoutMs).catch(() => []));
  }
  if (enabled.indiamart) {
    tasks.push(withTimeout(run("indiamart", "indiamart.com", "IndiaMART"), timeoutMs).catch(() => []));
  }
  
  if (!tasks.length) return [];

  const results = await Promise.all(tasks);
  return results.flat();
}

/**
 * Пошук на соціальних мережах (Facebook, LinkedIn)
 */
export async function findSocialMedia(
  name: string,
  options?: {
    email?: string;
    domain?: string;
  }
): Promise<{ facebook?: string; linkedin?: string }> {
  const result: { facebook?: string; linkedin?: string } = {};

  try {
    // LinkedIn пошук
    const linkedinQueries = [];
    if (name) linkedinQueries.push(`site:linkedin.com/company "${name}"`);
    if (options?.domain) linkedinQueries.push(`site:linkedin.com/company "${options.domain}"`);
    
    if (linkedinQueries.length) {
      const linkedinRes = await searchWeb(linkedinQueries[0], 1, 1).catch(() => null);
      if (linkedinRes?.items?.[0]?.link) {
        result.linkedin = linkedinRes.items[0].link;
      }
    }

    // Facebook пошук
    const facebookQueries = [];
    if (name) facebookQueries.push(`site:facebook.com "${name}"`);
    if (options?.email) {
      const emailDomain = options.email.split('@')[1];
      if (emailDomain) facebookQueries.push(`site:facebook.com "${emailDomain}"`);
    }
    
    if (facebookQueries.length) {
      const facebookRes = await searchWeb(facebookQueries[0], 1, 1).catch(() => null);
      if (facebookRes?.items?.[0]?.link) {
        result.facebook = facebookRes.items[0].link;
      }
    }
  } catch (e) {
    console.error('Social media search error:', e);
  }

  return result;
}
