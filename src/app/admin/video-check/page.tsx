import Link from "next/link";
import { AgoraDiagnostic } from "@/components/admin/AgoraDiagnostic";
import { SiteHeader } from "@/components/SiteHeader";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminVideoCheckPage() {
  await requireStaff();
  return <><SiteHeader /><main className="page-shell" id="main-content">
    <p className="eyebrow">Staff video diagnostic</p>
    <h1 className="page-title">Check this browser’s video connection</h1>
    <p className="page-lede">This creates a private, short-lived Agora test room. It does not create, start, change, or end a tasting.</p>
    <AgoraDiagnostic />
    <div style={{ marginTop: 20 }}><Link className="btn btn-secondary" href="/admin" prefetch={false}>Back to events</Link></div>
  </main></>;
}
