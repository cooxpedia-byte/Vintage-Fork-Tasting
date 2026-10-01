import { NextResponse } from "next/server";
import { loadCoupon, loadCouponRedemptions, loadCouponReport, loadCouponReviewHolds, loadCoupons, loadCouponSummary } from "@/lib/admin/coupons";
import { requireAdminApi } from "@/lib/admin/require-admin";
import { authorizedCommerceClient } from "@/lib/supabase/commerce-server";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const access = await requireAdminApi(); if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const client = await authorizedCommerceClient(access.user.id); if (!client) return NextResponse.json({ error: "store_connection_required" }, { status: 403 });
  const query = new URL(request.url).searchParams, mode = query.get("mode") ?? "list";
  const cursor=(()=>{try{const raw=query.get("cursor");return raw?JSON.parse(Buffer.from(raw,"base64url").toString()):{};}catch{return {};}})();
  try {
    let data: unknown;
    if (mode === "detail") data = await loadCoupon(client, query.get("couponId") ?? "");
    else if (mode === "redemptions") data = await loadCouponRedemptions(client, query.get("couponId") ?? "",cursor);
    else if (mode === "review") data = await loadCouponReviewHolds(client,cursor);
    else if (mode === "report"||mode === "summary") { const to = query.get("to") ?? new Date().toISOString(), from = query.get("from") ?? new Date(Date.now() - 30 * 86400_000).toISOString(); data = mode === "summary" ? await loadCouponSummary(client,from,to) : await loadCouponReport(client,from,to,cursor); }
    else data = await loadCoupons(client, { status: query.get("status") ?? undefined, search: query.get("search") ?? undefined,cursor });
    return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "coupon_data_unavailable" }, { status: 400 }); }
}
