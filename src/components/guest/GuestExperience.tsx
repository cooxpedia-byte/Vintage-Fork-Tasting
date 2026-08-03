"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Brand } from "@/components/Brand";
import { correctedNow, estimateClockOffset, TRIVIA_GRACE_MS } from "@/lib/live-timing";
import { shouldHoldGuestTransition } from "@/lib/guest-notes";
import { clearGuestDeviceData } from "@/lib/guest-privacy";

type EventPreview = { id: string; title: string; invite_code: string; status: string; starts_at: string; location_mode: string; capacity: number };
type CurrentItem = { id: string; position: number; reveal_title: string; reveal_description: string; brewing_instructions: string; steep_seconds: number; temperature_c: number | null; leaf_grams: number | null; water_ml: number | null; tea: { name: string; origin: string | null; producer: string | null; tea_type: string | null } | null };
export type StatePayload = {
  serverReceivedTime: string;
  serverTime: string;
  event: { id: string; title: string; status: string; phase: string; sequence_number: number; current_flight_item_id: string | null; tasting_opened_flight_item_id: string | null; reveal_at: string | null; timer_ends_at: string | null; trivia_closes_at: string | null; starts_at: string; location_mode: string; video_call_url: string | null; venue_name: string | null; venue_address: string | null };
  participant: { id: string; displayName: string; status: string; linkedToAccount: boolean; hasEmail: boolean; maskedEmail: string | null };
  flightCount: number; currentItem: CurrentItem | null; currentPosition: number; betweenTeas: boolean;
  trivia: null | { id: string; flightItemId: string; question: string; options: string[]; answerWindowSeconds: number; deadlineAt: string | null; deadlineToken: string | null; selectedIndex: number | null; closed: boolean; correctIndex?: number; explanation?: string };
  responses: Array<{ event_flight_item_id: string; first_impression: string | null; descriptors: string[]; intensity: string | null; rating: number | null; personal_notes: string | null; saved: boolean; completed_at: string | null }>;
  allItems?: CurrentItem[];
  analytics?: { average_rating: number | null } | null;
  participantTrivia?: { answered: number; correct: number; total: number } | null;
};

type PendingTriviaAnswer = { eventId:string; participantId:string; flightItemId:string; questionId:string; selectedIndex:number; deadlineAt:string; deadlineToken:string; answeredAt:string; idempotencyKey:string };

type Draft = { firstImpression: string; descriptors: string[]; intensity: "subtle" | "clear" | "dominant" | null; rating: number; personalNotes: string; saved: boolean; completed: boolean };
type DraftUpdate = Draft | ((draft: Draft) => Draft);
type PendingNoteSave = { flightItemId: string; personalNotes: string };
type NotesSyncStatus = "device" | "saving" | "saved";
const DESCRIPTORS = ["honeyed","orchid","buttery","toasted grain","stone fruit","cream","green bean","jasmine","caramel","mineral","citrus peel","sweet hay"];
const blankDraft: Draft = { firstImpression: "", descriptors: [], intensity: null, rating: 0, personalNotes: "", saved: false, completed: false };

