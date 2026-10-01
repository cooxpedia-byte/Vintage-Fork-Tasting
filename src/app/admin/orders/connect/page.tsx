import { requireStaff } from "@/lib/auth";
import { StoreConnectForm } from "@/components/admin/StoreConnectForm";

export const dynamic = "force-dynamic";
export default async function ConnectStorePage() {
  const {user} = await requireStaff(["admin"]);
  return <main className="admin-page"><section className="admin-panel" style={{maxWidth:560}}>
    <p className="eyebrow">Store orders</p><h1>Connect your store account</h1>
    <p>Your new store uses a separate sign-in. Connect its administrator account here to view purchases and migrated orders.</p>
    <StoreConnectForm email={user.email||""}/>
  </section></main>;
}
