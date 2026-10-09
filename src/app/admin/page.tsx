import { CommerceAdminOverview } from "@/components/admin/CommerceAdminOverview";
import { loadCommerceOverview } from "@/lib/admin/commerce";
import { requireStaff } from "@/lib/auth";
import { authorizedCommerceClient } from "@/lib/supabase/commerce-server";
import { StoreConnectionNotice } from "@/components/admin/StoreConnectionNotice";
import { parseSalesPeriod, salesPeriodRange } from "@/lib/admin/sales-periods";
import { parseTrafficPeriod, loadTrafficOverview } from "@/lib/admin/traffic";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams?: Promise<{ salesPeriod?: string | string[]; trafficPeriod?: string | string[] }> }) {
  const staff = await requireStaff();
  if (staff.role === "host") redirect("/admin/events");
  const client = await authorizedCommerceClient(staff.user.id);
  if (!client) return <StoreConnectionNotice/>;
  const params = await searchParams;
  const salesPeriod = parseSalesPeriod(params?.salesPeriod);
  const now = new Date();
  const [commerce, traffic] = await Promise.all([
    loadCommerceOverview(client, { salesPeriod, salesRange: salesPeriodRange(salesPeriod, now) }),
    loadTrafficOverview(client, parseTrafficPeriod(params?.trafficPeriod), now),
  ]);
  return <CommerceAdminOverview commerce={commerce} salesPeriod={salesPeriod} traffic={traffic} />;
}
