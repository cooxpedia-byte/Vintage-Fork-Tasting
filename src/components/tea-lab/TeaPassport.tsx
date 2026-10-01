import { TastingCardDialog } from "@/components/tea-lab/TastingCardDialog";
import type { CellarRecord } from "@/lib/tea-lab/cellar";

export function TeaPassport({ records }: { records: CellarRecord[] }) {
  const liveCount = records.filter(record => record.source === "live").length;
  const soloCount = records.filter(record => record.source === "solo").length;

  return <>
    <h1 className="page-title">Your Tea Cellar</h1>
    <p className="page-lede">Your personal collection of tasting cards. Revisit the teas you’ve tasted and how you brewed them.</p>
    <div className="grid grid-2 passport-summary" style={{ marginTop: 20 }}>
      <div className="card"><strong className="display">{liveCount}</strong><p>Hosted tastings</p></div>
      <div className="card"><strong className="display">{soloCount}</strong><p>Personal tastings</p></div>
    </div>
    <div className="grid grid-4 passport-grid" style={{ marginTop: 20 }}>{records.map(record => <TastingCardDialog
      card={record.card}
      contextLabel={record.contextLabel}
      earnedAt={record.recordedAt}
      triggerClassName={`card passport-seal ${record.source === "live" ? "live_event_verified" : "documented_tasting"}`}
      triggerLabel={`Open tasting card for ${record.teaName}`}
      key={record.id}
    >
      <span className="passport-seal-mark" aria-hidden="true">{record.source === "live" ? "✦" : "◇"}</span>
      <strong>{record.teaName}</strong>
      {record.origin && <small>{record.origin}</small>}
      <span className="chip">{record.source === "live" ? "Hosted tasting" : "Personal tasting"}</span>
      <small>{new Date(record.recordedAt).toLocaleDateString("en-CA", { dateStyle: "medium" })} · {record.contextLabel}</small>
      <small className="passport-open-card">Tap to view card</small>
      {record.archived && <small className="muted">Source tasting archived</small>}
    </TastingCardDialog>)}</div>
    {!records.length && <div className="empty-state"><h2>No tasting cards yet.</h2><p>Complete a tea in the Lab or at a live tasting to add a personal record here.</p></div>}
  </>;
}