export function GuestExperience({ preview, initialParticipant }: { preview: EventPreview; initialParticipant: { id: string; display_name: string } | null }) {
  const [joined, setJoined] = useState(Boolean(initialParticipant));
  const [name, setName] = useState(initialParticipant?.display_name ?? "");
  const [email, setEmail] = useState("");
  const [marketing, setMarketing] = useState(false);
  const [soundChosen, setSoundChosen] = useState(false);
  const [sound, setSound] = useState(false);
  const [state, setState] = useState<StatePayload | null>(null);
  const [pendingState, setPendingState] = useState<StatePayload | null>(null);
  const [draft, setDraftState] = useState<Draft>(blankDraft);
  const [notesSyncStatus, setNotesSyncStatus] = useState<NotesSyncStatus>("device");
  const [step, setStep] = useState(1);
  const [presenceCount, setPresenceCount] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [triviaChoice, setTriviaChoice] = useState<number | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [roundTripMs, setRoundTripMs] = useState(0);
  const sequenceRef = useRef(-1);
  const currentItemRef = useRef<string | null>(null);
  const clockOffsetRef = useRef(0);
  const pendingDeliveryRef = useRef<(pending:PendingTriviaAnswer)=>Promise<boolean>>(async()=>false);
  const stateRef = useRef<StatePayload | null>(null);
  const pendingStateRef = useRef<StatePayload | null>(null);
  const draftRef = useRef<Draft>(blankDraft);
  const notesProtectedRef = useRef(false);
  const activeFlightIdRef = useRef<string | null>(null);
  const lastSavedNotesRef = useRef(new Map<string, string>());
  const latestQueuedNotesRef = useRef(new Map<string, PendingNoteSave>());
  const notesSaveChainRef = useRef<Promise<void>>(Promise.resolve());

  const setDraft = useCallback((update: DraftUpdate) => {
    setDraftState(current => {
      const next = typeof update === "function" ? update(current) : update;
      draftRef.current = next;
      return next;
    });
  }, []);

  const queuePersonalNotes = useCallback((flightItemId: string, personalNotes: string) => {
    if (lastSavedNotesRef.current.get(flightItemId) === personalNotes) {
      if (activeFlightIdRef.current === flightItemId) setNotesSyncStatus("saved");
      return notesSaveChainRef.current;
    }

    const pending = { flightItemId, personalNotes };
    latestQueuedNotesRef.current.set(flightItemId, pending);
    if (activeFlightIdRef.current === flightItemId) setNotesSyncStatus("saving");

    const save = notesSaveChainRef.current.catch(() => undefined).then(async () => {
      if (latestQueuedNotesRef.current.get(flightItemId) !== pending) return;
      try {
        const response = await fetch(`/api/events/${preview.id}/notes`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(pending),
          keepalive: true
        });
        if (!response.ok) throw new Error("Notes save rejected.");
        lastSavedNotesRef.current.set(flightItemId, personalNotes);
        if (latestQueuedNotesRef.current.get(flightItemId) === pending) {
          latestQueuedNotesRef.current.delete(flightItemId);
          if (activeFlightIdRef.current === flightItemId) setNotesSyncStatus("saved");
        }
      } catch {
        if (latestQueuedNotesRef.current.get(flightItemId) === pending && activeFlightIdRef.current === flightItemId) {
          setNotesSyncStatus("device");
        }
      }
    });
    notesSaveChainRef.current = save;
    return save;
  }, [preview.id]);

  const applySnapshot = useCallback((next: StatePayload) => {
    stateRef.current = next;
    activeFlightIdRef.current = next.currentItem?.id ?? null;
    setState(next);
    if (next.trivia?.selectedIndex !== null && next.trivia?.selectedIndex !== undefined) setTriviaChoice(next.trivia.selectedIndex);
    else if (next.event.phase !== "trivia") setTriviaChoice(null);
    if (!next.currentItem) return;

    const changedTea = currentItemRef.current !== next.currentItem.id;
    const stored = next.responses.find(response => response.event_flight_item_id === next.currentItem?.id);
    const local = loadDraft(preview.id, next.participant.id, next.currentItem.id);
    const storedNotes = stored?.personal_notes ?? "";
    const serverDraft = stored ? {
      firstImpression: stored.first_impression ?? "",
      descriptors: stored.descriptors ?? [],
      intensity: stored.intensity as Draft["intensity"],
      rating: stored.rating ?? 0,
      personalNotes: stored.personal_notes ?? local.personalNotes,
      saved: stored.saved,
      completed: Boolean(stored.completed_at)
    } : local;
    lastSavedNotesRef.current.set(next.currentItem.id, storedNotes);
    if (changedTea) {
      currentItemRef.current = next.currentItem.id;
      draftRef.current = serverDraft;
      setDraftState(serverDraft);
      setNotesSyncStatus(serverDraft.personalNotes === storedNotes ? "saved" : "device");
      setStep(stored?.completed_at ? 5 : 1);
    } else if (storedNotes === draftRef.current.personalNotes) {
      setNotesSyncStatus("saved");
    }
  }, [preview.id]);

  const refresh = useCallback(async () => {
    if (!joined) return;
    const requestStartedAt = Date.now();
    const response = await fetch(`/api/events/${preview.id}/state`, { cache: "no-store" });
    const responseReceivedAt = Date.now();
    if (response.status === 401) { setJoined(false); return; }
    if (!response.ok) return;
    const next = await response.json() as StatePayload;
    const nextOffset = estimateClockOffset(next.serverTime, requestStartedAt, responseReceivedAt,next.serverReceivedTime);
    clockOffsetRef.current = nextOffset;
    setClockOffsetMs(nextOffset);
    setRoundTripMs(responseReceivedAt-requestStartedAt);
    if (next.event.sequence_number < sequenceRef.current) return;
    sequenceRef.current = next.event.sequence_number;
    const current = stateRef.current;
    if (current && next.event.sequence_number > current.event.sequence_number && current.currentItem) {
      void queuePersonalNotes(current.currentItem.id, draftRef.current.personalNotes);
    }
    if (shouldHoldGuestTransition({
      currentSequence: current?.event.sequence_number ?? null,
      nextSequence: next.event.sequence_number,
      notesActive: notesProtectedRef.current,
      alreadyHolding: Boolean(pendingStateRef.current)
    })) {
      pendingStateRef.current = next;
      setPendingState(next);
      return;
    }
    pendingStateRef.current = null;
    setPendingState(null);
    applySnapshot(next);
  }, [applySnapshot, joined, preview.id, queuePersonalNotes]);

  const showPendingTransition = useCallback(() => {
    const next = pendingStateRef.current;
    if (!next) return;
    const currentFlightId = stateRef.current?.currentItem?.id;
    if (currentFlightId) void queuePersonalNotes(currentFlightId, draftRef.current.personalNotes);
    pendingStateRef.current = null;
    setPendingState(null);
    applySnapshot(next);
  }, [applySnapshot, queuePersonalNotes]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem("vf:interface-sound");
        if (saved === "on" || saved === "off") { setSound(saved === "on"); setSoundChosen(true); }
      } catch { /* Preferences are optional. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    if (!joined) return;
    const supabase = createClient();
    const channel = supabase.channel(`event-${preview.invite_code}`, { config: { presence: { key: initialParticipant?.id ?? crypto.randomUUID() } } });
    channel.on("broadcast", { event: "phase.changed" }, () => refresh());
    channel.on("presence", { event: "sync" }, () => setPresenceCount(Object.keys(channel.presenceState()).length));
    channel.subscribe(status => { if (status === "SUBSCRIBED") channel.track({ displayName: name, onlineAt: new Date().toISOString() }); });
    async function heartbeat() {
      const requestStartedAt=Date.now();
      try {
        const response=await fetch(`/api/events/${preview.id}/heartbeat`,{method:"POST",cache:"no-store"});
        const responseReceivedAt=Date.now();
        if (!response.ok) return;
        const payload=await response.json() as {serverReceivedTime?:string;serverTime?:string;sequenceNumber?:number|null};
        if (payload.serverTime) {
          const offset=estimateClockOffset(payload.serverTime,requestStartedAt,responseReceivedAt,payload.serverReceivedTime);
          clockOffsetRef.current=offset;setClockOffsetMs(offset);setRoundTripMs(responseReceivedAt-requestStartedAt);
        }
        const pending=loadPendingTrivia();
        if(pending){
          if(correctedNow(Date.now(),clockOffsetRef.current)>new Date(pending.deadlineAt).getTime()+TRIVIA_GRACE_MS)clearPendingTrivia();
          else void pendingDeliveryRef.current(pending);
        }
        if (typeof payload.sequenceNumber==="number"&&payload.sequenceNumber>sequenceRef.current) await refresh();
      } catch { /* The global offline banner reports connectivity loss. */ }
    }
    const heartbeatTimer = window.setInterval(()=>{void heartbeat()},5000);
    const foreground = () => { if (document.visibilityState==="visible") { void heartbeat(); void refresh(); } };
    document.addEventListener("visibilitychange",foreground);
    window.addEventListener("online",foreground);
    return () => { window.clearInterval(heartbeatTimer); document.removeEventListener("visibilitychange",foreground); window.removeEventListener("online",foreground); supabase.removeChannel(channel); };
  }, [joined, preview.id, preview.invite_code, refresh, name, initialParticipant?.id]);

  useEffect(() => {
    if (!state?.currentItem) return;
    saveLocalDraft(preview.id, state.participant.id, state.currentItem.id, draft);
  }, [draft, preview.id, state?.participant.id, state?.currentItem]);

  useEffect(() => {
    const flightItemId = state?.currentItem?.id;
    if (!flightItemId || lastSavedNotesRef.current.get(flightItemId) === draft.personalNotes) return;
    setNotesSyncStatus("device");
    const timer = window.setTimeout(() => {
      void queuePersonalNotes(flightItemId, draft.personalNotes);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [draft.personalNotes, queuePersonalNotes, state?.currentItem?.id]);

  useEffect(() => {
    const retryNotes = () => {
      for (const pending of latestQueuedNotesRef.current.values()) {
        void queuePersonalNotes(pending.flightItemId, pending.personalNotes);
      }
    };
    window.addEventListener("online", retryNotes);
    return () => window.removeEventListener("online", retryNotes);
  }, [queuePersonalNotes]);

  useEffect(() => {
    const closesAt = state?.event.trivia_closes_at;
    if (!closesAt || state?.event.phase !== "trivia") return;
    const delay = Math.max(0, new Date(closesAt).getTime() - correctedNow(Date.now(),clockOffsetRef.current)) + 75;
    const timer = window.setTimeout(() => refresh(), delay);
    return () => window.clearTimeout(timer);
  }, [state?.event.trivia_closes_at, state?.event.phase, refresh]);

  useEffect(()=>{
    pendingDeliveryRef.current=async(pending:PendingTriviaAnswer)=>{
      try {
        const response=await fetch(`/api/events/${preview.id}/trivia`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(pending)});
        const result=await response.json().catch(()=>({}));
        if(!response.ok){
          if(response.status===401||response.status===403)clearPendingTrivia();
          else setError("Your answer is saved on this device and will send when you reconnect.");
          return false;
        }
        clearPendingTrivia();setTriviaChoice(result.selectedIndex??pending.selectedIndex);setError("");return true;
      }catch{setError("Your answer is saved on this device and will send when you reconnect.");return false}
    };
    return()=>{pendingDeliveryRef.current=async()=>false};
  },[preview.id]);

  function chooseSound(enabled: boolean) {
    setSound(enabled); setSoundChosen(true);
    try { localStorage.setItem("vf:interface-sound", enabled ? "on" : "off"); } catch { /* Preferences are optional. */ }
  }

  function toggleSound() { chooseSound(!sound); }

  async function join(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const response = await fetch("/api/events/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ inviteCode: preview.invite_code, displayName: name, email, marketingConsent: email ? marketing : null }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setError(result.error ?? "We could not save your seat."); setBusy(false); return; }
    setJoined(true); setBusy(false);
  }

  async function submitResponse(completed = false, patch: Partial<Draft> = {}) {
    if (!state?.currentItem) return false;
    setBusy(true); setError("");
    await queuePersonalNotes(state.currentItem.id, draftRef.current.personalNotes);
    const latestDraft = draftRef.current;
    const payload = { ...latestDraft, ...patch, flightItemId: state.currentItem.id, completed: completed || latestDraft.completed };
    const response = await fetch(`/api/events/${preview.id}/response`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) { setError(result.error ?? "We could not save that just now."); return false; }
    if (draftRef.current.personalNotes === payload.personalNotes) {
      lastSavedNotesRef.current.set(state.currentItem.id, payload.personalNotes);
      const queued = latestQueuedNotesRef.current.get(state.currentItem.id);
      if (queued?.personalNotes === payload.personalNotes) latestQueuedNotesRef.current.delete(state.currentItem.id);
      if (activeFlightIdRef.current === state.currentItem.id) setNotesSyncStatus("saved");
    }
    setDraft(d => ({ ...d, ...patch, completed: completed || d.completed }));
    if (sound) ceramicClink();
    return true;
  }

  async function answerTrivia(index: number) {
    if (triviaChoice !== null || !state?.trivia || !state.currentItem || !state.trivia.deadlineAt || !state.trivia.deadlineToken) return;
    const pending:PendingTriviaAnswer={eventId:preview.id,participantId:state.participant.id,flightItemId:state.trivia.flightItemId,questionId:state.trivia.id,selectedIndex:index,deadlineAt:state.trivia.deadlineAt,deadlineToken:state.trivia.deadlineToken,answeredAt:new Date(correctedNow(Date.now(),clockOffsetRef.current)).toISOString(),idempotencyKey:crypto.randomUUID()};
    savePendingTrivia(pending);
    setTriviaChoice(index);
    const delivered=await pendingDeliveryRef.current(pending);
    if (delivered&&sound) ceramicClink();
  }

  const stateParticipantId=state?.participant.id;
  const stateTriviaId=state?.trivia?.id;
  useEffect(()=>{
    if (!joined||!stateParticipantId) return;
    const pending=loadPendingTrivia();
    if (!pending||pending.eventId!==preview.id||pending.participantId!==stateParticipantId) return;
    if (correctedNow(Date.now(),clockOffsetRef.current)>new Date(pending.deadlineAt).getTime()+TRIVIA_GRACE_MS) { clearPendingTrivia(); return; }
    if (stateTriviaId&&stateTriviaId!==pending.questionId) { clearPendingTrivia(); return; }
    window.setTimeout(()=>setTriviaChoice(pending.selectedIndex),0);
    void pendingDeliveryRef.current(pending);
  },[joined,preview.id,state?.event.sequence_number,stateParticipantId,stateTriviaId]);

  if (!joined) return <Registration preview={preview} name={name} setName={setName} email={email} setEmail={setEmail} marketing={marketing} setMarketing={setMarketing} error={error} busy={busy} join={join} />;
  if (!soundChosen) return <SoundEntry onChoose={chooseSound} />;
  if (!state) return <LoadingRoom />;
  if (state.participant.status === "removed") return <Terminal title="You’ve been removed from this tasting." copy="Your notes remain yours and are still available in your recap." />;

  const phase = state.event.phase;
  const frameProps = {
    state,
    draft,
    setDraft,
    sound,
    toggleSound,
    notesSyncStatus,
    transitionNotice: pendingState ? (pendingState.event.phase === "reveal" ? "New reveal — tap to view" : "The tasting has moved on — tap to view") : null,
    onShowTransition: showPendingTransition,
    onNotesActiveChange: (active: boolean) => { notesProtectedRef.current = active; },
    onNotesBlur: () => { if (state.currentItem) void queuePersonalNotes(state.currentItem.id, draftRef.current.personalNotes); }
  };
  if (phase === "lobby") return <WaitingRoom state={state} count={presenceCount} />;
  if (phase === "welcome") return <Ceremony eyebrow={`with your Vintage Fork host`} title="Welcome to the table." subtitle={state.event.title} />;
  if (phase === "reveal" && state.currentItem) return <ScheduledReveal state={state} clockOffsetMs={clockOffsetMs} roundTripMs={roundTripMs} />;
  if (phase === "brewing" && state.currentItem) return <GuestFrame {...frameProps}><Brewing item={state.currentItem} endsAt={state.event.timer_ends_at} clockOffsetMs={clockOffsetMs} /></GuestFrame>;
  if (phase === "trivia" && state.currentItem && state.trivia) return <GuestFrame {...frameProps}><Trivia trivia={state.trivia} choice={triviaChoice} answer={answerTrivia} error={error} saved={draft.saved} toggleSaved={async () => { const next = !draft.saved; if (await submitResponse(false, { saved: next })) setDraft(d => ({ ...d, saved: next })); }} /></GuestFrame>;
  if (["recap","ended"].includes(phase) || state.event.status === "completed") return <GuestRecap state={state} />;
  if (state.betweenTeas) return <BetweenTeas state={state} />;
  if (phase === "tasting" && state.currentItem) return <GuestFrame {...frameProps}>{draft.completed || step === 5 ? <TeaComplete item={state.currentItem} saved={draft.saved} onToggle={async () => { const next = !draft.saved; if (await submitResponse(false, { saved: next })) setDraft(d => ({ ...d, saved: next })); }} /> : <TastingSteps step={step} setStep={setStep} draft={draft} setDraft={setDraft} busy={busy} error={error} submit={async () => { if (await submitResponse(true)) setStep(5); }} />}</GuestFrame>;
  return <LoadingRoom />;
}

function Registration({ preview, name, setName, email, setEmail, marketing, setMarketing, error, busy, join }: { preview: EventPreview; name: string; setName: (x:string)=>void; email:string; setEmail:(x:string)=>void; marketing:boolean; setMarketing:(x:boolean)=>void; error:string; busy:boolean; join:(e:React.FormEvent)=>void }) {
  return <main className="guest-shell" id="main-content"><div className="guest-pane enter"><Brand href="https://vintagefork.ca/" /><div style={{ textAlign: "center", margin: "1.5rem 0" }}><p className="eyebrow">{preview.title}</p><h1 className="page-title">What should we call you tonight?</h1><p className="page-lede">A first name or nickname is plenty.</p></div>{error && <div className="form-error">{error}</div>}<form onSubmit={join} className="stack"><div className="field"><label htmlFor="guest-name">Your name</label><input className="input" id="guest-name" maxLength={40} required value={name} onChange={e => setName(e.target.value)} /></div><div className="field"><label htmlFor="guest-email">Email (optional)</label><input className="input" id="guest-email" type="email" value={email} onChange={e => setEmail(e.target.value)} /><span className="help">Add your email to save this evening to your customer dashboard.</span></div>{email && <label className="row"><input type="checkbox" checked={marketing} onChange={e => setMarketing(e.target.checked)} /> Send me occasional notes about new teas and tastings.</label>}<div className="guest-actions"><button className="btn btn-primary" disabled={busy}>{busy ? "Saving your seat…" : "Save My Seat"}</button></div></form></div></main>;
}
function SoundEntry({ onChoose }: { onChoose:(x:boolean)=>void }) { return <main className="guest-shell" id="main-content"><div className="guest-pane" style={{ justifyContent: "center", textAlign: "center" }}><Brand /><h1 className="page-title">Would you like sound?</h1><p className="page-lede">A little room tone and small confirmations. Your host’s voice comes through Zoom or Meet either way.</p><div className="guest-actions"><button className="btn btn-primary" onClick={() => onChoose(true)}>Yes, with sound</button><button className="btn btn-secondary" onClick={() => onChoose(false)}>No, keep it quiet</button></div></div></main>; }
function LoadingRoom() { return <main className="guest-shell"><div className="guest-pane" style={{ justifyContent: "center", textAlign: "center" }}><Brand /><div className="skeleton" style={{ height: 4, marginTop: 30 }} /><p>Getting the room…</p></div></main>; }
function WaitingRoom({ state, count }: { state: StatePayload; count: number }) { return <main className="guest-shell"><div className="guest-pane" style={{ textAlign: "center" }}><Brand /><h1 className="page-title">You’re in. Your host will open the room shortly.</h1><p className="page-lede">{Math.max(0,count-1)} other{count===2?" is":"s are"} here.</p><section className="card" style={{ marginTop: 20 }}><h2>{state.event.title}</h2><p>{new Date(state.event.starts_at).toLocaleString("en-CA", { dateStyle: "full", timeStyle: "short" })}</p>{state.event.location_mode === "remote" && <div className="notice"><strong>Your host’s voice and captions are in the video call, not here.</strong><br />Keep the call on your computer or tablet and this tasting on your phone.{state.event.video_call_url && <div style={{ marginTop: 12 }}><a className="btn btn-secondary" href={state.event.video_call_url} target="_blank" rel="noreferrer">Open video call ↗</a></div>}</div>}{state.event.location_mode === "in_person" && (state.event.venue_name || state.event.venue_address) && <div className="notice"><strong>{state.event.venue_name}</strong><br />{state.event.venue_address}</div>}</section><div className="guest-actions"><p className="muted">Waiting for your host…</p></div></div></main>; }
function BetweenTeas({ state }: { state: StatePayload }) { return <main className="guest-shell" id="main-content"><div className="guest-pane" style={{ textAlign:"center", justifyContent:"center" }}><Brand /><p className="eyebrow">{Math.max(0,state.flightCount-state.currentPosition+1)} tea{state.flightCount-state.currentPosition+1===1?"":"s"} to go</p><h1 className="page-title">Rinse your cup and settle in.</h1><p className="page-lede">Your host will reveal the next tea shortly.</p></div></main>; }
function Ceremony({ eyebrow, title, subtitle }: { eyebrow:string; title:string; subtitle:string }) { return <main className="ceremony" id="main-content"><div><p className="eyebrow">{eyebrow}</p><h1 className="display">{title}</h1><div className="ceremony-rule" /><p>{subtitle}</p></div></main>; }
function ScheduledReveal({ state, clockOffsetMs, roundTripMs }: { state: StatePayload; clockOffsetMs:number; roundTripMs:number }) {
  const [now,setNow]=useState<number|null>(null);
  const rendered=useRef(false);
  useEffect(()=>{
    if (!state.event.reveal_at||!state.currentItem) return;
    const revealAt=new Date(state.event.reveal_at).getTime();
    const reducedMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const report=(kind:"ready"|"rendered",observedAt:number)=>fetch(`/api/events/${state.event.id}/reveal-sync`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind,sequenceNumber:state.event.sequence_number,flightItemId:state.currentItem?.id,observedAt:new Date(observedAt).toISOString(),clockOffsetMs:Math.round(clockOffsetMs),roundTripMs:Math.round(roundTripMs),reducedMotion})}).catch(()=>undefined);
    const initialNow=correctedNow(Date.now(),clockOffsetMs);
    if (initialNow<revealAt) void report("ready",initialNow);
    const tick=()=>{const next=correctedNow(Date.now(),clockOffsetMs);setNow(next);if(next>=revealAt&&!rendered.current){rendered.current=true;void report("rendered",next)}};
    const firstTick=window.setTimeout(tick,0);
    const timer=window.setInterval(tick,25);
    return()=>{window.clearTimeout(firstTick);window.clearInterval(timer)};
  },[state.event.id,state.event.reveal_at,state.event.sequence_number,state.currentItem,clockOffsetMs,roundTripMs]);
  const revealAt=state.event.reveal_at?new Date(state.event.reveal_at).getTime():0;
  const revealed=!revealAt||(now!==null&&now>=revealAt);
  return revealed&&state.currentItem?<Ceremony eyebrow={`Tea ${state.currentPosition} of ${state.flightCount}`} title={state.currentItem.reveal_title} subtitle={`${state.currentItem.tea?.origin ?? ""} · ${state.currentItem.reveal_description}`} />:<Ceremony eyebrow={`Tea ${state.currentPosition} of ${state.flightCount}`} title="Ready at the table." subtitle="Your host is revealing the next tea." />;
}
function GuestFrame({ state, draft, setDraft, sound, toggleSound, notesSyncStatus, transitionNotice, onShowTransition, onNotesActiveChange, onNotesBlur, children }: { state: StatePayload; draft: Draft; setDraft:(update:DraftUpdate)=>void; sound:boolean; toggleSound:()=>void; notesSyncStatus:NotesSyncStatus; transitionNotice:string|null; onShowTransition:()=>void; onNotesActiveChange:(active:boolean)=>void; onNotesBlur:()=>void; children:React.ReactNode }) {
  const focused = useRef(false);
  const composing = useRef(false);
  const reportActivity = () => onNotesActiveChange(focused.current || composing.current);
  const syncCopy = notesSyncStatus === "saved" ? "Saved." : notesSyncStatus === "saving" ? "Saving…" : "Saved on this device. We’ll sync when you’re connected.";
  return <main className="guest-shell" id="main-content"><header className="guest-header"><Brand compact /><strong>{state.currentItem?.reveal_title}</strong><span className="spacer" /><span className="chip">Tea {state.currentPosition} of {state.flightCount}</span><button className="btn btn-quiet" aria-pressed={sound} aria-label={`Interface sounds ${sound ? "on" : "off"}`} onClick={toggleSound}>{sound ? "♪ On" : "♪ Off"}</button></header><div className="guest-pane"><details className="card" style={{ marginBottom: 16 }}><summary>Your notes</summary><textarea className="textarea" aria-label="Personal notes" maxLength={3000} value={draft.personalNotes} onFocus={() => { focused.current = true; reportActivity(); }} onBlur={() => { focused.current = false; reportActivity(); onNotesBlur(); }} onCompositionStart={() => { composing.current = true; reportActivity(); }} onCompositionEnd={() => { composing.current = false; reportActivity(); }} onChange={e => setDraft(d => ({ ...d, personalNotes: e.target.value }))} placeholder="Anything you want to remember…" /><p className="help" role="status" aria-live="polite">{syncCopy}</p></details>{transitionNotice && <div className="notice guest-transition-notice" role="status" aria-live="polite"><strong>{transitionNotice}</strong><button className="btn btn-secondary" onClick={onShowTransition}>View now</button></div>}{children}</div></main>;
}
function Brewing({ item, endsAt, clockOffsetMs }: { item: CurrentItem; endsAt:string|null; clockOffsetMs:number }) { const [now,setNow]=useState<number|null>(null); useEffect(()=>{const tick=()=>setNow(correctedNow(Date.now(),clockOffsetMs));tick();const t=window.setInterval(tick,250);return()=>window.clearInterval(t)},[clockOffsetMs]); const remaining=endsAt&&now!==null?Math.max(0,new Date(endsAt).getTime()-now):item.steep_seconds*1000; return <><p className="eyebrow">Brewing</p><h1 className="page-title">Brew it like this</h1><p>{item.temperature_c ? `${item.temperature_c}°C` : "Hot water"} · {item.leaf_grams ? `${item.leaf_grams}g` : ""} {item.water_ml ? `per ${item.water_ml}ml` : ""}</p><div className="timer-ring" role="timer" aria-live={remaining<=10_000?"polite":"off"}><div><div className="timer-readout">{formatClock(remaining)}</div><small className="muted">host controlled</small></div></div><section className="card"><p>{item.brewing_instructions}</p></section></>; }
function TastingSteps({ step, setStep, draft, setDraft, busy, error, submit }: { step:number; setStep:(x:number)=>void; draft:Draft; setDraft:(x:Draft|((d:Draft)=>Draft))=>void; busy:boolean; error:string; submit:()=>void }) { return <>{error && <div className="form-error">{error}</div>}{step===1&&<><p className="eyebrow">Step 1 of 4</p><h1 className="page-title">What did you notice first?</h1><p className="muted">Optional. No wrong answers.</p><textarea className="textarea" aria-label="First impression" value={draft.firstImpression} onChange={e=>setDraft(d=>({...d,firstImpression:e.target.value}))}/><div className="guest-actions"><button className="btn btn-primary" onClick={()=>setStep(2)}>Continue</button><button className="btn btn-quiet" onClick={()=>setStep(2)}>Skip</button></div></>}{step===2&&<><p className="eyebrow">Step 2 of 4</p><h1 className="page-title">What do you notice?</h1><p className="muted">Pick up to three.</p><div className="descriptor-grid">{DESCRIPTORS.map(label=><button className="descriptor" aria-pressed={draft.descriptors.includes(label)} key={label} onClick={()=>setDraft(d=>({ ...d, descriptors:d.descriptors.includes(label)?d.descriptors.filter(x=>x!==label):d.descriptors.length<3?[...d.descriptors,label]:d.descriptors }))}>{label}</button>)}</div><div className="guest-actions"><button className="btn btn-primary" onClick={()=>setStep(3)}>Continue</button></div></>}{step===3&&<><p className="eyebrow">Step 3 of 4</p><h1 className="page-title">How strong was this tea overall?</h1><div className="grid grid-3">{(["subtle","clear","dominant"] as const).map(x=><button className={`btn ${draft.intensity===x?"btn-gold":"btn-secondary"}`} key={x} onClick={()=>setDraft(d=>({...d,intensity:x}))}>{x}</button>)}</div><div className="guest-actions"><button className="btn btn-primary" onClick={()=>setStep(4)}>Continue</button></div></>}{step===4&&<><p className="eyebrow">Step 4 of 4</p><h1 className="page-title">Rate this tea overall</h1><div className="rating" role="radiogroup">{[1,2,3,4,5].map(n=><button className={draft.rating>=n?"active":""} role="radio" aria-checked={draft.rating===n} aria-label={`${n} stars`} key={n} onClick={()=>setDraft(d=>({...d,rating:n}))}>★</button>)}</div><div className="guest-actions"><button className="btn btn-primary" disabled={busy||draft.rating<1} onClick={submit}>{busy?"Saving…":"Submit My Notes"}</button></div></>}</>; }
function TeaComplete({ item, saved, onToggle }: { item:CurrentItem; saved:boolean; onToggle:()=>void }) { return <div style={{ textAlign:"center" }}><div style={{ width:168,height:168,border:"2px solid var(--vf-gold)",borderRadius:"50%",display:"grid",placeItems:"center",margin:"1rem auto" }}><div><strong>{item.reveal_title.toUpperCase()}</strong><br /><span style={{ fontSize:32 }}>✦</span></div></div><h1 className="page-title">Stamped. Tea {item.position}.</h1><section className="card" style={{ marginTop:20 }}><h2>Save This Tea</h2><p>Save it to include it in your customer dashboard.</p><button className={`btn ${saved?"btn-secondary":"btn-primary"}`} onClick={onToggle}>{saved?"Remove from Saved":"Save This Tea"}</button></section><div className="guest-actions"><p className="muted">Your host will introduce the next step.</p></div></div>; }
function Trivia({ trivia, choice, answer, error, saved, toggleSaved }: { trivia:NonNullable<StatePayload["trivia"]>; choice:number|null; answer:(i:number)=>void; error:string; saved:boolean; toggleSaved:()=>void }) { return <><p className="eyebrow">Trivia</p><h1 className="page-title">{trivia.question}</h1>{error&&<div className="form-error">{error}</div>}<div className="stack">{trivia.options.map((x,i)=><button className={`btn ${choice===i?"btn-primary":"btn-secondary"}`} disabled={choice!==null||trivia.closed} key={x} onClick={()=>answer(i)}>{x}</button>)}</div>{choice!==null&&!trivia.closed&&<div className="notice" style={{ marginTop:16 }}>Answer locked in. Waiting for the host…</div>}{trivia.closed&&<section className={`notice ${choice===trivia.correctIndex?"success":""}`} style={{ marginTop:16 }}><strong>{choice===trivia.correctIndex?"That’s it.":`The answer was ${trivia.options[trivia.correctIndex ?? 0]}.`}</strong><br />{trivia.explanation}</section>}{trivia.closed&&<section className="card" style={{ marginTop:16 }}><h2>Your Passport</h2><p>This tea is stamped. Save it to keep it in your customer dashboard.</p><button className={`btn ${saved?"btn-secondary":"btn-primary"}`} onClick={toggleSaved}>{saved?"Remove from Saved":"Save This Tea"}</button></section>}</>; }
type SaveTeaRequest = (eventId: string, flightItemId: string, saved: boolean) => Promise<{ saved: boolean }>;

