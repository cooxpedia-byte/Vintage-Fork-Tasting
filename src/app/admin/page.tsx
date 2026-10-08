import { CommerceAdminOverview } from "@/components/admin/CommerceAdminOverview";
import { loadCommerceOverview } from "@/lib/admin/commerce";
import { requireStaff } from "@/lib/auth";
import { authorizedCommerceClient } from "@/lib/supabase/commerce-server";
import { StoreConnectionNotice } from "@/components/admin/StoreConnectionNotice";
import { parseSalesPeriod, salesPeriodRange } from "@/lib/admin/sales-periods";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams?: Promise<{ salesPeriod?: string | string[] }> }) {
  const staff = await requireStaff();
  if (staff.role === "host") redirect("/admin/events");
  const client = await authorizedCommerceClient(staff.user.id);
  if (!client) return <StoreConnectionNotice/>;
  const salesPeriod = parseSalesPeriod((await searchParams)?.salesPeriod);
  const commerce = await loadCommerceOverview(client, { salesPeriod, salesRange: salesPeriodRange(salesPeriod) });
  return <CommerceAdminOverview commerce={commerce} salesPeriod={salesPeriod} />;
}
