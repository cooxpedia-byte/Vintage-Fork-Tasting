import { type NextRequest, NextResponse } from "next/server";
import { createMobileHandoff } from "@/lib/mobile-auth-handoff";
import { getMobileUser } from "@/lib/mobile-auth";

export async function POST(request: NextRequest) {
  const user = await getMobileUser(request.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const payload = await request.json().catch(() => ({})) as { next?: unknown };
  const handoff = await createMobileHandoff(user, request.url, payload.next);
  if (!handoff.ok) return NextResponse.json({ error: handoff.error }, { status: handoff.status });

  return NextResponse.json(
    { url: handoff.url.toString() },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
