// lib/enrich/web.ts
// Веб-пошук через Google CSE для "Find info" та платформ.
// Сумісний із існуючими викликами: searchWeb(q, num=5, start=1) → { items: [...] }

export type CSEItem = {
  title: string;
  link: string;
  displayLink: string;
  snippet?: string;
  homepage?: string; // нормалізований origin
};

export type CSEResult = { items: CSEItem[] };

function getEnv(key: string, alt?: string): string | undefined {
  return process.env[key] || (alt ? process.env[alt] : undefined);
}

function toHomepage(u: string): string | undefined {
  try {
    const url = new URL(u);
    // тільки чистий origin (https://host/)
    return `${url.protocol}//${url.hostname}/`;
  } catch {
    return undefined;
  }
}

export async function searchWeb(q: string, num: number = 5, start: number = 1): Promise<CSEResult> {
  const key = getEnv("GOOGLE_CSE_API_KEY", "CSE_API_KEY");
  const cx  = getEnv("GOOGLE_CSE_CX", "CSE_CX");

  if (!key || !cx || !q || !q.trim()) {
    // Без ключів — тихе порожнє повернення (щоб /api/enrich/org міг дати reason)
    return { items: [] };
  }

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", key);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", q);
  url.searchParams.set("num", String(Math.min(Math.max(num || 5, 1), 10)));
  url.searchParams.set("start", String(Math.max(start || 1, 1)));

  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      // 4xx/5xx → логуємо і повертаємо порожньо
      const errorText = await res.text().catch(() => "");
      console.error("[searchWeb] Google CSE error:", {
        status: res.status,
        statusText: res.statusText,
        query: q,
        error: errorText
      });
      return { items: [] };
    }
    const json = await res.json();
    const rawItems = Array.isArray(json?.items) ? json.items : [];
    
    console.log("[searchWeb] Query:", q, "→ Results:", rawItems.length);
    
    const items: CSEItem[] = rawItems.map((it: any) => ({
      title: String(it?.title ?? ""),
      link: String(it?.link ?? ""),
      displayLink: String(it?.displayLink ?? ""),
      snippet: typeof it?.snippet === "string" ? it.snippet : undefined,
      homepage: it?.link ? toHomepage(String(it.link)) : undefined,
    }));
    return { items };
  } catch (err) {
    console.error("[searchWeb] Fetch error:", err);
    return { items: [] };
  }
}

/** Уніфікований кандидат з веб-пошуку */
export type WebCandidate = {
  title: string;
  link: string;
  snippet?: string;
  homepage?: string;
};

/** Пошук за назвою (опційно країна) */
export async function searchByName(name?: string | null, country?: string | null): Promise<WebCandidate[]> {
  if (!name || !name.trim()) return [];
  const q = country ? `${name} ${country}` : name;
  const { items } = await searchWeb(q, 5, 1);
  return items.map(i => ({ title: i.title, link: i.link, snippet: i.snippet, homepage: i.homepage }));
}

/** Пошук за email */
export async function searchByEmail(email?: string | null): Promise<WebCandidate[]> {
  if (!email || !email.trim()) return [];
  const q = `"${email}"`;
  const { items } = await searchWeb(q, 5, 1);
  return items.map(i => ({ title: i.title, link: i.link, snippet: i.snippet, homepage: i.homepage }));
}

/** Пошук за телефоном (нормалізуємо, додаємо лапки) */
export async function searchByPhone(phone?: string | null): Promise<WebCandidate[]> {
  if (!phone || !phone.trim()) return [];
  const q = `"${phone.replace(/[^\d+]/g, "")}"`;
  const { items } = await searchWeb(q, 5, 1);
  return items.map(i => ({ title: i.title, link: i.link, snippet: i.snippet, homepage: i.homepage }));
}