export function GuestRecap({ state, saveTeaRequest = persistGuestSavedTea }: { state: StatePayload; saveTeaRequest?: SaveTeaRequest }) {
  const [deleted, setDeleted] = useState(false);
  const [savedByTea, setSavedByTea] = useState<Record<string, boolean>>(() => Object.fromEntries(
    (state.allItems ?? []).map(item => [
      item.id,
      Boolean(state.responses.find(response => response.event_flight_item_id === item.id)?.saved)
    ])
  ));
  const [savingTeaId, setSavingTeaId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ teaId: string; text: string; error: boolean } | null>(null);
  if (deleted) return <Terminal title="Your tasting data has been deleted." copy="Your notes, ratings, answers, stamps and saved teas from this tasting are gone." />;

  const own = state.responses;
  const savedCount = Object.values(savedByTea).filter(Boolean).length;
  const participantTrivia = state.participantTrivia ?? { answered: 0, correct: 0, total: 0 };

  async function toggleSavedTea(teaId: string) {
    const nextSaved = !savedByTea[teaId];
    setSavingTeaId(teaId);
    setSaveMessage(null);
    try {
      const result = await saveTeaRequest(state.event.id, teaId, nextSaved);
      setSavedByTea(current => ({ ...current, [teaId]: result.saved }));
      setSaveMessage({ teaId, text: result.saved ? "Saved to your evening." : "Removed from your saved teas.", error: false });
    } catch (caught) {
      setSaveMessage({
        teaId,
        text: caught instanceof Error ? caught.message : "We couldn’t update that saved tea.",
        error: true
      });
    } finally {
      setSavingTeaId(null);
    }
  }

  return <main className="guest-shell" id="main-content"><div className="guest-pane"><div style={{ textAlign: "center" }}><Brand /><h1 className="page-title">Your evening, {state.participant.displayName}</h1><p className="muted">{state.event.title}</p></div><div className="grid grid-3" style={{ marginTop: 20 }}><div className="card"><strong className="display" style={{ fontSize: 34 }}>{state.analytics?.average_rating ?? "—"}</strong><p>room average</p></div><div className="card"><strong className="display" style={{ fontSize: 34 }}>{savedCount}</strong><p>you saved</p></div><div className="card"><strong className="display" style={{ fontSize: 34 }} aria-label={participantTrivia.total ? `${participantTrivia.correct} correct trivia answers` : "No trivia questions"}>{participantTrivia.total ? participantTrivia.correct : "—"}</strong><p>{participantTrivia.total ? `correct · answered ${participantTrivia.answered} of ${participantTrivia.total}` : "no trivia questions"}</p></div></div><div className="section-label"><span>Your teas</span></div><div className="stack">{(state.allItems ?? []).map(item => { const response = own.find(candidate => candidate.event_flight_item_id === item.id); const tasted = Boolean(response?.completed_at); const ratingLabel = !tasted ? "Not tasted" : response?.rating ? `${response.rating} out of 5 stars` : "Rating not recorded"; const isSaved = Boolean(savedByTea[item.id]); const isSaving = savingTeaId === item.id; return <article className="card" key={item.id}><div className="card-header"><div><h2 className="card-title">{item.reveal_title}</h2><p className="card-meta">{item.tea?.origin}</p></div><span aria-label={ratingLabel}>{tasted && response?.rating ? `${"★".repeat(response.rating)}${"☆".repeat(5 - response.rating)}` : ratingLabel}</span></div><p>{tasted ? response?.descriptors?.join(" · ") || "No descriptors recorded" : "This tea wasn’t tasted."}</p>{isSaved && <span className="chip chip-success">Saved to remember</span>}<div className="card-footer"><button className={`btn ${isSaved ? "btn-secondary" : "btn-primary"}`} type="button" disabled={isSaving || Boolean(savingTeaId && !isSaving)} aria-pressed={isSaved} onClick={() => toggleSavedTea(item.id)}>{isSaving ? "Saving…" : isSaved ? "Remove from saved teas" : "Save this tea"}</button></div>{saveMessage?.teaId === item.id && <div className={saveMessage.error ? "form-error" : "notice success"} role={saveMessage.error ? "alert" : "status"}>{saveMessage.text}</div>}</article>; })}</div><div className="section-label"><span>Keep your recap</span></div><RecapPrivacyControls state={state} onDeleted={() => setDeleted(true)} /><div className="guest-actions"><ClaimButton eventId={state.event.id} linked={state.participant.linkedToAccount} /></div></div></main>;
}

