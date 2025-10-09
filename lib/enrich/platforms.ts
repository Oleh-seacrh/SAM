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
 * Витягує company URL з Alibaba product page
 */
async function extractCompanyFromProductPage(productUrl: string): Promise<string | null> {
  try {
    console.log("[extractCompanyFromProductPage] Fetching:", productUrl);
    
    const res = await fetch(productUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000) // 10s timeout
    });
    
    if (!res.ok) {
      console.error("[extractCompanyFromProductPage] HTTP error:", res.status);
      return null;
    }
    
    const html = await res.text();
    
    // Шукаємо посилання на company/store
    // Alibaba має різні формати:
    // 1. /company/profile-XXXXX.html
    // 2. supplier.alibaba.com
    // 3. /shop/XXXXX.html
    
    const patterns = [
      // Найпопулярніший формат: subdomain.alibaba.com
      /https?:\/\/([a-z0-9-]+)\.alibaba\.com/i,
      // Company profile
      /href=["']?(\/company\/[^"'\s>]+)/i,
      // Shop
      /href=["']?(\/shop\/[^"'\s>]+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        let url = match[0];
        
        // Якщо це relative URL - додаємо домен
        if (url.startsWith('/')) {
          url = `https://www.alibaba.com${url}`;
        }
        
        // Перевіряємо що це дійсно company/shop, а не product
        if (!url.includes('/product-detail/')) {
          console.log("[extractCompanyFromProductPage] Found company URL:", url);
          return url;
        }
      }
    }
    
    console.log("[extractCompanyFromProductPage] No company URL found in product page");
    return null;
    
  } catch (e) {
    console.error("[extractCompanyFromProductPage] Error:", e);
    return null;
  }
}

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
    // LinkedIn пошук - СПРОЩЕНИЙ: просто "Company Name LinkedIn"
    if (name) {
      const linkedinRes = await searchWeb(`"${name}" LinkedIn`, 3, 1).catch(() => null);
      if (linkedinRes?.items) {
        // Шукаємо перше посилання на linkedin.com/company
        const linkedinLink = linkedinRes.items.find(item => 
          item.link.includes('linkedin.com/company') || 
          item.link.includes('linkedin.com/school')
        );
        if (linkedinLink) {
          result.linkedin = linkedinLink.link;
        }
      }
    }

    // Facebook пошук - СПРОЩЕНИЙ: просто "Company Name Facebook"
    if (name) {
      const facebookRes = await searchWeb(`"${name}" Facebook`, 3, 1).catch(() => null);
      if (facebookRes?.items) {
        // Шукаємо перше посилання на facebook.com (не marketplace, не ads)
        const facebookLink = facebookRes.items.find(item => 
          item.link.includes('facebook.com/') && 
          !item.link.includes('marketplace') &&
          !item.link.includes('business.facebook.com')
        );
        if (facebookLink) {
          result.facebook = facebookLink.link;
        }
      }
    }
  } catch (e) {
    console.error('Social media search error:', e);
  }

  return result;
}

/**
 * Простий пошук платформ через Google (не site:)
 * Для Alibaba, Made-in-China, IndiaMART
 */
export async function findPlatformsSimple(
  name: string,
  enabled: { alibaba: boolean; madeInChina: boolean; indiamart: boolean },
  options?: {
    email?: string;
    phone?: string;
  }
): Promise<{ alibaba?: string; madeInChina?: string; indiamart?: string }> {
  const result: { alibaba?: string; madeInChina?: string; indiamart?: string } = {};

  console.log("[findPlatformsSimple] Starting search:", { name, enabled, options });

  try {
    // Alibaba пошук - МНОЖИННІ варіанти пошуку
    if (enabled.alibaba && (name || options?.email || options?.phone)) {
      const queries: string[] = [];
      
      // 1. Назва компанії
      if (name) queries.push(`"${name}" Alibaba`);
      
      // 2. Email (часто найкращий результат!)
      if (options?.email) queries.push(`"${options.email}" Alibaba`);
      
      // 3. Телефон
      if (options?.phone) {
        const cleanPhone = options.phone.replace(/\D/g, '');
        if (cleanPhone.length >= 8) {
          queries.push(`"${cleanPhone}" Alibaba`);
        }
      }

      // Пробуємо по черзі, зупиняємось як знайдемо
      for (const query of queries) {
        console.log("[findPlatformsSimple] Searching Alibaba:", query);
        const alibabaRes = await searchWeb(query, 5, 1).catch((err) => {
          console.error("[findPlatformsSimple] Alibaba search error:", err);
          return null;
        });
        console.log("[findPlatformsSimple] Alibaba response:", alibabaRes ? `${alibabaRes.items?.length || 0} items` : 'null');
        
        if (alibabaRes?.items && alibabaRes.items.length > 0) {
          // 1. Спочатку шукаємо COMPANY PAGE (пріоритет)
          const companyLink = alibabaRes.items.find(item => 
            item.link.includes('alibaba.com') && 
            (item.link.includes('/company/') || item.link.includes('.alibaba.com'))
          );
          
          if (companyLink) {
            console.log("[findPlatformsSimple] Found Alibaba COMPANY link:", companyLink.link);
            result.alibaba = companyLink.link;
            break; // Знайшли company - виходимо
          }
          
          // 2. Якщо company немає → шукаємо PRODUCT PAGE
          const productLink = alibabaRes.items.find(item => 
            item.link.includes('alibaba.com') && 
            item.link.includes('/product-detail/')
          );
          
          if (productLink) {
            console.log("[findPlatformsSimple] Found Alibaba PRODUCT link:", productLink.link);
            
            // 3. Парсимо product page → витягуємо company link
            try {
              const companyUrl = await extractCompanyFromProductPage(productLink.link);
              if (companyUrl) {
                console.log("[findPlatformsSimple] Extracted company from product:", companyUrl);
                result.alibaba = companyUrl;
                break;
              } else {
                console.log("[findPlatformsSimple] Could not extract company from product, using product URL");
                result.alibaba = productLink.link; // Fallback: якщо не витягли - даємо product
                break;
              }
            } catch (e) {
              console.error("[findPlatformsSimple] Error extracting company from product:", e);
              result.alibaba = productLink.link; // Fallback: даємо product
              break;
            }
          }
          
          console.log("[findPlatformsSimple] No matching Alibaba link in results for:", query);
        }
      }
      
      if (!result.alibaba) {
        console.log("[findPlatformsSimple] Alibaba NOT found after trying all queries");
      }
    }

    // Made-in-China пошук
    if (enabled.madeInChina && name) {
      const micRes = await searchWeb(`"${name}" Made in China`, 3, 1).catch(() => null);
      if (micRes?.items) {
        const micLink = micRes.items.find(item => 
          item.link.includes('made-in-china.com')
        );
        if (micLink) {
          result.madeInChina = micLink.link;
        }
      }
    }

    // IndiaMART пошук
    if (enabled.indiamart && name) {
      const indiamartRes = await searchWeb(`"${name}" IndiaMART`, 3, 1).catch(() => null);
      if (indiamartRes?.items) {
        const indiamartLink = indiamartRes.items.find(item => 
          item.link.includes('indiamart.com')
        );
        if (indiamartLink) {
          result.indiamart = indiamartLink.link;
        }
      }
    }
  } catch (e) {
    console.error('[findPlatformsSimple] Platform search error:', e);
  }

  console.log("[findPlatformsSimple] Final result:", result);
  return result;
}
