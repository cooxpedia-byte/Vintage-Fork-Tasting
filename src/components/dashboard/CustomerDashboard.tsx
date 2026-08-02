"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { parseCustomerDashboardSection, type CustomerDashboardSection } from "@/lib/customer-dashboard";

type EventRow = {
  id: string;
  title: string;
  starts_at: string;
  location_mode: string;
  participant_id: string;
  responses: Array<{
    id: string;
    rating: number | null;
    first_impression: string | null;
    personal_notes: string | null;
    descriptors: string[];
    intensity: string | null;
    saved: boolean;
    completed_at: string | null;
    flight: { id: string; reveal_title: string; position: number; tea: { name: string; origin: string | null } | null } | null;
  }>;
};

type Upcoming = { id: string; title: string; starts_at: string; location_mode: string; invite_code: string | null };

export function CustomerDashboard({ name, events, upcoming, initialTab }: { name: string; events: EventRow[]; upcoming: Upcoming[]; initialTab: CustomerDashboardSection }) {
  const [tab, setTab] = useState<CustomerDashboardSection>(initialTab);
  const allResponses = useMemo(() => events.flatMap(e => e.responses.map(r => ({ ...r, event: e }))), [events]);
  const completed = allResponses.filter(r => r.completed_at);
  const saved = allResponses.filter(r => r.saved);
  const average = completed.filter(r => r.rating).length ? completed.reduce((sum, r) => sum + (r.rating ?? 0), 0) / completed.filter(r => r.rating).length : 0;

  useEffect(() => {
    function syncTabFromHistory() {
      const section = new URL(window.location.href).searchParams.get("section") ?? undefined;
      setTab(parseCustomerDashboardSection(section));
    }
    window.addEventListener("popstate", syncTabFromHistory);
    return () => window.removeEventListener("popstate", syncTabFromHistory);
  }, []);

  function selectTab(nextTab: CustomerDashboardSection) {
    setTab(nextTab);
    const url = new URL(window.location.href);
    if (nextTab === "home") url.searchParams.delete("section");
    else url.searchParams.set("section", nextTab);
    window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  return (
    <div className="dashboard-shell">
      <aside className="sidebar" aria-label="Customer dashboard">
        <nav>
          <button className={`btn btn-quiet ${tab === "home" ? "active" : ""}`} aria-pressed={tab === "home"} style={{ color: "inherit", justifyContent: "flex-start" }} onClick={() => selectTab("home")}><span aria-hidden="true">⌂</span> Home</button>
          <button className={`btn btn-quiet ${tab === "journal" ? "active" : ""}`} aria-pressed={tab === "journal"} style={{ color: "inherit", justifyContent: "flex-start" }} onClick={() => selectTab("journal")}><span aria-hidden="true">▤</span> Tastings</button>
          <button className={`btn btn-quiet ${tab === "passport" ? "active" : ""}`} aria-pressed={tab === "passport"} style={{ color: "inherit", justifyContent: "flex-start" }} onClick={() => selectTab("passport")}><span aria-hidden="true">✦</span> Passport</button>
          <button className={`btn btn-quiet ${tab === "saved" ? "active" : ""}`} aria-pressed={tab === "saved"} style={{ color: "inherit", justifyContent: "flex-start" }} onClick={() => selectTab("saved")}><span aria-hidden="true">♡</span> Saved teas</button>
        </nav>
      </aside>
      <nav className="customer-mobile-nav" aria-label="Customer dashboard mobile">
        <button className={tab === "home" ? "active" : ""} aria-pressed={tab === "home"} onClick={() => selectTab("home")}><span aria-hidden="true">⌂</span><small>Home</small></button>
        <button className={tab === "journal" ? "active" : ""} aria-pressed={tab === "journal"} onClick={() => selectTab("journal")}><span aria-hidden="true">▤</span><small>Tastings</small></button>
        <button className={tab === "passport" ? "active" : ""} aria-pressed={tab === "passport"} onClick={() => selectTab("passport")}><span aria-hidden="true">✦</span><small>Passport</small></button>
        <button className={tab === "saved" ? "active" : ""} aria-pressed={tab === "saved"} onClick={() => selectTab("saved")}><span aria-hidden="true">♡</span><small>Saved</small></button>
      </nav>
      <main className="dashboard-content" id="main-content">
        {tab === "home" && <>
          <section className="card" style={{ borderLeft: "5px solid var(--vf-gold)" }}>
            <p className="eyebrow">Your personal tea cellar</p>
            <h1 className="display">Welcome back, {name}.</h1>
            <p className="page-lede">Your private tasting history, Passport stamps and saved teas live here.</p>
          </section>
          <div className="grid grid-4" style={{ marginTop: 16 }}>
            <div className="card"><strong className="display" style={{ fontSize: 34 }}>{events.length}</strong><p className="muted">tasting evenings</p></div>
            <div className="card"><strong className="display" style={{ fontSize: 34 }}>{completed.length}</strong><p className="muted">teas completed</p></div>
            <div className="card"><strong className="display" style={{ fontSize: 34 }}>{saved.length}</strong><p className="muted">saved teas</p></div>
            <div className="card"><strong className="display" style={{ fontSize: 34 }}>{average ? average.toFixed(1) : "—"}</strong><p className="muted">average rating</p></div>
          </div>
          <div className="section-label"><span>Next at the table</span></div>
          {upcoming.length ? upcoming.map(event => <article className="card" key={event.id}>
            <div className="card-header"><div><h2 className="card-title">{event.title}</h2><p className="card-meta">{new Date(event.starts_at).toLocaleString("en-CA", { dateStyle: "full", timeStyle: "short" })} · {event.location_mode === "remote" ? "Remote" : "In person"}</p></div><span className="chip chip-success">Booked</span></div>
            <div className="notice">{event.location_mode === "remote" ? "Join the video call on a computer or tablet, and keep the tasting open on your phone." : "Your in-person seat is linked. Open the event on the day for the latest tasting details."}</div>
            <div className="card-footer"><span>Your seat is linked to this account.</span>{event.invite_code && <Link className="btn btn-primary" href={`/event/${event.invite_code}`}>Open event</Link>}</div>
          </article>) : <div className="empty-state"><h2>No upcoming tastings yet.</h2><p>Events linked to your verified email will appear here.</p><a className="btn btn-secondary" href="https://vintagefork.ca/" target="_blank" rel="noreferrer">Browse Vintage Fork tastings</a></div>}
          <div className="section-label"><span>Your last evening</span></div>
          {events[0] ? <EventCard event={events[0]} /> : <div className="empty-state"><h2>Your cellar is ready.</h2><p>Join a tasting to begin your journal and Passport.</p></div>}
        </>}
        {tab === "journal" && <>
          <h1 className="page-title">Your Tasting Journal</h1><p className="page-lede">Historical notes are private to you.</p>
          <div className="stack" style={{ marginTop: 20 }}>{events.length ? events.map(event => <EventCard event={event} key={event.id} />) : <div className="empty-state"><h2>No tasting history yet.</h2></div>}</div>
        </>}
        {tab === "passport" && <>
          <h1 className="page-title">Your Passport</h1><p className="page-lede">One stamp for every tea you completed.</p>
          <div className="grid grid-4" style={{ marginTop: 20 }}>{completed.map(r => <article key={r.id} className="card" style={{ textAlign: "center", background: "var(--vf-plum-aged)", color: "var(--vf-ivory)", borderColor: "var(--vf-gold-light)" }}><div style={{ fontSize: 28, color: "var(--vf-gold-light)" }}>✦</div><strong>{r.flight?.tea?.name ?? r.flight?.reveal_title}</strong><small style={{ display: "block", opacity: .75 }}>{r.flight?.tea?.origin}</small></article>)}</div>
          {!completed.length && <div className="empty-state"><h2>No stamps yet.</h2><p>Finish a tea during a live tasting to earn its stamp.</p></div>}
        </>}
        {tab === "saved" && <>
          <h1 className="page-title">Saved to Remember</h1><p className="page-lede">Saving never adds a product to a cart or charges you.</p>
          <div className="stack" style={{ marginTop: 20 }}>{saved.map(r => <article className="card" key={r.id}><div className="card-header"><div><h2 className="card-title">{r.flight?.tea?.name ?? r.flight?.reveal_title}</h2><p className="card-meta">{r.flight?.tea?.origin}</p></div><span className="chip chip-success">Saved</span></div><p>{r.descriptors.join(" · ") || "No descriptors recorded"}</p><div className="card-footer"><span>{r.rating ? `${"★".repeat(r.rating)}${"☆".repeat(5-r.rating)}` : "Not rated"}</span><a className="btn btn-primary" href="https://vintagefork.ca/" target="_blank" rel="noreferrer">Visit the tea shop</a></div></article>)}</div>
          {!saved.length && <div className="empty-state"><h2>Nothing saved yet.</h2><p>Use “Save This Tea” during a tasting to keep it here.</p></div>}
        </>}
      </main>
    </div>
  );
}

function EventCard({ event }: { event: EventRow }) {
  return <article className="card"><div className="card-header"><div><h2 className="card-title">{event.title}</h2><p className="card-meta">{new Date(event.starts_at).toLocaleDateString("en-CA", { dateStyle: "long" })} · {event.location_mode === "remote" ? "Remote" : "In person"}</p></div><span className="chip chip-success">Completed</span></div>
    <div className="table-wrap"><table><thead><tr><th>Tea</th><th>Rating</th><th>Intensity</th><th>Your descriptors</th></tr></thead><tbody>{[...event.responses].sort((a,b) => (a.flight?.position ?? 0) - (b.flight?.position ?? 0)).map(r => <tr key={r.id}><td>{r.flight?.tea?.name ?? r.flight?.reveal_title}</td><td>{r.rating ? `${"★".repeat(r.rating)}${"☆".repeat(5-r.rating)}` : "—"}</td><td>{r.intensity ?? "—"}</td><td>{r.descriptors.join(", ") || "—"}</td></tr>)}</tbody></table></div>
    {event.responses.some(r => r.first_impression || r.personal_notes) && <div><div className="section-label"><span>Your private notes</span></div><div className="stack">{event.responses.filter(r => r.first_impression || r.personal_notes).map(r => <article key={`note-${r.id}`} className="notice"><strong>{r.flight?.tea?.name ?? r.flight?.reveal_title}</strong>{r.first_impression && <p style={{ marginTop: 6 }}>“{r.first_impression}”</p>}{r.personal_notes && <p className="muted" style={{ marginTop: 6 }}>{r.personal_notes}</p>}</article>)}</div></div>}
    <div className="card-footer"><span className="muted">Your words are never shown to other guests.</span><span>{event.responses.filter(r => r.saved).length} saved</span></div>
  </article>;
}
