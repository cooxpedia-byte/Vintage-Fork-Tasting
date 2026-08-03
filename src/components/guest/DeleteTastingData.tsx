"use client";

import { useEffect, useState } from "react";
import { Brand } from "@/components/Brand";

export function DeleteTastingData() {
  const [credential, setCredential] = useState<{ eventId: string; deletionToken: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      setCredential({
        eventId: fragment.get("event") ?? "",
        deletionToken: fragment.get("token") ?? ""
      });
      window.history.replaceState({}, "", "/privacy/delete");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const eventId = credential?.eventId ?? "";
  const deletionToken = credential?.deletionToken ?? "";

  async function deleteData() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/events/${eventId}/privacy`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deletionToken })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "We couldn’t delete your tasting data just now.");
      setDeleted(true);
      window.history.replaceState({}, "", "/privacy/delete");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn’t delete your tasting data just now.");
    } finally {
      setBusy(false);
    }
  }

  if (deleted) {
    return <main className="guest-shell" id="main-content"><div className="guest-pane" style={{ justifyContent: "center", textAlign: "center" }}><Brand href="https://vintagefork.ca/" /><h1 className="page-title">Your tasting data has been deleted.</h1><p>Your notes, ratings, answers, stamps and saved teas from that tasting are gone.</p><a className="btn btn-secondary" href="https://vintagefork.ca/">Return to Vintage Fork</a></div></main>;
  }

  if (!credential) {
    return <main className="guest-shell" id="main-content"><div className="guest-pane" style={{ justifyContent: "center", textAlign: "center" }}><Brand href="https://vintagefork.ca/" /><p>Checking your private deletion link…</p></div></main>;
  }

  if (!eventId || !deletionToken) {
    return <main className="guest-shell" id="main-content"><div className="guest-pane" style={{ justifyContent: "center", textAlign: "center" }}><Brand href="https://vintagefork.ca/" /><h1 className="page-title">This deletion link is incomplete.</h1><p>Open the original link in your recap email, or delete your data from the tasting recap while your guest session is active.</p><a className="btn btn-secondary" href="https://vintagefork.ca/">Return to Vintage Fork</a></div></main>;
  }

  return <main className="guest-shell" id="main-content"><div className="guest-pane" style={{ justifyContent: "center" }}><div style={{ textAlign: "center" }}><Brand href="https://vintagefork.ca/" /><p className="eyebrow" style={{ marginTop: 28 }}>Privacy control</p><h1 className="page-title">Delete my tasting data?</h1></div><section className="notice error" style={{ marginTop: 24 }}><strong>This cannot be undone.</strong><p style={{ margin: "8px 0 0" }}>We’ll permanently delete your notes, descriptors, ratings, trivia answers, stamps and saved teas from this tasting. Your Vintage Fork account, if you have one, will not be deleted.</p></section>{error && <div className="form-error" role="alert">{error}</div>}<div className="guest-actions"><button className="btn btn-danger" disabled={busy} onClick={deleteData}>{busy ? "Deleting…" : "Delete my tasting data"}</button><a className="btn btn-secondary" href="https://vintagefork.ca/">Keep my data</a></div></div></main>;
}
