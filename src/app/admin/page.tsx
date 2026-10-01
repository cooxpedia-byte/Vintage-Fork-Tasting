import { CommerceAdminOverview } from "@/components/admin/CommerceAdminOverview";
import { loadCommerceOverview } from "@/lib/admin/commerce";
import { requireStaff } from "@/lib/auth";
import { authorizedCommerceClient } from "@/lib/supabase/commerce-server";
import { StoreConnectionNotice } from "@/components/admin/StoreConnectionNotice";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const staff = await requireStaff();
  if (staff.role === "host") redirect("/admin/events");
  const client = await authorizedCommerceClient(staff.user.id);
  if (!client) return <StoreConnectionNotice/>;
  const commerce = await loadCommerceOverview(client);
  return <CommerceAdminOverview commerce={commerce} />;
}
