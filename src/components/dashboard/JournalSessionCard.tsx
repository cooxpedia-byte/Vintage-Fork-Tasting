import type { JournalCard, JournalSealClass, JournalSession } from "@/lib/tea-lab/journal";
import { TeaLabSessionActions } from "@/components/tea-lab/TeaLabSessionActions";
import { TastingCardDialog } from "@/components/tea-lab/TastingCardDialog";
import { formatCustomerEventDate } from "@/lib/customer-dashboard";
import type { TeaLabDescriptorOption } from "@/lib/tea-lab/lab";

const SEAL_LABELS: Record<JournalSealClass, string> = {
  live_event_verified: "Live Event Verified",
  documented_tasting: "Documented Tasting"
};

function ratingLabel(rating: number | null): string {
  return rating ? `${"★".repeat(rating)}${"☆".repeat(5 - rating)}` : "—";
}

function TeaRow({ card, contextLabel, occurredAt }: { card: JournalCard; contextLabel: string; occurredAt: string }) {
  return <tr>
    <td><strong>{card.teaName}</strong>{card.origin && <small className="muted" style={{ display: "block" }}>{card.origin}</small>}</td>
    <td>{ratingLabel(card.rating)}</td>
    <td>{card.sealClass ? <span className="chip chip-success">{SEAL_LABELS[card.sealClass]}</span> : "—"}</td>
    <td className="journal-card-action"><TastingCardDialog card={card} contextLabel={contextLabel} earnedAt={card.completedAt ?? occurredAt} triggerLabel={`View tasting card for ${card.teaName}`}><span>View card</span><span aria-hidden="true">→</span></TastingCardDialog></td>
  </tr>;
}

function MobileTeaCard({ card, contextLabel, occurredAt }: { card: JournalCard; contextLabel: string; occurredAt: string }) {
  return <article className="journal-mobile-tea-card">
    <div className="card-header">
      <div><h3 className="card-title">{card.teaName}</h3>{card.origin && <p className="card-meta">{card.origin}</p>}</div>
      {card.sealClass && <span className="chip chip-success">{SEAL_LABELS[card.sealClass]}</span>}
    </div>
    <div className="journal-mobile-rating"><span>Rating</span><strong>{ratingLabel(card.rating)}</strong></div>
    <TastingCardDialog card={card} contextLabel={contextLabel} earnedAt={card.completedAt ?? occurredAt} triggerLabel={`View tasting card for ${card.teaName}`}><span>View card</span><span aria-hidden="true">→</span></TastingCardDialog>
  </article>;
}

export function JournalSessionCard({ session, ownerUserId, descriptorOptions = [] }: { session: JournalSession; ownerUserId?: string; descriptorOptions?: TeaLabDescriptorOption[] }) {
  const cardsWithNotes = session.cards.filter(card => card.firstImpression || card.personalNotes);
  const hasActions = session.source === "solo" && Boolean(ownerUserId) && session.revision !== null;
  const actionHintId = `journal-actions-hint-${session.sourceId}`;

  const summary = <article className="card journal-session-card">
    <div className="card-header">
      <div>
        <h2 className="card-title">{session.title}</h2>
        <p className="card-meta">{formatCustomerEventDate(session.occurredAt, session.timeZone)} · {session.contextLabel}</p>
      </div>
      <span className="chip chip-success">{session.source === "live" ? "Live tasting" : "Solo tasting"}</span>
    </div>
    <div className="table-wrap journal-desktop-table"><table>
      <thead><tr><th>Tea</th><th>Rating</th><th>Seal</th><th><span className="sr-only">Card</span></th></tr></thead>
      <tbody>{session.cards.map(card => <TeaRow card={card} contextLabel={session.contextLabel} occurredAt={session.occurredAt} key={card.id} />)}</tbody>
    </table></div>
    <div className="journal-mobile-tea-list">{session.cards.map(card => <MobileTeaCard card={card} contextLabel={session.contextLabel} occurredAt={session.occurredAt} key={card.id} />)}</div>
    {cardsWithNotes.length > 0 && <div>
      <div className="section-label"><span>Your private notes</span></div>
      <div className="stack">{cardsWithNotes.map(card => <article key={`note-${card.id}`} className="notice">
        <strong>{card.teaName}</strong>
        {card.firstImpression && <p style={{ marginTop: 6 }}>“{card.firstImpression}”</p>}
        {card.personalNotes && <p className="muted" style={{ marginTop: 6 }}>{card.personalNotes}</p>}
      </article>)}</div>
    </div>}
    <div className="card-footer">
      <span className="muted">Your words are never shown to other guests.</span>
      {session.source === "live" && <span>{session.cards.filter(card => card.saved).length} saved</span>}
    </div>
    {hasActions && <span className="journal-session-swipe-hint" id={actionHintId}>Swipe left for actions <span aria-hidden="true">←</span></span>}
  </article>;

  return hasActions && ownerUserId
    ? <TeaLabSessionActions ownerUserId={ownerUserId} session={session} descriptorOptions={descriptorOptions}>{summary}</TeaLabSessionActions>
    : summary;
}
