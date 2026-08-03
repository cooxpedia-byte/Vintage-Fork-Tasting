import type { JournalCard, JournalSealClass, JournalSession } from "@/lib/tea-lab/journal";
import { TeaLabSessionActions } from "@/components/tea-lab/TeaLabSessionActions";
import { TastingCardDialog } from "@/components/tea-lab/TastingCardDialog";
import { formatCustomerEventDate } from "@/lib/customer-dashboard";

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
    <td>{card.intensity ?? "—"}</td>
    <td>{card.descriptors.map(descriptor => descriptor.label).join(", ") || "—"}</td>
    <td>{card.sealClass ? <span className="chip chip-success">{SEAL_LABELS[card.sealClass]}</span> : "—"}</td>
    <td className="journal-card-action"><TastingCardDialog card={card} contextLabel={contextLabel} earnedAt={card.completedAt ?? occurredAt} triggerLabel={`View tasting card for ${card.teaName}`}><span>View card</span><span aria-hidden="true">→</span></TastingCardDialog></td>
  </tr>;
}

export function JournalSessionCard({ session, ownerUserId }: { session: JournalSession; ownerUserId?: string }) {
  const cardsWithNotes = session.cards.filter(card => card.firstImpression || card.personalNotes);

  return <article className="card">
    <div className="card-header">
      <div>
        <h2 className="card-title">{session.title}</h2>
        <p className="card-meta">{formatCustomerEventDate(session.occurredAt, session.timeZone)} · {session.contextLabel}</p>
      </div>
      <span className="chip chip-success">{session.source === "live" ? "Live tasting" : "Solo tasting"}</span>
    </div>
    <div className="table-wrap"><table>
      <thead><tr><th>Tea</th><th>Rating</th><th>Intensity</th><th>Your descriptors</th><th>Seal</th><th><span className="sr-only">Card</span></th></tr></thead>
      <tbody>{session.cards.map(card => <TeaRow card={card} contextLabel={session.contextLabel} occurredAt={session.occurredAt} key={card.id} />)}</tbody>
    </table></div>
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
    {session.source === "solo" && ownerUserId && session.revision !== null && <TeaLabSessionActions ownerUserId={ownerUserId} session={session} />}
  </article>;
}
