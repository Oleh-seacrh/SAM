export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Item = {
  title: string;
  link: string;
  displayLink: string;
  snippet?: string;
  homepage?: string;
};

function toHomepage(u: string) {
  try {
    const x = new URL(u);
    return `${x.protocol}//${x.hostname}`;
  } catch {
    return u;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const numRaw = Number(searchParams.get("num") || 10);
  const startRaw = Number(searchParams.get("start") || 1);

  if (!q) {
    return new Response(JSON.stringify({ error: "Missing 'q' param" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const key = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_CSE_ID;
  if (!key || !cx) {
    return new Response(
      JSON.stringify({
        error:
          "Missing GOOGLE_SEARCH_API_KEY or GOOGLE_CSE_ID. Set them in Vercel → Environment Variables.",
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  // Google дозволяє num ≤ 10 на запит
  const num = Math.max(1, Math.min(10, isFinite(numRaw) ? numRaw : 10));
  const start = Math.max(1, isFinite(startRaw) ? startRaw : 1);

  const url =
    `https://www.googleapis.com/customsearch/v1?` +
    `key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}` +
    `&q=${encodeURIComponent(q)}&num=${num}&start=${start}`;

  const r = await fetch(url);
  if (!r.ok) {
    const text = await r.text();
    return new Response(JSON.stringify({ error: text }), {
      status: r.status,
      headers: { "content-type": "application/json" },
    });
  }

  const data = await r.json();

  const items: Item[] = (data.items ?? []).map((it: any) => ({
    title: it.title,
    link: it.link,
    displayLink: it.displayLink,
    snippet: it.snippet,
    homepage: toHomepage(it.link),
  }));

  const nextStart =
    data?.queries?.nextPage && data.queries.nextPage[0]?.startIndex
      ? Number(data.queries.nextPage[0].startIndex)
      : null;

  const prevStart =
    data?.queries?.previousPage && data.queries.previousPage[0]?.startIndex
      ? Number(data.queries.previousPage[0].startIndex)
      : null;

  return new Response(
    JSON.stringify({
      q,
      num,
      start,
      nextStart,
      prevStart,
      totalResults: Number(data?.searchInformation?.totalResults || 0),
      items,
    }),
    { headers: { "content-type": "application/json" } }
  );
}
