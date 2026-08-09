"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { JournalSessionCard } from "@/components/dashboard/JournalSessionCard";
import { TeaLabWorkspace } from "@/components/tea-lab/TeaLabWorkspace";
import { TeaLibrary } from "@/components/tea-lab/TeaLibrary";
import { TeaPassport } from "@/components/tea-lab/TeaPassport";
import { formatCustomerEventDate, parseCustomerDashboardSection, summarizeCustomerResponses, type CustomerDashboardSection } from "@/lib/customer-dashboard";
import { mapLiveEventToJournalSession, type JournalSession, type LiveJournalEventRow } from "@/lib/tea-lab/journal";
import type { TeaLabDescriptorOption, TeaLabTeaOption } from "@/lib/tea-lab/lab";
import type { TeaLabSoloDraft } from "@/lib/tea-lab/offline";
import type { TeaLibraryItem } from "@/lib/tea-lab/library";
import { buildPassportSeals, type PassportSeal } from "@/lib/tea-lab/passport";

const DASHBOARD_NAV_ITEMS = {
  standard: [
    { section: "home", icon: "⌂", label: "Home" },
    { section: "journal", icon: "▤", label: "Tastings" },
    { section: "passport", icon: "✦", label: "Tea Cellar" },
    { section: "saved", icon: "♡", label: "Saved teas", mobileLabel: "Saved" }
  ],
  teaLab: [
    { section: "home", icon: "⌂", label: "Lab" },
    { section: "journal", icon: "▤", label: "Journal" },
    { section: "saved", icon: "♡", label: "Library" },
    { section: "passport", icon: "✦", label: "Tea Cellar" }
  ]
} as const;

type CustomerDashboardProps = {
  name: string;
  ownerUserId?: string;
  events: LiveJournalEventRow[];
  initialTab: CustomerDashboardSection;
  teaLabEnabled?: boolean;
  journalSessions?: JournalSession[];
  archivedJournalSessions?: JournalSession[];
  libraryItems?: TeaLibraryItem[];
  passportSeals?: PassportSeal[];
  teaOptions?: TeaLabTeaOption[];
  descriptorOptions?: TeaLabDescriptorOption[];
  serverDrafts?: TeaLabSoloDraft[];
};

