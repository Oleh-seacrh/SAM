export async function GET(req: NextRequest) {
  try {
    const sql = getSql();
    const { searchParams } = new URL(req.url);
    const orgType = searchParams.get("org_type"); // client|prospect|supplier|null

    // 🔹 Спрощений, надійний запит: тільки organizations
    const rows = await sql/*sql*/`
      select
        o.id, o.name, o.org_type, o.website, o.country, o.last_contact_at, o.created_at
      from organizations o
      where (${orgType} is null or o.org_type = ${orgType})
      order by coalesce(o.last_contact_at, o.created_at) desc nulls last;
    ` as any;

    return NextResponse.json({ data: rows ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
