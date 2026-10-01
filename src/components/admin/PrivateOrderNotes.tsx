"use client";

import { useId, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addPrivateOrderNote, refreshPrivateOrderNotes } from "@/app/admin/orders/private-note-actions";
import { normalizePrivateNote, type PrivateNotesContext } from "@/lib/admin/private-order-notes";
import { emptyPrivateNoteDraft, matchingPrivateNoteReceipt, privateNoteDraft } from "@/lib/admin/private-order-note-draft";
import type { OrderKind } from "@/lib/admin/order-operations";

type Props = { kind: OrderKind; orderId: string; context: PrivateNotesContext | null; error: string | null };
const when = (value: string) => new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Edmonton" }).format(new Date(value));

export function PrivateOrderNotes(props: Props) {
  const id = useId(), router = useRouter();
  const [loaded, setLoaded] = useState<{ context: PrivateNotesContext | null; error: string | null } | null>(null);
  const { context, error } = loaded ?? props;
  const [draft, dispatch] = useReducer(privateNoteDraft, emptyPrivateNoteDraft);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  async function refresh() {
    if (inFlight.current) return;
    inFlight.current = true; setPending(true);
    try {
      const result = await refreshPrivateOrderNotes(props.kind, props.orderId);
      if (result.context) {
        setLoaded(result);
        const receipt = draft.request ? matchingPrivateNoteReceipt(result.context, draft.request) : null;
        if (receipt) dispatch({ type: "saved", receipt });
        else if (draft.phase === "unconfirmed") dispatch({ type: "message", message: "This save is not confirmed in the latest private notes yet. Check again or retry this same save. Your note is preserved." });
        else dispatch({ type: "message", message: "Private notes refreshed." });
      } else dispatch({ type: "message", message: result.error || "Private notes could not be loaded." });
    } catch { dispatch({ type: "message", message: "Private notes could not be checked. Your draft and request are preserved." }); }
    finally { inFlight.current = false; setPending(false); }
  }

  async function save() {
    if (inFlight.current || !["compose", "unconfirmed"].includes(draft.phase)) return;
    let request = draft.request;
    try {
      request ??= { kind: props.kind, orderId: props.orderId, operationId: crypto.randomUUID(), body: normalizePrivateNote(draft.body) };
    } catch { dispatch({ type: "message", message: "Write a private note between 3 and 5,000 characters using plain text." }); return; }
    inFlight.current = true; setPending(true);
    if (draft.phase === "compose") dispatch({ type: "submit", request });
    try {
      const result = await addPrivateOrderNote(request);
      if (result.ok) {
        dispatch({ type: "saved", receipt: result.receipt });
        const updated = await refreshPrivateOrderNotes(props.kind, props.orderId).catch(() => null);
        if (updated?.context) setLoaded(updated);
        router.refresh();
      } else dispatch({ type: result.code === "unconfirmed" || draft.phase === "unconfirmed" ? "unconfirmed" : "rejected", message: result.message });
    } catch { dispatch({ type: "unconfirmed", message: "The save is not confirmed. Refresh private notes before writing another note. Your draft and request are preserved." }); }
    finally { inFlight.current = false; setPending(false); }
  }

  const length = Array.from(draft.body).length;
  return <section className="admin-panel private-order-notes" aria-labelledby={id + "-heading"}>
    <div className="admin-panel-heading"><div><p className="eyebrow">Staff only</p><h2 id={id + "-heading"}>Private staff notes</h2></div>
      <button type="button" className="btn btn-secondary" disabled={pending} onClick={refresh}>{pending ? "Please wait…" : "Refresh private notes"}</button></div>
    <p className="private-order-note-privacy">Visible only to staff with order access. These notes are never emailed or shown to customers.</p>
    {error && <p className="admin-commerce-notice" role="alert">{error}</p>}
    {(draft.phase === "closed" || draft.phase === "saved") && <>
      {draft.receipt && <p role="status">Private note saved by <strong>{draft.receipt.authorName}</strong> on {when(draft.receipt.createdAt)}.</p>}
      <button type="button" className="btn btn-secondary" disabled={pending || !context || Boolean(error)} onClick={() => dispatch({ type: "open" })}>{draft.phase === "saved" ? "Add another private note" : "Add private note"}</button>
    </>}
    {(draft.phase === "compose" || draft.phase === "saving") && <form className="private-order-note-compose" onSubmit={event => { event.preventDefault(); void save(); }}>
      <label htmlFor={id + "-body"}>Private note</label>
      <p id={id + "-help"}>Save information for the staff handling this order.</p>
      <textarea id={id + "-body"} aria-describedby={id + "-help"} aria-invalid={length > 5000 || undefined} value={draft.body} onChange={event => dispatch({ type: "edit", body: event.target.value })} rows={5} minLength={3} maxLength={10000} required disabled={pending}/>
      <small>{length.toLocaleString("en-CA")} / 5,000 characters</small>
      <div className="admin-order-action-buttons"><button type="submit" className="btn btn-gold" disabled={pending || length < 3 || length > 5000}>{pending ? "Saving…" : "Save private note"}</button>
        <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => dispatch({ type: "cancel" })}>Cancel</button></div>
    </form>}
    {draft.phase === "unconfirmed" && <div className="private-order-note-recovery">
      <h3>Check this private note before continuing</h3>
      <p className="private-order-note-body">{draft.request?.body}</p>
      <button type="button" className="btn btn-secondary" disabled={pending} onClick={save}>{pending ? "Please wait…" : "Retry this same save"}</button>
    </div>}
    {draft.message && <p className="admin-commerce-notice" role="status">{draft.message}</p>}
    <div className="private-order-note-history"><h3>Private note history</h3>
      {context?.notes.length ? <ol>{context.notes.map(note => <li key={note.id}>
        <div className="private-order-note-history-heading"><strong>{note.authorName}</strong><time dateTime={note.createdAt}>{when(note.createdAt)} · Edmonton time</time></div>
        <p className="private-order-note-body">{note.body}</p>
      </li>)}</ol> : context ? <p>No private staff notes have been saved for this order.</p> : <p>Private note history is currently unavailable.</p>}
      {context?.hasMore && <p>Showing the latest 20 private notes.</p>}
    </div>
  </section>;
}