export function CustomerDashboard({ name, ownerUserId, events, initialTab, teaLabEnabled = false, journalSessions = [], archivedJournalSessions = [], libraryItems = [], passportSeals = [], teaOptions = [], descriptorOptions = [], serverDrafts = [] }: CustomerDashboardProps) {
  const searchParams = useSearchParams();
  const [showArchivedJournal, setShowArchivedJournal] = useState(false);
  const routeSection = searchParams.get("section");
  const tab = routeSection === null ? initialTab : parseCustomerDashboardSection(routeSection);
  const navigationItems = DASHBOARD_NAV_ITEMS[teaLabEnabled ? "teaLab" : "standard"];
  const { completed, saved, average } = useMemo(() => teaLabEnabled && ownerUserId
    ? { completed: [], saved: [], average: 0 }
    : summarizeCustomerResponses(events.flatMap(event => event.responses)), [events, ownerUserId, teaLabEnabled]);
  const fallbackJournalSessions = useMemo(() => !teaLabEnabled && tab === "journal" ? events.map(mapLiveEventToJournalSession) : [], [events, tab, teaLabEnabled]);
  const fallbackPassportSeals = useMemo(() => !teaLabEnabled && tab === "passport" ? buildPassportSeals(events, []) : [], [events, tab, teaLabEnabled]);

  function selectTab(nextTab: CustomerDashboardSection) {
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    if (nextTab === "home") nextSearchParams.delete("section");
    else nextSearchParams.set("section", nextTab === "passport" ? "tea-cellar" : nextTab);
    const query = nextSearchParams.toString();
    window.history.pushState(null, "", query ? `/dashboard?${query}` : "/dashboard");
  }

  return (
    <div className="dashboard-shell">
      <aside className="sidebar" aria-label="Customer dashboard">
        <nav>
          {navigationItems.map(item => <button className={`btn btn-quiet ${tab === item.section ? "active" : ""}`} aria-pressed={tab === item.section} onClick={() => selectTab(item.section)} key={item.section}><span aria-hidden="true">{item.icon}</span> {item.label}</button>)}
        </nav>
      </aside>
      <nav className="customer-mobile-nav" aria-label="Customer dashboard mobile">
        {navigationItems.map(item => <button className={tab === item.section ? "active" : ""} aria-pressed={tab === item.section} onClick={() => selectTab(item.section)} key={item.section}><span aria-hidden="true">{item.icon}</span><small>{"mobileLabel" in item ? item.mobileLabel : item.label}</small></button>)}
      </nav>
      <main className="dashboard-content" id="main-content">
        {tab === "home" && teaLabEnabled && ownerUserId && <TeaLabWorkspace ownerUserId={ownerUserId} name={name} teaOptions={teaOptions} descriptorOptions={descriptorOptions} serverDrafts={serverDrafts} onOpenJournal={() => selectTab("journal")} />}
        {tab === "home" && (!teaLabEnabled || !ownerUserId) && <>
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
          <div className="section-label"><span>Your last evening</span></div>
          {events[0] ? <EventCard event={events[0]} /> : <div className="empty-state"><h2>Your cellar is ready.</h2><p>Join a tasting to begin your journal and Passport.</p></div>}
        </>}
        {tab === "journal" && <>
          <h1 className="page-title">Your Tasting Journal</h1><p className="page-lede">Historical notes are private to you.</p>
          <div className="stack" style={{ marginTop: 20 }}>{teaLabEnabled
            ? journalSessions.length ? journalSessions.map(session => <JournalSessionCard session={session} ownerUserId={ownerUserId} descriptorOptions={descriptorOptions} key={session.id} />) : <div className="empty-state"><h2>No tasting history yet.</h2></div>
            : fallbackJournalSessions.length ? fallbackJournalSessions.map(session => <JournalSessionCard session={session} key={session.id} />) : <div className="empty-state"><h2>No tasting history yet.</h2></div>}
          </div>
          {teaLabEnabled && archivedJournalSessions.length > 0 && <section className="archived-journal">
            <button className="btn btn-quiet" type="button" aria-expanded={showArchivedJournal} onClick={() => setShowArchivedJournal(value => !value)}>{showArchivedJournal ? "Hide archived tastings" : `Show archived tastings (${archivedJournalSessions.length})`}</button>
            {showArchivedJournal && <div className="stack" style={{ marginTop: 12 }}>{archivedJournalSessions.map(session => <JournalSessionCard session={session} ownerUserId={ownerUserId} descriptorOptions={descriptorOptions} key={session.id} />)}</div>}
          </section>}
        </>}
        {tab === "passport" && teaLabEnabled && <TeaPassport seals={passportSeals} />}
        {tab === "passport" && !teaLabEnabled && <TeaPassport seals={fallbackPassportSeals} />}
        {tab === "saved" && teaLabEnabled && <TeaLibrary items={libraryItems} onOpenLab={() => selectTab("home")} />}
        {tab === "saved" && !teaLabEnabled && <>
          <h1 className="page-title">Saved to Remember</h1><p className="page-lede">Saving never adds a product to a cart or charges you.</p>
          <div className="stack" style={{ marginTop: 20 }}>{saved.map(r => <article className="card" key={r.id}><div className="card-header"><div><h2 className="card-title">{r.flight?.tea?.name ?? r.flight?.reveal_title}</h2><p className="card-meta">{r.flight?.tea?.origin}</p></div><span className="chip chip-success">Saved</span></div><p>{r.descriptors.join(" · ") || "No descriptors recorded"}</p><div className="card-footer"><span>{r.rating ? `${"★".repeat(r.rating)}${"☆".repeat(5-r.rating)}` : "Not rated"}</span><a className="btn btn-primary btn-attention" href="https://vintagefork.ca/" target="_blank" rel="noreferrer">Visit the tea shop</a></div></article>)}</div>
          {!saved.length && <div className="empty-state"><h2>Nothing saved yet.</h2><p>Use “Save This Tea” during a tasting to keep it here.</p></div>}
        </>}
      </main>
    </div>
  );
}

function EventCard({ event }: { event: LiveJournalEventRow }) {
  return <article className="card"><div className="card-header"><div><h2 className="card-title">{event.title}</h2><p className="card-meta">{formatCustomerEventDate(event.starts_at, event.timezone)} · {event.location_mode === "remote" ? "Remote" : "In person"}</p></div><span className="chip chip-success">Completed</span></div>
    <div className="table-wrap"><table><thead><tr><th>Tea</th><th>Rating</th><th>Intensity</th><th>Your descriptors</th></tr></thead><tbody>{[...event.responses].sort((a,b) => (a.flight?.position ?? 0) - (b.flight?.position ?? 0)).map(r => <tr key={r.id}><td>{r.flight?.tea?.name ?? r.flight?.reveal_title}</td><td>{r.rating ? `${"★".repeat(r.rating)}${"☆".repeat(5-r.rating)}` : "—"}</td><td>{r.intensity ?? "—"}</td><td>{r.descriptors.join(", ") || "—"}</td></tr>)}</tbody></table></div>
    {event.responses.some(r => r.first_impression || r.personal_notes) && <div><div className="section-label"><span>Your private notes</span></div><div className="stack">{event.responses.filter(r => r.first_impression || r.personal_notes).map(r => <article key={`note-${r.id}`} className="notice"><strong>{r.flight?.tea?.name ?? r.flight?.reveal_title}</strong>{r.first_impression && <p style={{ marginTop: 6 }}>“{r.first_impression}”</p>}{r.personal_notes && <p className="muted" style={{ marginTop: 6 }}>{r.personal_notes}</p>}</article>)}</div></div>}
    <div className="card-footer"><span className="muted">Your words are never shown to other guests.</span><span>{event.responses.filter(r => r.saved).length} saved</span></div>
  </article>;
}