async function persistGuestSavedTea(eventId: string, flightItemId: string, saved: boolean) {
  const response = await fetch(`/api/events/${eventId}/saved-tea`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ flightItemId, saved })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? "We couldn’t update that saved tea.");
  return { saved: Boolean(result.saved) };
}

function RecapPrivacyControls({ state, onDeleted }: { state: StatePayload; onDeleted: () => void }) {
  const [email, setEmail] = useState("");
  const [editingEmail, setEditingEmail] = useState(!state.participant.hasEmail);
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [emailMessage, setEmailMessage] = useState("");
  const [maskedEmail, setMaskedEmail] = useState(state.participant.maskedEmail);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function sendRecap() {
    setEmailStatus("sending");
    setEmailMessage("");
    try {
      const response = await fetch(`/api/events/${state.event.id}/recap-email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() || undefined })
      });
      const result = await response.json().catch(() => ({}));
      if (typeof result.attemptsRemaining === "number") setAttemptsRemaining(result.attemptsRemaining);
      if (!response.ok) throw new Error(result.error ?? "We couldn’t send that recap.");
      setMaskedEmail(result.maskedEmail ?? maskedEmail);
      setEmailStatus("sent");
      setEditingEmail(false);
      setEmail("");
      setEmailMessage(`Your recap is on its way to ${result.maskedEmail ?? "your email"}.`);
    } catch (caught) {
      setEmailStatus("failed");
      setEmailMessage(caught instanceof Error ? caught.message : "We couldn’t send that recap.");
    }
  }

  async function deleteData() {
    setDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch(`/api/events/${state.event.id}/privacy`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: "{}"
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "We couldn’t delete your tasting data just now.");
      try { clearGuestDeviceData(localStorage, sessionStorage, state.event.id, state.participant.id); } catch { /* Device storage is optional. */ }
      onDeleted();
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : "We couldn’t delete your tasting data just now.");
    } finally {
      setDeleting(false);
    }
  }

  const noRetriesRemain = attemptsRemaining === 0;
  return <div className="stack"><section className="card"><h2 className="card-title">Email me my recap</h2><p>Get your own ratings, descriptors, notes and saved teas, plus a private link to delete this tasting data later.</p>{editingEmail && <div className="field"><label htmlFor="recap-email">Email address</label><input className="input" id="recap-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder={maskedEmail ?? "you@example.com"} /></div>}{emailMessage && <div className={emailStatus === "sent" ? "notice success" : "form-error"} role={emailStatus === "sent" ? "status" : "alert"}>{emailMessage}</div>}{attemptsRemaining !== null && <p className="help">{attemptsRemaining} resend{attemptsRemaining === 1 ? "" : "s"} remaining in the next 24 hours.</p>}<div className="row" style={{ marginTop: 16 }}><button className="btn btn-primary" type="button" disabled={emailStatus === "sending" || noRetriesRemain || (editingEmail && !email.trim())} onClick={sendRecap}>{emailStatus === "sending" ? "Sending…" : emailStatus === "sent" ? "Send this to me again" : emailStatus === "failed" ? "Try again" : "Send my recap"}</button>{!editingEmail && <button className="btn btn-quiet" type="button" onClick={() => setEditingEmail(true)}>Use another address</button>}</div></section><section className="card"><h2 className="card-title">Your tasting data</h2>{!confirmingDelete ? <><p>You can permanently remove your notes, ratings, answers, stamps and saved teas from this tasting.</p><button className="btn btn-secondary" type="button" onClick={() => setConfirmingDelete(true)}>Delete my tasting data</button></> : <><div className="notice error"><strong>This cannot be undone.</strong><p style={{ margin: "8px 0 0" }}>Your tasting data will be permanently deleted. Your Vintage Fork account, if you have one, will not be deleted.</p></div>{deleteError && <div className="form-error" role="alert">{deleteError}</div>}<div className="row" style={{ marginTop: 16 }}><button className="btn btn-danger" type="button" disabled={deleting} onClick={deleteData}>{deleting ? "Deleting…" : "Yes, delete my tasting data"}</button><button className="btn btn-secondary" type="button" disabled={deleting} onClick={() => { setConfirmingDelete(false); setDeleteError(""); }}>Keep my data</button></div></>}</section></div>;
}
function ClaimButton({eventId,linked}:{eventId:string;linked:boolean}){const[busy,setBusy]=useState(false);const[message,setMessage]=useState("");async function claim(){if(linked){window.location.href="/dashboard";return}setBusy(true);const response=await fetch(`/api/events/${eventId}/claim`,{method:"POST"});const result=await response.json().catch(()=>({}));if(response.status===401){window.location.href=`/login?next=${encodeURIComponent(window.location.pathname)}`;return}if(!response.ok){setMessage(result.error??"The tasting could not be linked.");setBusy(false);return}window.location.href="/dashboard"}return <><button className="btn btn-primary" disabled={busy} onClick={claim}>{linked?"Open My Tea Cellar":busy?"Saving…":"Save to My Tea Cellar"}</button>{message&&<div className="form-error">{message}</div>}</>}

function Terminal({ title, copy }: { title:string; copy:string }) { return <main className="guest-shell"><div className="guest-pane" style={{ justifyContent:"center",textAlign:"center" }}><Brand /><h1 className="page-title">{title}</h1><p>{copy}</p></div></main>; }
function formatClock(ms:number){const total=Math.max(0,Math.ceil(ms/1000));return `${Math.floor(total/60)}:${String(total%60).padStart(2,"0")}`;}
function draftKey(eventId:string,participantId:string,flightId:string){return `vf:draft:${eventId}:${participantId}:${flightId}`;}
function loadDraft(eventId:string,participantId:string,flightId:string):Draft{try{const raw=localStorage.getItem(draftKey(eventId,participantId,flightId));return raw?{...blankDraft,...JSON.parse(raw)}:blankDraft}catch{return blankDraft}}
function saveLocalDraft(eventId:string,participantId:string,flightId:string,draft:Draft){try{localStorage.setItem(draftKey(eventId,participantId,flightId),JSON.stringify(draft))}catch{}}
function loadPendingTrivia():PendingTriviaAnswer|null{try{const raw=sessionStorage.getItem("pending_trivia_answer");return raw?JSON.parse(raw) as PendingTriviaAnswer:null}catch{return null}}
function savePendingTrivia(pending:PendingTriviaAnswer){try{sessionStorage.setItem("pending_trivia_answer",JSON.stringify(pending))}catch{}}
function clearPendingTrivia(){try{sessionStorage.removeItem("pending_trivia_answer")}catch{}}
function ceramicClink(){try{const C=window.AudioContext||(window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext;const ctx=new C();const o=ctx.createOscillator();const g=ctx.createGain();o.frequency.value=1180;g.gain.setValueAtTime(.0001,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.045,ctx.currentTime+.02);g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.16);o.connect(g).connect(ctx.destination);o.start();o.stop(ctx.currentTime+.18)}catch{}}
