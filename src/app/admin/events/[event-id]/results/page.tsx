import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type FlightRow = { id:string; position:number; reveal_title:string; tea:{name:string}|{name:string}[]|null };
type ResponseRow = { event_flight_item_id:string; rating:number|null; saved:boolean; completed_at:string|null };

export default async function EventResultsPage({ params }: { params: Promise<{ "event-id": string }> }) {
  await requireStaff();
  const { "event-id": eventId } = await params;
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("id,title,status,starts_at,location_mode,capacity").eq("id", eventId).single();
  if (!event) notFound();

  const admin = createAdminClient();
  const [{ data: analytics }, { data: flightData }, { data: responsesData }] = await Promise.all([
    admin.from("event_analytics").select("participants,completed_participants,average_rating,tea_saves").eq("event_id", eventId).maybeSingle(),
    admin.from("event_flight_items").select("id,position,reveal_title,tea:teas(name)").eq("event_id", eventId).order("position"),
    admin.from("tea_responses").select("event_flight_item_id,rating,saved,completed_at,participant:participants!inner(event_id)").eq("participant.event_id", eventId)
  ]);

  const flight = (flightData ?? []) as unknown as FlightRow[];
  const responses = (responsesData ?? []) as unknown as ResponseRow[];
  const teaRows = flight.map(item => {
    const itemResponses = responses.filter(response => response.event_flight_item_id === item.id);
    const rated = itemResponses.filter(response => response.rating !== null);
    const tea = Array.isArray(item.tea) ? item.tea[0] : item.tea;
    return {
      position: item.position,
      name: tea?.name ?? item.reveal_title,
      rated: rated.length,
      average: rated.length ? rated.reduce((sum,response) => sum + Number(response.rating),0) / rated.length : null,
      saves: itemResponses.filter(response => response.saved).length,
      completed: itemResponses.filter(response => response.completed_at).length
    };
  });

  const participantCount = Number(analytics?.participants ?? 0);
  const completionRate = participantCount ? Math.round((Number(analytics?.completed_participants ?? 0) / participantCount) * 100) : null;

  return <><SiteHeader /><main className="page-shell" id="main-content">
    <Link className="btn btn-quiet" href="/admin/events" prefetch={false}>← All events</Link>
    <div className="row" style={{ alignItems:"flex-end" }}><div><p className="eyebrow">Event results</p><h1 className="page-title">{event.title}</h1><p className="page-lede">{new Date(event.starts_at).toLocaleString("en-CA",{dateStyle:"full",timeStyle:"short"})} · {event.location_mode === "remote" ? "Remote" : "In person"}</p></div></div>
    {event.status !== "completed" ? <section className="empty-state"><h2>Results are available after the tasting.</h2><p>The live console remains the authority while this event is running.</p><Link className="btn btn-secondary" href={`/admin/events/${eventId}/live`} prefetch={false}>Open live console</Link></section> : participantCount === 0 ? <section className="empty-state"><h2>Nobody joined this tasting.</h2><p>There is nothing to report for this evening.</p></section> : <>
      <section className="grid grid-4" style={{ marginTop:24 }}>
        <Metric value={String(participantCount)} label={`participants · capacity ${event.capacity}`} />
        <Metric value={completionRate === null ? "—" : `${completionRate}%`} label="completed at least one tea" />
        <Metric value={analytics?.average_rating === null || analytics?.average_rating === undefined ? "—" : Number(analytics.average_rating).toFixed(2)} label="average tea rating" />
        <Metric value={String(analytics?.tea_saves ?? 0)} label="teas saved" />
      </section>
      <section><div className="section-label"><span>Tea by tea</span></div><div className="table-wrap"><table><thead><tr><th>#</th><th>Tea</th><th>Completed</th><th>Rated</th><th>Average</th><th>Saved</th></tr></thead><tbody>{teaRows.map(row => <tr key={row.position}><td>{row.position}</td><td><strong>{row.name}</strong></td><td>{row.completed}</td><td>{row.rated}</td><td>{row.average === null ? "—" : row.average.toFixed(2)}</td><td>{row.saves}</td></tr>)}</tbody></table></div></section>
      <div className="notice">Private first impressions and personal notes are deliberately excluded from staff analytics.</div>
    </>}
  </main></>;
}

function Metric({ value, label }: { value:string; label:string }) {
  return <article className="card" style={{ textAlign:"center" }}><strong className="display" style={{ fontSize:36 }}>{value}</strong><p className="muted">{label}</p></article>;
}
