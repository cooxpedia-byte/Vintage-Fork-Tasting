import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TeaLibraryPage() {
  await requireStaff();
  const supabase = await createClient();
  const { data: teas } = await supabase.from("teas").select("id,name,producer,origin,tea_type,default_steep_seconds,retired_at,event_flight_items(count)").order("retired_at", { ascending: true, nullsFirst: true }).order("name");
  return <><SiteHeader /><main className="page-shell" id="main-content">
    <div className="row"><div><p className="eyebrow">Permanent records</p><h1 className="page-title">Tea library</h1><p className="page-lede">Manage the defaults used when a tea is added to a future tasting.</p></div><span className="spacer" /><Link className="btn btn-primary" href="/admin/teas/new" prefetch={false}>+ Add a tea</Link></div>
    <div className="notice" style={{ marginTop: 20 }}>Changes here never rewrite an event already configured or a completed customer tasting record.</div>
    <div className="table-wrap desktop-admin-table" style={{ marginTop: 20 }}>
      <table>
        <thead><tr><th>Tea</th><th>Producer</th><th>Origin</th><th>Type</th><th>Default steep</th><th>Used in</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{(teas ?? []).map(tea => <tr key={tea.id}><td><strong>{tea.name}</strong></td><td>{tea.producer || "—"}</td><td>{tea.origin || "—"}</td><td>{tea.tea_type || "—"}</td><td>{tea.default_steep_seconds ? `${tea.default_steep_seconds}s` : "—"}</td><td>{countOf(tea.event_flight_items)} tasting{countOf(tea.event_flight_items) === 1 ? "" : "s"}</td><td><span className={`chip ${tea.retired_at ? "" : "chip-success"}`}>{tea.retired_at ? "Retired" : "Active"}</span></td><td><Link className="btn btn-secondary" href={`/admin/teas/${tea.id}`} prefetch={false}>Open</Link></td></tr>)}</tbody>
      </table>
    </div>
    <ul className="mobile-swipe-list mobile-tea-list" aria-label="Tea library">
      {(teas ?? []).map(tea => {
        const usageCount = countOf(tea.event_flight_items);
        const hintId = `tea-swipe-hint-${tea.id}`;
        return <li className="mobile-swipe-row" key={tea.id} tabIndex={0} aria-describedby={hintId}>
          <div className="mobile-swipe-content">
            <div className="mobile-record-heading">
              <strong>{tea.name}</strong>
              <span className={`chip ${tea.retired_at ? "" : "chip-success"}`}>{tea.retired_at ? "Retired" : "Active"}</span>
            </div>
            <div className="mobile-record-meta">
              <span>{tea.producer || "No producer"}</span>
              <span>{tea.origin || "No origin"}</span>
              <span>{tea.tea_type || "No type"}</span>
              <span>{tea.default_steep_seconds ? `${tea.default_steep_seconds}s steep` : "No default steep"}</span>
              <span>Used in {usageCount} tasting{usageCount === 1 ? "" : "s"}</span>
            </div>
            <span className="mobile-swipe-hint" id={hintId}>Swipe left for actions <span aria-hidden="true">←</span></span>
          </div>
          <div className="mobile-swipe-actions" role="group" aria-label={`Actions for ${tea.name}`}>
            <Link className="btn btn-gold" href={`/admin/teas/${tea.id}`} prefetch={false}>Open</Link>
          </div>
        </li>;
      })}
    </ul>
    {!teas?.length && <div className="empty-state"><h2>No teas yet.</h2><p>Add the first permanent tea record before building a flight.</p></div>}
  </main></>;
}

function countOf(value: unknown): number { if (Array.isArray(value) && value[0] && typeof value[0] === "object" && "count" in value[0]) return Number((value[0] as {count:number}).count); return 0; }
