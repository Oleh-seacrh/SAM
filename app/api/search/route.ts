export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Item = { title: string; link: string; displayLink: string; snippet?: string; homepage?: string };

function toHomepage(u: string) {
  try { const x = new URL(u); return `${x.protocol}//${x.hostname}`; } catch { return u; }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const num = Math.max(1, Math.min(10, Number(searchParams.get("num") || 10)));
  const start = Math.max(1, Number(searchParams.get("start") || 1));
  if (!q) return Response.json({ error: "Missing 'q' param" }, { status: 400 });

  const key = process.env.GOOGLE_SEARCH_API_KEY, cx = process.env.GOOGLE_CSE_ID;
  if (!key || !cx) return Response.json({ error: "Missing GOOGLE_SEARCH_API_KEY or GOOGLE_CSE_ID" }, { status: 500 });

  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(q)}&num=${num}&start=${start}`;
  const r = await fetch(url);
  if (!r.ok) return new Response(await r.text(), { status: r.status });

  const data = await r.json();
  const items: Item[] = (data.items ?? []).map((it: any) => ({
    title: it.title, link: it.link, displayLink: it.displayLink, snippet: it.snippet, homepage: toHomepage(it.link)
  }));
  const nextStart = Number(data?.queries?.nextPage?.[0]?.startIndex ?? 0) || null;
  const prevStart = Number(data?.queries?.previousPage?.[0]?.startIndex ?? 0) || null;

  return Response.json({
    q, num, start, nextStart, prevStart,
    totalResults: Number(data?.searchInformation?.totalResults || 0),
    items
  });
}
