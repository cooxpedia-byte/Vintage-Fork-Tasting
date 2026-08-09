import { TastingCardDialog } from "@/components/tea-lab/TastingCardDialog";
import type { JournalCard } from "@/lib/tea-lab/journal";
import type { PassportSeal } from "@/lib/tea-lab/passport";

function cardForSeal(seal: PassportSeal): JournalCard {
  return seal.card ?? {
    id: `${seal.source}:${seal.sourceId}`,
    source: seal.source,
    sourceId: seal.sourceId,
    teaName: seal.teaName,
    origin: seal.origin,
    rating: null,
    intensity: null,
    descriptors: [],
    firstImpression: null,
    personalNotes: null,
    completedAt: seal.earnedAt,
    saved: false,
    position: 1,
    sealClass: seal.sealClass,
    brewing: null,
    photos: []
  };
}

export function TeaPassport({ seals }: { seals: PassportSeal[] }) {
  const liveCount = seals.filter(seal => seal.sealClass === "live_event_verified").length;
  const soloCount = seals.filter(seal => seal.sealClass === "documented_tasting").length;

  return <>
    <h1 className="page-title">Your Tea Cellar</h1>
    <p className="page-lede">A source-qualified seal for every completed tea. Seals describe the evidence; they are not points or expertise claims.</p>
    <div className="grid grid-2 passport-summary" style={{ marginTop: 20 }}>
      <div className="card"><strong className="display">{liveCount}</strong><p>Live Event Verified</p></div>
      <div className="card"><strong className="display">{soloCount}</strong><p>Documented Tasting</p></div>
    </div>
    <div className="grid grid-4 passport-grid" style={{ marginTop: 20 }}>{seals.map(seal => <TastingCardDialog
      card={cardForSeal(seal)}
      contextLabel={seal.contextLabel}
      earnedAt={seal.earnedAt}
      triggerClassName={`card passport-seal ${seal.sealClass}`}
      triggerLabel={`Open tasting card for ${seal.teaName}`}
      key={seal.id}
    >
      <span className="passport-seal-mark" aria-hidden="true">{seal.sealClass === "live_event_verified" ? "✦" : "◇"}</span>
      <strong>{seal.teaName}</strong>
      {seal.origin && <small>{seal.origin}</small>}
      <span className="chip">{seal.label}</span>
      <small>{new Date(seal.earnedAt).toLocaleDateString("en-CA", { dateStyle: "medium" })} · {seal.contextLabel}</small>
      <small className="passport-open-card">Tap to view card</small>
      {seal.archived && <small className="muted">Source tasting archived</small>}
    </TastingCardDialog>)}</div>
    {!seals.length && <div className="empty-state"><h2>No seals yet.</h2><p>Complete a tea in the Lab or at a live tasting to begin your Tea Cellar.</p></div>}
  </>;
}
