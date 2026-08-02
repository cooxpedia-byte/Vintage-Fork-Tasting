import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { StatusChip } from "@/components/StatusChip";
import { requireStaff } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireStaff();
  const supabase = await createClient();
  const { data: events, error: eventsError } = await supabase.from("events").select("id,title,starts_at,location_mode,capacity,status,phase,invite_code")
    .order("starts_at", { ascending: false });
  if (eventsError) {
    logger.error("admin_events_query_failed", eventsError);
    throw new Error("Unable to load events.");
  }
  const participantCounts = new Map<string, number>();
  if (events.length > 0) {
    const admin = createAdminClient();
    const { data: participantRows, error: participantsError } = await admin.from("participants")
      .select("event_id")
      .in("event_id", events.map(event => event.id))
      .neq("status", "left")
      .neq("status", "removed");
    if (participantsError) {
      logger.error("admin_event_counts_query_failed", participantsError);
      throw new Error("Unable to load event seat counts.");
    }
    for (const row of participantRows) participantCounts.set(row.event_id, (participantCounts.get(row.event_id) ?? 0) + 1);
  }
  const live = events?.filter(e => e.status === "live") ?? [];
  const attention = events?.filter(e => e.status === "draft") ?? [];

  return <><SiteHeader /><main className="page-shell" id="main-content">
    <div className="row" style={{ alignItems: "flex-end" }}><div><p className="eyebrow">Tasting administration</p><h1 className="page-title">Events</h1><p className="page-lede">Create the flight, prepare trivia, issue the invite and run the room from one shared event record.</p></div><span className="spacer" /><Link className="btn btn-secondary" href="/admin/teas" prefetch={false}>Tea library</Link><Link className="btn btn-primary" href="/admin/events/new" prefetch={false}>+ New event</Link></div>
    {live.length > 0 && <section style={{ marginTop: 24 }}><div className="section-label"><span>Live now</span></div>{live.map(event => <article className="card" key={event.id} style={{ background: "var(--vf-plum-aged)", color: "var(--vf-ivory)", borderColor: "var(--vf-gold-light)" }}><div className="card-header"><div><h2 className="card-title" style={{ color: "var(--vf-gold-light)" }}>{event.title}</h2><p style={{ opacity: .8 }}>{event.phase} · {new Date(event.starts_at).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })}</p></div><StatusChip value="live" /></div><div className="card-footer" style={{ borderColor: "rgba(224,190,107,.25)" }}><span>{participantCounts.get(event.id) ?? 0} joined</span><Link className="btn btn-gold" href={`/admin/events/${event.id}/live`} prefetch={false}>Open live console</Link></div></article>)}</section>}
    {attention.length > 0 && <section><div className="section-label"><span>Needs attention</span></div><div className="stack">{attention.map(event => <Link key={event.id} href={`/admin/events/${event.id}`} prefetch={false} className="card" style={{ textDecoration: "none", borderLeft: "4px solid var(--vf-gold)" }}><div className="row"><span aria-hidden="true">⚠</span><strong>{event.title}</strong><span className="spacer" /><span className="muted">Finish setup →</span></div></Link>)}</div></section>}
    <section>
      <div className="section-label"><span>All events</span></div>
      <div className="table-wrap desktop-admin-table">
        <table>
          <thead><tr><th>Date</th><th>Event</th><th>Type</th><th>Seats</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{(events ?? []).map(event => <tr key={event.id}><td>{new Date(event.starts_at).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}</td><td><strong>{event.title}</strong><br /><small className="muted">{event.invite_code ?? "No invite yet"}</small></td><td>{event.location_mode === "remote" ? "Remote" : "In person"}</td><td>{participantCounts.get(event.id) ?? 0} / {event.capacity}</td><td><StatusChip value={event.status} /></td><td><div className="row">{["draft","scheduled"].includes(event.status) && <Link className="btn btn-secondary" href={`/admin/events/${event.id}`} prefetch={false}>Edit</Link>}{["scheduled","live"].includes(event.status) && <Link className="btn btn-primary" href={`/admin/events/${event.id}/live`} prefetch={false}>{event.status === "live" ? "Resume" : "Launch"}</Link>}{event.status === "completed" && <Link className="btn btn-primary" href={`/admin/events/${event.id}/results`} prefetch={false}>Results</Link>}{event.status === "cancelled" && <span className="muted">Locked</span>}</div></td></tr>)}</tbody>
        </table>
      </div>
      <ul className="mobile-swipe-list" aria-label="Events">
        {(events ?? []).map(event => {
          const hintId = `event-swipe-hint-${event.id}`;
          return <li className="mobile-swipe-row" key={event.id} tabIndex={0} aria-describedby={hintId}>
            <div className="mobile-swipe-content">
              <div className="mobile-record-heading">
                <strong>{event.title}</strong>
                <StatusChip value={event.status} />
              </div>
              <div className="mobile-record-meta">
                <span>{new Date(event.starts_at).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}</span>
                <span>{event.location_mode === "remote" ? "Remote" : "In person"}</span>
                <span>{participantCounts.get(event.id) ?? 0} / {event.capacity} seats</span>
              </div>
              <span className="mobile-swipe-hint" id={hintId}>Swipe left for actions <span aria-hidden="true">←</span></span>
            </div>
            <div className="mobile-swipe-actions" role="group" aria-label={`Actions for ${event.title}`}>
              {["draft","scheduled"].includes(event.status) && <Link className="btn btn-gold" href={`/admin/events/${event.id}`} prefetch={false}>Edit</Link>}
              {["scheduled","live"].includes(event.status) && <Link className="btn btn-primary" href={`/admin/events/${event.id}/live`} prefetch={false}>{event.status === "live" ? "Resume" : "Launch"}</Link>}
              {event.status === "completed" && <Link className="btn btn-primary" href={`/admin/events/${event.id}/results`} prefetch={false}>Results</Link>}
              {event.status === "cancelled" && <span className="mobile-swipe-locked">Locked</span>}
            </div>
          </li>;
        })}
      </ul>
      {!events?.length && <div className="empty-state"><h2>No events yet.</h2><p>Create the first tasting to begin.</p></div>}
    </section>
  </main></>;
}
