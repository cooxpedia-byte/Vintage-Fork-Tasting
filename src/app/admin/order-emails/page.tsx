import Link from "next/link";
import { OrderEmailEditor } from "@/components/admin/OrderEmailEditor";
import { requireStaff } from "@/lib/auth";
import { authorizedCommerceClient } from "@/lib/supabase/commerce-server";

export const dynamic = "force-dynamic";

export default async function OrderEmailsPage() {
  const staff = await requireStaff(["admin"]);
  const commerce = await authorizedCommerceClient(staff.user.id);
  if (!commerce) return <main className="admin-page"><div className="admin-page-heading"><div><p className="eyebrow">Commerce settings</p><h1>Order emails</h1></div></div><section className="admin-panel"><h2>Connect your store account</h2><p>Sign in with your store administrator account to manage automated order emails.</p><Link className="btn btn-gold" href="/admin/orders/connect" prefetch={false}>Sign in to store</Link></section></main>;
  return <main className="admin-page"><OrderEmailEditor /></main>;
}
