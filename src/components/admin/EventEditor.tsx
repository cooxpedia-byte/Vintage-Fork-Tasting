"use client";

import { useMemo, useState } from "react";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { parseEventStartTime } from "@/lib/event-start-time";

type Tea = { id: string; name: string; origin: string | null; default_character: string | null; default_brewing: string | null; default_steep_seconds: number | null };
type Staff = { id: string; display_name: string; role: string };
type Flight = {
  tea_id: string; reveal_title: string; reveal_description: string; brewing_instructions: string; steep_seconds: number;
  temperature_c: number | null; leaf_grams: number | null; water_ml: number | null;
  trivia: { question: string; options: string[]; correct_index: number; explanation: string; answer_window_seconds: number };
};
type Existing = {
  id: string; title: string; slug: string; invite_code: string | null; status: string; location_mode: "remote" | "in_person";
  starts_at: string; timezone: string; capacity: number; venue_name: string | null; venue_address: string | null; video_call_url: string | null;
  host_user_id: string; backup_host_user_id: string | null; flight_items: Array<Flight & { position: number }>;
};

export function EventEditor({ teas, staff, existing }: { teas: Tea[]; staff: Staff[]; existing?: Existing }) {
  const firstHost = existing?.host_user_id ?? staff[0]?.id ?? "";
  const [title, setTitle] = useState(existing?.title ?? "");
  const [startsAt, setStartsAt] = useState(existing ? toLocal(existing.starts_at) : "");
  const [mode, setMode] = useState<"remote" | "in_person">(existing?.location_mode ?? "remote");
  const [capacity, setCapacity] = useState(existing?.capacity ?? 12);
  const [videoCallUrl, setVideoCallUrl] = useState(existing?.video_call_url ?? "");
  const [venueName, setVenueName] = useState(existing?.venue_name ?? "");
  const [venueAddress, setVenueAddress] = useState(existing?.venue_address ?? "");
  const [hostId, setHostId] = useState(firstHost);
  const [backupId, setBackupId] = useState(existing?.backup_host_user_id ?? "");
  const [flight, setFlight] = useState<Flight[]>(existing?.flight_items ?? []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const readiness = useMemo(() => [
    ["Title", title.trim().length >= 3], ["Start time", Boolean(startsAt)], ["Location", mode === "remote" ? /^https?:\/\//.test(videoCallUrl) : Boolean(venueName && venueAddress)],
    ["Host", Boolean(hostId)], ["Backup host", Boolean(backupId && backupId !== hostId)], ["Flight", flight.length > 0],
    ["Steep times", flight.every(x => x.steep_seconds > 0)], ["Reveal text", flight.every(x => x.reveal_description.trim())],
    ["Brewing guidance", flight.every(x => x.brewing_instructions.trim())], ["Trivia", flight.every(x => x.trivia.question.trim() && x.trivia.options.length >= 2 && x.trivia.options.length <= 4 && x.trivia.options.every(option => option.trim()) && x.trivia.correct_index >= 0 && x.trivia.correct_index < x.trivia.options.length)]
  ] as Array<[string, boolean]>, [title, startsAt, mode, videoCallUrl, venueName, venueAddress, hostId, backupId, flight]);

  function addTea(teaId: string) {
    const tea = teas.find(t => t.id === teaId); if (!tea) return;
    setFlight(items => [...items, {
      tea_id: tea.id, reveal_title: tea.name, reveal_description: tea.default_character ?? "", brewing_instructions: tea.default_brewing ?? "",
      steep_seconds: tea.default_steep_seconds ?? 180, temperature_c: 95, leaf_grams: 4, water_ml: 250,
      trivia: { question: "", options: ["", ""], correct_index: 0, explanation: "", answer_window_seconds: 20 }
    }]);
  }
  function updateFlight(index: number, patch: Partial<Flight>) { setFlight(items => items.map((item, i) => i === index ? { ...item, ...patch } : item)); }
  function move(index: number, delta: number) { setFlight(items => { const next = [...items]; const target = index + delta; if (target < 0 || target >= next.length) return items; [next[index], next[target]] = [next[target], next[index]]; return next; }); }
  function remove(index: number) { setFlight(items => items.filter((_, i) => i !== index)); }

  async function copyInvite() {
    if (!existing?.invite_code) return;
    const value = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://tasting.vintagefork.ca"}/event/${existing.invite_code}`;
    try { await navigator.clipboard.writeText(value); }
    catch { const input = document.createElement("textarea"); input.value=value; input.style.position="fixed"; input.style.opacity="0"; document.body.append(input); input.select(); document.execCommand("copy"); input.remove(); }
    setCopied(true); window.setTimeout(() => setCopied(false), 2000);
  }

  async function save(event: React.FormEvent, status = existing?.status === "scheduled" ? "scheduled" : "draft") {
    event.preventDefault(); setError("");
    const parsedStart = parseEventStartTime(startsAt);
    if (!parsedStart.ok) { setError(parsedStart.error); return; }

    setBusy(true);
    try {
      const payload = {
        event: { id: existing?.id, title, slug: existing?.slug, invite_code: existing?.invite_code, status, location_mode: mode, starts_at: parsedStart.iso, timezone: "America/Edmonton", capacity, venue_name: venueName, venue_address: venueAddress, video_call_url: videoCallUrl, host_user_id: hostId, backup_host_user_id: backupId },
        flight
      };
      const response = await authenticatedFetch("/api/admin/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setError(result.error ?? "The event could not be saved."); return; }
      window.location.assign(`/admin/events/${result.id}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The event could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={save}>
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="split" style={{ marginTop: 20 }}>
      <div className="stack">
        <section className="card">
          <h2 className="card-title">The basics</h2>
          <div className="field"><label htmlFor="event-title">Event title</label><input className="input" id="event-title" maxLength={80} required value={title} onChange={e => setTitle(e.target.value)} /></div>
          <div className="grid grid-2">
            <div className="field"><label htmlFor="starts-at">Start date and time</label><input className="input" id="starts-at" type="datetime-local" required value={startsAt} onChange={e => setStartsAt(e.target.value)} /></div>
            <div className="field"><label htmlFor="capacity">Guest capacity</label><input className="input" id="capacity" type="number" min={1} max={100} value={capacity} onChange={e => setCapacity(Number(e.target.value))} /></div>
          </div>
          <div className="field"><label htmlFor="mode">How is it run?</label><select className="select" id="mode" value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="remote">Remote</option><option value="in_person">In person</option></select></div>
          {mode === "remote" ? <div className="field"><label htmlFor="call-url">Zoom or Meet link</label><input className="input" id="call-url" type="url" value={videoCallUrl} onChange={e => setVideoCallUrl(e.target.value)} /></div> : <div className="grid grid-2"><div className="field"><label htmlFor="venue">Venue name</label><input className="input" id="venue" value={venueName} onChange={e => setVenueName(e.target.value)} /></div><div className="field"><label htmlFor="address">Venue address</label><input className="input" id="address" value={venueAddress} onChange={e => setVenueAddress(e.target.value)} /></div></div>}
          <div className="grid grid-2">
            <div className="field"><label htmlFor="host">Host</label><select className="select" id="host" value={hostId} onChange={e => setHostId(e.target.value)}>{staff.map(x => <option key={x.id} value={x.id}>{x.display_name}</option>)}</select></div>
            <div className="field"><label htmlFor="backup">Backup host</label><select className="select" id="backup" value={backupId} onChange={e => setBackupId(e.target.value)}><option value="">Not assigned</option>{staff.filter(x => x.id !== hostId).map(x => <option key={x.id} value={x.id}>{x.display_name}</option>)}</select></div>
          </div>
        </section>
        <section className="card">
          <div className="card-header"><div><h2 className="card-title">Tonight’s flight</h2><p className="card-meta">Event-specific reveal, brewing and trivia settings.</p></div><select className="select" aria-label="Add a tea to the flight" style={{ width: "auto" }} defaultValue="" onChange={e => { addTea(e.target.value); e.target.value = ""; }}><option value="" disabled>+ Add tea</option>{teas.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <div className="stack">{flight.map((item, index) => <FlightEditor key={`${item.tea_id}-${index}`} item={item} index={index} teaName={teas.find(t => t.id === item.tea_id)?.name ?? item.reveal_title} update={patch => updateFlight(index, patch)} move={delta => move(index, delta)} remove={() => remove(index)} />)}</div>
          {!flight.length && <div className="empty-state"><h3>No teas in the flight.</h3><p>Add the first tea above.</p></div>}
        </section>
      </div>
      <aside className="stack">
        <section className="card"><h2 className="card-title">Before launch</h2><div className="stack" style={{ gap: 8, marginTop: 12 }}>{readiness.map(([label, met]) => <div key={label} className="row"><span aria-hidden="true" style={{ color: met ? "var(--vf-forest)" : "var(--vf-gold)" }}>{met ? "✓" : "⚠"}</span><span>{label}</span></div>)}</div><p className="help" style={{ marginTop: 12 }}>The backend runs the same readiness checks again. The browser never decides launch eligibility by itself.</p></section>
        <section className="card"><h2 className="card-title">Invite</h2><p>{existing?.invite_code ? <><strong>{existing.invite_code}</strong><br /><span className="help">{`${process.env.NEXT_PUBLIC_SITE_URL ?? "https://tasting.vintagefork.ca"}/event/${existing.invite_code}`}</span></> : "An invite code is generated when the draft is saved."}</p>{existing?.invite_code && <button type="button" className="btn btn-secondary" onClick={copyInvite}>{copied ? "Invite copied" : "Copy invite link"}</button>}</section>
      </aside>
    </div>
    <div className="row" style={{ justifyContent: "flex-end", marginTop: 20 }}><button type="submit" className="btn btn-secondary" disabled={busy}>{busy ? "Saving…" : existing?.status === "scheduled" ? "Save changes" : "Save draft"}</button>{existing?.status !== "scheduled" && <button type="button" className="btn btn-primary" disabled={busy || readiness.some(x => !x[1])} onClick={e => save(e as unknown as React.FormEvent, "scheduled")}>Save as scheduled</button>}</div>
  </form>;
}

function FlightEditor({ item, index, teaName, update, move, remove }: { item: Flight; index: number; teaName: string; update: (patch: Partial<Flight>) => void; move: (delta: number) => void; remove: () => void }) {
  const updateTrivia = (patch: Partial<Flight["trivia"]>) => update({ trivia: { ...item.trivia, ...patch } });
  return <article className="card" style={{ boxShadow: "none" }}>
    <div className="card-header"><div><p className="eyebrow">Tea {index + 1}</p><h3 className="card-title">{teaName}</h3></div><div className="row"><button className="btn btn-quiet" type="button" onClick={() => move(-1)} aria-label="Move up">↑</button><button className="btn btn-quiet" type="button" onClick={() => move(1)} aria-label="Move down">↓</button><button className="btn btn-quiet" type="button" onClick={remove}>Remove</button></div></div>
    <div className="grid grid-2"><div className="field"><label htmlFor={`reveal-title-${index}`}>Reveal title</label><input className="input" id={`reveal-title-${index}`} value={item.reveal_title} onChange={e => update({ reveal_title: e.target.value })} /></div><div className="field"><label htmlFor={`steep-seconds-${index}`}>Steep seconds</label><input className="input" id={`steep-seconds-${index}`} type="number" min={1} value={item.steep_seconds} onChange={e => update({ steep_seconds: Number(e.target.value) })} /></div></div>
    <div className="field"><label htmlFor={`reveal-description-${index}`}>Reveal description</label><textarea className="textarea" id={`reveal-description-${index}`} value={item.reveal_description} onChange={e => update({ reveal_description: e.target.value })} /></div>
    <div className="field"><label htmlFor={`brewing-${index}`}>Brewing instructions</label><textarea className="textarea" id={`brewing-${index}`} value={item.brewing_instructions} onChange={e => update({ brewing_instructions: e.target.value })} /></div>
    <div className="grid grid-3"><div className="field"><label htmlFor={`temperature-${index}`}>Temperature °C</label><input className="input" id={`temperature-${index}`} type="number" value={item.temperature_c ?? ""} onChange={e => update({ temperature_c: e.target.value ? Number(e.target.value) : null })} /></div><div className="field"><label htmlFor={`leaf-${index}`}>Leaf grams</label><input className="input" id={`leaf-${index}`} type="number" step="0.1" value={item.leaf_grams ?? ""} onChange={e => update({ leaf_grams: e.target.value ? Number(e.target.value) : null })} /></div><div className="field"><label htmlFor={`water-${index}`}>Water ml</label><input className="input" id={`water-${index}`} type="number" value={item.water_ml ?? ""} onChange={e => update({ water_ml: e.target.value ? Number(e.target.value) : null })} /></div></div>
    <div className="section-label"><span>Trivia</span></div>
    <div className="field"><label htmlFor={`trivia-question-${index}`}>Question</label><input className="input" id={`trivia-question-${index}`} maxLength={140} value={item.trivia.question} onChange={e => updateTrivia({ question: e.target.value })} /></div>
    <div className="grid grid-2">{item.trivia.options.map((option, i) => <div className="field" key={i}><label htmlFor={`answer-${index}-${i}`}>Answer {i + 1}{i === item.trivia.correct_index ? " · correct" : ""}</label><div className="row" style={{ flexWrap: "nowrap" }}><input type="radio" name={`correct-${index}`} aria-label={`Mark answer ${i + 1} correct`} checked={i === item.trivia.correct_index} onChange={() => updateTrivia({ correct_index: i })} /><input className="input" id={`answer-${index}-${i}`} value={option} onChange={e => updateTrivia({ options: item.trivia.options.map((x, oi) => oi === i ? e.target.value : x) })} />{item.trivia.options.length > 2 && <button type="button" className="btn btn-quiet" onClick={() => { const options = item.trivia.options.filter((_, optionIndex) => optionIndex !== i); const correct_index = item.trivia.correct_index === i ? 0 : item.trivia.correct_index > i ? item.trivia.correct_index - 1 : item.trivia.correct_index; updateTrivia({ options, correct_index }); }}>Remove</button>}</div></div>)}</div>
    <div className="row"><button type="button" className="btn btn-secondary" disabled={item.trivia.options.length >= 4} onClick={() => updateTrivia({ options: [...item.trivia.options, ""] })}>Add answer</button><div className="field" style={{ margin: 0 }}><label htmlFor={`answer-window-${index}`}>Answer window</label><input className="input" id={`answer-window-${index}`} style={{ width: 110 }} type="number" min={10} max={60} value={item.trivia.answer_window_seconds} onChange={e => updateTrivia({ answer_window_seconds: Number(e.target.value) })} /></div></div>
  </article>;
}

function toLocal(iso: string) { const d = new Date(iso); const offset = d.getTimezoneOffset(); return new Date(d.getTime() - offset * 60000).toISOString().slice(0,16); }
