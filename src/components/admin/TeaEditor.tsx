"use client";

import { useState } from "react";
import { authenticatedFetch } from "@/lib/authenticated-fetch";

export type TeaRecord = {
  id: string;
  name: string;
  producer: string | null;
  origin: string | null;
  tea_type: string | null;
  default_character: string | null;
  default_brewing: string | null;
  default_steep_seconds: number | null;
  image_path: string | null;
  retired_at: string | null;
};

export function TeaEditor({ existing }: { existing?: TeaRecord }) {
  const [name, setName] = useState(existing?.name ?? "");
  const [producer, setProducer] = useState(existing?.producer ?? "");
  const [origin, setOrigin] = useState(existing?.origin ?? "");
  const [teaType, setTeaType] = useState(existing?.tea_type ?? "");
  const [character, setCharacter] = useState(existing?.default_character ?? "");
  const [brewing, setBrewing] = useState(existing?.default_brewing ?? "");
  const [steepSeconds, setSteepSeconds] = useState(existing?.default_steep_seconds ?? 180);
  const [imagePath, setImagePath] = useState(existing?.image_path ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await authenticatedFetch("/api/admin/teas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: existing?.id, name, producer, origin, teaType, character, brewing, steepSeconds, imagePath, retired: Boolean(existing?.retired_at) })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setError(result.error ?? "The tea could not be saved."); return; }
      window.location.assign(`/admin/teas/${result.id}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The tea could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function setRetired(retired: boolean) {
    if (!existing) return;
    if (retired && !window.confirm(`Retire ${existing.name}? It remains in past tastings but disappears from new flights.`)) return;
    setBusy(true); setError("");
    try {
      const response = await authenticatedFetch("/api/admin/teas", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: existing.id, name, producer, origin, teaType, character, brewing, steepSeconds, imagePath, retired })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setError(result.error ?? `The tea could not be ${retired ? "retired" : "restored"}.`); return; }
      window.location.assign(retired ? "/admin/teas" : `/admin/teas/${existing.id}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : `The tea could not be ${retired ? "retired" : "restored"}.`);
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={save} style={{ marginTop: 20 }}>
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="split">
      <section className="card">
        <div className="field"><label htmlFor="tea-name">Tea name</label><input className="input" id="tea-name" required maxLength={120} value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="grid grid-2"><div className="field"><label htmlFor="producer">Producer</label><input className="input" id="producer" maxLength={160} value={producer} onChange={e => setProducer(e.target.value)} /></div><div className="field"><label htmlFor="origin">Origin</label><input className="input" id="origin" maxLength={160} value={origin} onChange={e => setOrigin(e.target.value)} /></div></div>
        <div className="field"><label htmlFor="tea-type">Tea type</label><input className="input" id="tea-type" maxLength={80} value={teaType} onChange={e => setTeaType(e.target.value)} placeholder="Oolong, black, green, white…" /></div>
        <div className="field"><label htmlFor="character">Default reveal character</label><textarea className="textarea" id="character" maxLength={600} value={character} onChange={e => setCharacter(e.target.value)} /><span className="help">Prefills new event flight items. Existing events never change.</span></div>
        <div className="field"><label htmlFor="brewing">Default brewing guidance</label><textarea className="textarea" id="brewing" maxLength={600} value={brewing} onChange={e => setBrewing(e.target.value)} /></div>
        <div className="grid grid-2"><div className="field"><label htmlFor="steep">Default steep seconds</label><input className="input" id="steep" type="number" min={1} max={3600} required value={steepSeconds} onChange={e => setSteepSeconds(Number(e.target.value))} /></div><div className="field"><label htmlFor="image-path">Storage image path</label><input className="input" id="image-path" value={imagePath} onChange={e => setImagePath(e.target.value)} placeholder="teas/…" /><span className="help">Optional path in the private tasting-media bucket.</span></div></div>
      </section>
      <aside className="card"><h2 className="card-title">Permanent tea record</h2><p className="page-lede">These values become defaults only when staff add this tea to a new event. Each event keeps its own reveal, brewing and steep settings.</p>{existing?.retired_at && <div className="notice" style={{ marginTop: 16 }}>This tea is retired and cannot be selected for new flights.</div>}</aside>
    </div>
    <div className="row" style={{ justifyContent: "space-between", marginTop: 20 }}><div>{existing && !existing.retired_at && <button className="btn btn-danger" type="button" disabled={busy} onClick={() => setRetired(true)}>Retire this tea</button>}{existing?.retired_at && <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => setRetired(false)}>Restore this tea</button>}</div><button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save permanent record"}</button></div>
  </form>;
}
