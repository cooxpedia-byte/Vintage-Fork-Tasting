"use client";

import { useId, useReducer, useState } from "react";
import { useRouter } from "next/navigation";
import { previewCustomerOrderNote, refreshCustomerOrderNotes, sendCustomerOrderNote } from "@/app/admin/orders/customer-note-actions";
import { customerNoteState, customerNoteUnavailable, type CustomerNotesContext } from "@/lib/admin/customer-order-notes";
import { customerNoteDraft, emptyNoteDraft, matchingCustomerNoteReceipt } from "@/lib/admin/customer-order-note-draft";
import type { OrderKind } from "@/lib/admin/order-operations";

type Props = { kind: OrderKind; orderId: string; context: CustomerNotesContext | null; error: string | null };
const when = (value: string) => new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Edmonton" }).format(new Date(value));

export function CustomerNotePreview({ context, body }: { context: CustomerNotesContext; body: string }) {
  return <div className="customer-order-note-preview">
    <dl><div><dt>To</dt><dd>{context.recipientEmail}</dd></div><div><dt>From</dt><dd>Vintage Fork Tea Company · info@vintagefork.ca</dd></div>
      <div><dt>Subject</dt><dd>A note about your Vintage Fork order #{context.orderNumber}</dd></div></dl>
    <h4>A note about order #{context.orderNumber}</h4>
    <p className="customer-order-note-body">{body}</p>
    <p>Vintage Fork Tea Company</p><p>Reply to this email if you have any questions.</p>
  </div>;
}

