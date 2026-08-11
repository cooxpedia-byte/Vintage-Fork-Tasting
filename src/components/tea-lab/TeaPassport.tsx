import { TastingCardDialog } from "@/components/tea-lab/TastingCardDialog";
import { cardForPassportSeal, type PassportSeal } from "@/lib/tea-lab/passport";
import type { LoyaltySummary } from "@/lib/loyalty";

export function TeaPassport({ seals, loyaltySummary, eligibleMerchantCards, onOpenMerchant }: { seals: PassportSeal[]; loyaltySummary: LoyaltySummary | null; eligibleMerchantCards: number; onOpenMerchant: () => void }) {
  const liveCount = seals.filter(seal => seal.sealClass === "live_event_verified").length;
  const soloCount = seals.filter(seal => seal.sealClass === "documented_tasting").length;

  return <>
    <h1 className="page-title">Your Tea Cellar</h1>
    <p className="page-lede">A source-qualified seal for every completed tea. Seals describe the evidence; they are not points or expertise claims.</p>
    <section className="tea-merchant-entry" aria-labelledby="tea-merchant-entry-title">
      <div className="tea-merchant-entry-mark" aria-hidden="true"><span /></div>
      <div className="tea-merchant-entry-copy">
        <span className="eyebrow">From your Tea Cellar</span>
        <h2 id="tea-merchant-entry-title">Tea Merchant</h2>
        <p>{loyaltySummary
          ? `${loyaltySummary.pointsBalance.toLocaleString("en-CA")} ${loyaltySummary.pointsLabel} available · ${eligibleMerchantCards} ${eligibleMerchantCards === 1 ? "card" : "cards"} ready to list.`
          : "Your Gold Leaves wallet is temporarily unavailable. Your tasting cards remain safely in the Tea Cellar."}</p>
      </div>
      <button className="btn btn-gold" type="button" onClick={onOpenMerchant}>Open Tea Merchant</button>
    </section>
    <div className="grid grid-2 passport-summary" style={{ marginTop: 20 }}>
      <div className="card"><strong className="display">{liveCount}</strong><p>Live Event Verified</p></div>
      <div className="card"><strong className="display">{soloCount}</strong><p>Documented Tasting</p></div>
    </div>
    <div className="grid grid-4 passport-grid" style={{ marginTop: 20 }}>{seals.map(seal => <TastingCardDialog
      card={cardForPassportSeal(seal)}
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
