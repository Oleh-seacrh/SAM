export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return new Response(JSON.stringify({ received: body ?? null }), {
    headers: { "content-type": "application/json" },
    status: 200
  });
}