export function CustomerOrderNotes(props: Props) {
  const router = useRouter(), id = useId();
  const [loaded, setLoaded] = useState<{ context: CustomerNotesContext | null; error: string | null } | null>(null);
  const { context, error } = loaded ?? props;
  const [draft, dispatch] = useReducer(customerNoteDraft, emptyNoteDraft);
  const [pending, setPending] = useState(false);

  async function preview() {
    if (pending || draft.phase !== "compose") return;
    setPending(true);
    try {
      const result = await previewCustomerOrderNote(props.kind, props.orderId, draft.body);
      if (!result.ok) dispatch({ type: "message", message: result.message });
      else {
        setLoaded({ context: result.context, error: null });
        dispatch({ type: "preview", value: { context: result.context, request: { kind: props.kind, orderId: props.orderId, operationId: crypto.randomUUID(), sourceVersion: result.context.sourceVersion, body: result.body } } });
      }
    } catch { dispatch({ type: "message", message: "The preview could not be loaded. Your draft is still here; try again." }); }
    finally { setPending(false); }
  }

  async function refresh() {
    if (pending) return;
    setPending(true);
    try {
      const result = await refreshCustomerOrderNotes(props.kind, props.orderId);
      if (result.context) {
        setLoaded(result);
        const receipt = draft.preview ? matchingCustomerNoteReceipt(result.context, draft.preview) : null;
        if (receipt) dispatch({ type: "recorded", receipt });
        else if (draft.phase === "unconfirmed") dispatch({ type: "message", message: "This request is not confirmed in the latest notes yet. Check again or retry this same request. Your note is preserved." });
        else dispatch({ type: "message", message: "Customer note status refreshed." });
      } else dispatch({ type: "message", message: result.error || "Customer notes could not be loaded." });
    } catch { dispatch({ type: "message", message: "The note status could not be checked. Your draft and request are preserved." }); }
    finally { setPending(false); }
  }

  async function send() {
    if (pending || !draft.preview || !["preview", "unconfirmed"].includes(draft.phase)) return;
    setPending(true);
    try {
      const result = await sendCustomerOrderNote(draft.preview.request);
      if (result.ok) {
        dispatch({ type: "recorded", receipt: result.receipt });
        // The server accepted one durable note. Refresh only reads; it never sends again.
        const updated = await refreshCustomerOrderNotes(props.kind, props.orderId).catch(() => null);
        if (updated?.context) setLoaded(updated);
        router.refresh();
      } else dispatch({ type: result.code === "unconfirmed" || draft.phase === "unconfirmed" ? "unconfirmed" : "rejected", message: result.message });
    } catch { dispatch({ type: "unconfirmed", message: "The result is not confirmed. Check the note status before writing another note. Your draft and request are preserved." }); }
    finally { setPending(false); }
  }

  const recorded = draft.receipt ? customerNoteState(draft.receipt.status) : null;
  const bodyLength = Array.from(draft.body).length;
  return <section className="admin-panel customer-order-notes" aria-labelledby={id + "-heading"}>
    <div className="admin-panel-heading"><div><p className="eyebrow">Customer communication</p><h2 id={id + "-heading"}>Customer notes</h2></div>
      <button className="btn btn-secondary" type="button" disabled={pending} onClick={refresh}>{pending ? "Please wait…" : "Refresh note status"}</button></div>
    <p>Notes sent here are emailed to this order&apos;s customer.</p>
    {error && <p role="alert" className="admin-commerce-notice">{error}</p>}
    {context && !context.canSend && <p className="admin-commerce-notice">{customerNoteUnavailable(context.unavailableReason)}</p>}
    {(draft.phase === "closed" || draft.phase === "recorded") && <>
      {recorded && <p role="status">Customer note: <strong>{recorded.label}</strong>.{draft.receipt?.status === "sent" ? " The email provider accepted this message." : recorded.label === "Queued" ? " It has been saved for email delivery." : " Review its status before taking further action."}</p>}
      <button type="button" className="btn btn-gold" disabled={pending || !context?.canSend || Boolean(error)} onClick={() => dispatch({ type: "open" })}>{draft.phase === "recorded" ? "Write another customer note" : "Email customer a note"}</button>
    </>}
    {draft.phase === "compose" && <form className="customer-order-note-compose" onSubmit={event => { event.preventDefault(); void preview(); }}>
      <label htmlFor={id + "-body"}>Customer note</label>
      <p id={id + "-help"}>This note will be emailed to the customer. Review the recipient and message before sending.</p>
      <textarea id={id + "-body"} aria-describedby={id + "-help"} aria-invalid={bodyLength > 5000 || undefined} value={draft.body} onChange={event => dispatch({ type: "edit", body: event.target.value })} minLength={3} maxLength={10000} rows={6} required disabled={pending}/>
      <small>{bodyLength.toLocaleString("en-CA")} / 5,000 characters</small>
      <div className="admin-order-action-buttons"><button className="btn btn-gold" disabled={pending || bodyLength < 3 || bodyLength > 5000} type="submit">{pending ? "Loading preview…" : "Preview email"}</button>
        <button className="btn btn-secondary" disabled={pending} type="button" onClick={() => dispatch({ type: "cancel" })}>Cancel</button></div>
    </form>}
    {(draft.phase === "preview" || draft.phase === "unconfirmed") && draft.preview && <div className="customer-order-note-review">
      <h3>{draft.phase === "unconfirmed" ? "Check this note before continuing" : "Review your customer email"}</h3>
      <CustomerNotePreview context={draft.preview.context} body={draft.preview.request.body}/>
      <div className="admin-order-action-buttons"><button className="btn btn-gold" type="button" disabled={pending} onClick={send}>{pending ? "Please wait…" : draft.phase === "unconfirmed" ? "Retry this same request" : "Send customer note"}</button>
        {draft.phase === "preview" && <><button className="btn btn-secondary" type="button" disabled={pending} onClick={() => dispatch({ type: "back" })}>Edit note</button><button className="btn btn-secondary" type="button" disabled={pending} onClick={() => dispatch({ type: "cancel" })}>Cancel</button></>}
      </div>
    </div>}
    {draft.message && <p role="status" className="admin-commerce-notice">{draft.message}</p>}
    <div className="customer-order-note-history"><h3>Note history</h3>
      {context?.notes.length ? <ol>{context.notes.map(note => {
        const state = customerNoteState(note.status);
        return <li key={note.id}><div className="customer-order-note-history-heading"><time dateTime={note.createdAt}>{when(note.createdAt)} · Edmonton time</time><span className={"admin-order-status " + state.className}>{state.label}</span></div>
          <p className="customer-order-note-recipient">To: {note.recipientEmail}</p><p className="customer-order-note-body">{note.body}</p>
          {note.status === "sent" && note.sentAt && <small>Provider accepted {when(note.sentAt)}.</small>}
          {note.status === "uncertain" && <p className="customer-order-note-attention">The sending result is uncertain. Review it before sending this message again.</p>}
          {(note.status === "failed" || note.status === "blocked") && <p className="customer-order-note-attention">This note needs a delivery review.</p>}
        </li>;
      })}</ol> : context ? <p>No customer notes have been sent from this dashboard for this order.</p> : <p>Note history is currently unavailable.</p>}
      {context?.hasMore && <p>Showing the latest 20 customer notes.</p>}
      <p className="admin-orders-note">Sent means the email provider accepted the message. It does not guarantee delivery to the customer&apos;s inbox.</p>
    </div>
  </section>;
}
