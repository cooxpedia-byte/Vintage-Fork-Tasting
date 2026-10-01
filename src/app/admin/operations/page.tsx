import Link from "next/link";
import { requireStaff } from "@/lib/auth";

export default async function AdminOperationsPage() {
  await requireStaff();
  const checks = [
    { name: "Event state", detail: "Server-authoritative phases, timers and host lease", state: "Operational" },
    { name: "Agora video", detail: "Token service and browser diagnostics", state: "Check before event" },
    { name: "Customer identity", detail: "Web and mobile account handoff", state: "Connected" },
    { name: "Gold Leaves", detail: "Append-only ledger and wallet bridge", state: "Protected" },
    { name: "Privacy retention", detail: "Anonymous participant deletion window", state: "Scheduled" },
    { name: "Store commerce", detail: "Store orders, products and checkout", state: "Separate staff sign-in" },
  ];
  return <main className="admin-page"><div className="admin-page-heading"><div><p className="eyebrow">System control</p><h1>Operations</h1><p>Readiness, diagnostics and system boundaries for the complete Vintage Fork estate.</p></div><Link className="btn btn-gold" href="/admin/video-check" prefetch={false}>Run video check</Link></div><section className="admin-ops-grid">{checks.map((check) => <article className="admin-panel" key={check.name}><span className="admin-system-dot" /><div><h2>{check.name}</h2><p>{check.detail}</p></div><span className={`chip ${check.state === "Operational" || check.state === "Connected" || check.state === "Protected" ? "chip-success" : "chip-warning"}`}>{check.state}</span></article>)}</section><section className="admin-panel admin-runbook"><div><p className="eyebrow">Before a live tasting</p><h2>Operator checklist</h2><p>Use the same short sequence every time so video, host control and guest privacy are predictable.</p></div><ol><li><span>1</span>Confirm the event readiness panel is complete.</li><li><span>2</span>Run the video diagnostic on the host device.</li><li><span>3</span>Confirm the backup host can open the event.</li><li><span>4</span>Open the live room and admit guests from the host console.</li></ol></section></main>;
}
