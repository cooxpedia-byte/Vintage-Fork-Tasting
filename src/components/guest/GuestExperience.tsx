"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Brand } from "@/components/Brand";
import { withNextPath } from "@/lib/auth-redirect";
import { correctedNow, estimateClockOffset, TRIVIA_GRACE_MS } from "@/lib/live-timing";
import { shouldHoldGuestTransition } from "@/lib/guest-notes";
import { clearGuestDeviceData } from "@/lib/guest-privacy";
import { GuestError } from "@/components/guest/GuestError";
import { GuestPhaseAnnouncer } from "@/components/guest/GuestPhaseAnnouncer";
import { ConductorStageHeader } from "@/components/guest/ConductorStageHeader";
import { AgoraVideoRoom } from "@/components/live/AgoraVideoRoom";
import { LiveCommunication } from "@/components/live/LiveCommunication";
import { SharedBrewingTimer } from "@/components/live/SharedBrewingTimer";
import {RoomDiscoveryCard} from "@/components/live/RoomDiscoveryCard";
import {GroupDiscoveryReveal} from "@/components/live/GroupDiscoveryReveal";
import {VirtualTeaCheers} from "@/components/live/VirtualTeaCheers";
import {LiveGoldLeaves} from "@/components/live/LiveGoldLeaves";
import {LiveIdentityReveal} from "@/components/live/LiveIdentityReveal";
import {ConversationPromptCard} from "@/components/live/ConversationPromptCard";
import {LivingMapExperience} from "@/components/live/LivingMapExperience";
import { FlavorDescriptorPicker } from "@/components/tea-lab/FlavorDescriptorPicker";
import { playInterfaceFeedback, playInterfaceSound, setInterfaceFeedbackPreference } from "@/components/InterfaceFeedback";
import { getGuestPhaseAnnouncement } from "@/lib/guest-announcements";
import { getConductorStage, resolveConductorStage, type ConductorStage } from "@/lib/conductor";
import { DISCOVERY_FIRST_COPY, liveAttentionOrder } from "@/lib/discovery-first";
import { TEA_DESCRIPTOR_PALETTE } from "@/lib/tea-lab/descriptors";
import type { SharedBrew } from "@/lib/shared-brewing";
import { breakoutMilestone,breakoutRemainingMs,type BreakoutSignal,type BreakoutState } from "@/lib/breakouts";
import type {DiscoveryBoardState,DiscoveryCard,DiscoveryCategory} from "@/lib/discovery-cards";
import type {GroupRevealSnapshot,GroupRevealState} from "@/lib/group-reveal";
import type {ParticipantCheersSnapshot} from "@/lib/cheers";
import type { SessionPhase } from "@/types/domain";
import {
  listenForConnectionRetry,
  reportConnectionHealthy,
  reportConnectionIssue
} from "@/lib/connection-health";

type EventPreview = { id: string; title: string; invite_code: string; status: string; starts_at: string; location_mode: string; capacity: number };
type CurrentItem = { id: string; position: number; reveal_title: string; reveal_description: string; brewing_instructions: string; steep_seconds: number; temperature_c: number | null; leaf_grams: number | null; water_ml: number | null; tea: { name: string; origin: string | null; producer: string | null; tea_type: string | null } | null };
export type StatePayload = {
  serverReceivedTime: string;
  serverTime: string;
  event: { id: string; title: string; status: string; phase: SessionPhase; sequence_number: number; current_flight_item_id: string | null; tasting_opened_flight_item_id: string | null; reveal_at: string | null; timer_ends_at: string | null; trivia_closes_at: string | null; starts_at: string; location_mode: string; video_call_url: string | null; venue_name: string | null; venue_address: string | null; conductor_stage: ConductorStage; conductor_stage_started_at: string | null; conductor_stage_duration_seconds: number | null; conductor_paused_at: string | null; conductor_remaining_seconds: number | null; conductor_sequence_version: number; current_brew_id: string | null;current_breakout_session_id:string|null };
  participant: { id: string; displayName: string; status: string; linkedToAccount: boolean; hasEmail: boolean; maskedEmail: string | null };
  flightCount: number; currentItem: CurrentItem | null; currentPosition: number; betweenTeas: boolean;
  stageSignal: "ready" | "pouring" | "decanted" | null;
  brew: SharedBrew | null;
  brewNote: string;
  breakout:BreakoutState|null;
  discoveryBoard:DiscoveryBoardState|null;
  groupReveal:GroupRevealSnapshot|null;
  cheers:ParticipantCheersSnapshot|null;
  trivia: null | { id: string; flightItemId: string; question: string; options: string[]; questionNumber: number; questionTotal: number; answerWindowSeconds: number; deadlineAt: string | null; deadlineToken: string | null; selectedIndex: number | null; closed: boolean; correctIndex?: number; explanation?: string };
  responses: Array<{ event_flight_item_id: string; aroma_descriptors: string[]; aroma_intensity: string | null; first_impression: string | null; descriptors: string[]; intensity: string | null; rating: number | null; personal_notes: string | null; saved: boolean; completed_at: string | null; stamp_released_at: string | null }>;
  allItems?: CurrentItem[];
  analytics?: { average_rating: number | null } | null;
  participantTrivia?: { answered: number; correct: number; total: number } | null;
};

type PendingTriviaAnswer = { eventId:string; participantId:string; flightItemId:string; questionId:string; selectedIndex:number; deadlineAt:string; deadlineToken:string; answeredAt:string; idempotencyKey:string };
type DiscoveryAction=
  |{action:"add_item";cardId:string;category:DiscoveryCategory;text:string}
  |{action:"remove_item";cardId:string;itemId:string}
  |{action:"update_details";cardId:string;curiosity:string;roomQuote:string;quoteAttributed:boolean}
  |{action:"volunteer"|"withdraw"|"accept_invite"|"pass_invite";cardId:string};

type Draft = { aromaDescriptors:string[]; aromaIntensity:"subtle"|"clear"|"dominant"|null; firstImpression: string; descriptors: string[]; intensity: "subtle" | "clear" | "dominant" | null; rating: number; personalNotes: string; saved: boolean; completed: boolean };
type DraftUpdate = Draft | ((draft: Draft) => Draft);
type PendingNoteSave = { flightItemId: string; personalNotes: string };
type NotesSyncStatus = "device" | "saving" | "saved";
type GuestJoinPayload = { inviteCode: string; displayName: string };
type GuestJoinRequest = (payload: GuestJoinPayload) => Promise<Response>;
type SignedInAccount = { displayName: string; email: string | null };
const LIVE_DESCRIPTOR_OPTIONS = TEA_DESCRIPTOR_PALETTE.map(descriptor => ({
  id: descriptor.label.toLocaleLowerCase("en-CA"),
  label: descriptor.label,
  category: descriptor.category,
  aliases: descriptor.aliases
}));
const blankDraft: Draft = { aromaDescriptors:[], aromaIntensity:null, firstImpression: "", descriptors: [], intensity: null, rating: 0, personalNotes: "", saved: false, completed: false };
const guestConnectionSource = (eventId: string, operation: string) => `guest:${eventId}:${operation}`;

export function GuestExperience({ preview, initialParticipant, account, joinRequest = persistGuestJoin }: { preview: EventPreview; initialParticipant: { id: string; display_name: string } | null; account: SignedInAccount; joinRequest?: GuestJoinRequest }) {
  const [joined, setJoined] = useState(Boolean(initialParticipant));
  const [name, setName] = useState(initialParticipant?.display_name ?? account.displayName);
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
  const soundRef = useRef(false);
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
  const lastConductorStageRef = useRef<ConductorStage | null>(null);
  const lastGroupRevealStateRef=useRef<GroupRevealState|null>(null);
  const returnedBreakoutRef=useRef<string|null>(null);
  const [breakoutNow,setBreakoutNow]=useState(0);

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
        if (!response.ok) {
          if (response.status >= 500) reportConnectionIssue(guestConnectionSource(preview.id, "notes"));
          else reportConnectionHealthy(guestConnectionSource(preview.id, "notes"));
          if (latestQueuedNotesRef.current.get(flightItemId) === pending && activeFlightIdRef.current === flightItemId) {
            setNotesSyncStatus("device");
          }
          return;
        }
        reportConnectionHealthy(guestConnectionSource(preview.id, "notes"));
        lastSavedNotesRef.current.set(flightItemId, personalNotes);
        if (latestQueuedNotesRef.current.get(flightItemId) === pending) {
          latestQueuedNotesRef.current.delete(flightItemId);
          if (activeFlightIdRef.current === flightItemId) setNotesSyncStatus("saved");
        }
      } catch {
        reportConnectionIssue(guestConnectionSource(preview.id, "notes"));
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
      aromaDescriptors: stored.aroma_descriptors ?? [],
      aromaIntensity: stored.aroma_intensity as Draft["aromaIntensity"],
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
    const source = guestConnectionSource(preview.id, "state");
    try {
      const requestStartedAt = Date.now();
      const response = await fetch(`/api/events/${preview.id}/state`, { cache: "no-store" });
      const responseReceivedAt = Date.now();
      if (response.status === 401) { reportConnectionHealthy(source); setJoined(false); return; }
      if (!response.ok) { reportConnectionIssue(source); return; }
      const next = await response.json() as StatePayload;
      reportConnectionHealthy(source);
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
    } catch {
      reportConnectionIssue(source);
    }
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
        if (saved === "on" || saved === "off") { soundRef.current = saved === "on"; setSound(saved === "on"); setSoundChosen(true); }
      } catch { /* Preferences are optional. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  useEffect(() => listenForConnectionRetry(() => { void refresh(); }), [refresh]);
  useEffect(() => () => {
    for (const operation of ["state", "notes", "trivia", "join", "response"]) {
      reportConnectionHealthy(guestConnectionSource(preview.id, operation));
    }
  }, [preview.id]);
  useEffect(() => {
    if (!joined) return;
    const supabase = createClient();
    const channel = supabase.channel(`event-${preview.invite_code}`, { config: { presence: { key: initialParticipant?.id ?? crypto.randomUUID() } } });
    channel.on("broadcast", { event: "phase.changed" }, () => refresh());
    channel.on("presence", { event: "sync" }, () => setPresenceCount(Object.keys(channel.presenceState()).length));
    let disposed = false;
    const realtimeSource = guestConnectionSource(preview.id, "realtime");
    const heartbeatSource = guestConnectionSource(preview.id, "heartbeat");
    channel.subscribe(status => {
      if (disposed) return;
      if (status === "SUBSCRIBED") {
        reportConnectionHealthy(realtimeSource);
        void channel.track({ displayName: name, onlineAt: new Date().toISOString() });
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        reportConnectionIssue(realtimeSource);
      }
    });
    async function heartbeat() {
      const requestStartedAt=Date.now();
      try {
        const response=await fetch(`/api/events/${preview.id}/heartbeat`,{method:"POST",cache:"no-store"});
        const responseReceivedAt=Date.now();
        if (response.status===401) { reportConnectionHealthy(heartbeatSource); setJoined(false); return; }
        if (!response.ok) { reportConnectionIssue(heartbeatSource); return; }
        reportConnectionHealthy(heartbeatSource);
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
      } catch { reportConnectionIssue(heartbeatSource); }
    }
    const heartbeatTimer = window.setInterval(()=>{void heartbeat()},5000);
    const foreground = () => { if (document.visibilityState==="visible") { void heartbeat(); void refresh(); } };
    document.addEventListener("visibilitychange",foreground);
    window.addEventListener("online",foreground);
    return () => { disposed=true; reportConnectionHealthy(realtimeSource); reportConnectionHealthy(heartbeatSource); window.clearInterval(heartbeatTimer); document.removeEventListener("visibilitychange",foreground); window.removeEventListener("online",foreground); void supabase.removeChannel(channel); };
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
          if(response.status>=500)reportConnectionIssue(guestConnectionSource(preview.id,"trivia"));
          else reportConnectionHealthy(guestConnectionSource(preview.id,"trivia"));
          if(response.status===401||response.status===403)clearPendingTrivia();
          else setError("Your answer is saved on this device and will send when you reconnect.");
          return false;
        }
        reportConnectionHealthy(guestConnectionSource(preview.id,"trivia"));
        clearPendingTrivia();setTriviaChoice(result.selectedIndex??pending.selectedIndex);setError("");return true;
      }catch{reportConnectionIssue(guestConnectionSource(preview.id,"trivia"));setError("Your answer is saved on this device and will send when you reconnect.");return false}
    };
    return()=>{pendingDeliveryRef.current=async()=>false};
  },[preview.id]);

  function chooseSound(enabled: boolean) {
    soundRef.current = enabled;
    setSound(enabled); setSoundChosen(true);
    setInterfaceFeedbackPreference(enabled);
  }

  function toggleSound() { chooseSound(!sound); }

  async function join(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const source = guestConnectionSource(preview.id, "join");
    try {
      const response = await joinRequest({ inviteCode: preview.invite_code, displayName: name });
      const result = await response.json().catch(() => ({}));
      if (response.status >= 500) reportConnectionIssue(source); else reportConnectionHealthy(source);
      if (!response.ok) { setError(result.error ?? "We could not save your seat."); return; }
      setJoined(true);
    } catch {
      reportConnectionIssue(source);
      setError("We couldn’t reach the tasting. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitResponse(completed = false, patch: Partial<Draft> = {}) {
    if (!state?.currentItem) return false;
    setBusy(true); setError("");
    const source = guestConnectionSource(preview.id, "response");
    try {
      await queuePersonalNotes(state.currentItem.id, draftRef.current.personalNotes);
      const latestDraft = draftRef.current;
      const payload = { ...latestDraft, ...patch, flightItemId: state.currentItem.id, completed: completed || latestDraft.completed };
      const response = await fetch(`/api/events/${preview.id}/response`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (response.status >= 500) reportConnectionIssue(source); else reportConnectionHealthy(source);
      if (!response.ok) { setError(result.error ?? "We could not save that just now."); return false; }
      if (draftRef.current.personalNotes === payload.personalNotes) {
        lastSavedNotesRef.current.set(state.currentItem.id, payload.personalNotes);
        const queued = latestQueuedNotesRef.current.get(state.currentItem.id);
        if (queued?.personalNotes === payload.personalNotes) latestQueuedNotesRef.current.delete(state.currentItem.id);
        if (activeFlightIdRef.current === state.currentItem.id) setNotesSyncStatus("saved");
      }
      setDraft(d => ({ ...d, ...patch, completed: completed || d.completed }));
      if (soundRef.current) playInterfaceSound("confirm");
      return true;
    } catch {
      reportConnectionIssue(source);
      setError("We couldn’t reach the tasting. Your notes remain on this device—try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function answerTrivia(index: number) {
    if (triviaChoice !== null || !state?.trivia || !state.currentItem || !state.trivia.deadlineAt || !state.trivia.deadlineToken) return;
    const pending:PendingTriviaAnswer={eventId:preview.id,participantId:state.participant.id,flightItemId:state.trivia.flightItemId,questionId:state.trivia.id,selectedIndex:index,deadlineAt:state.trivia.deadlineAt,deadlineToken:state.trivia.deadlineToken,answeredAt:new Date(correctedNow(Date.now(),clockOffsetRef.current)).toISOString(),idempotencyKey:crypto.randomUUID()};
    savePendingTrivia(pending);
    setTriviaChoice(index);
    const delivered=await pendingDeliveryRef.current(pending);
    if (delivered&&soundRef.current) playInterfaceSound("confirm");
  }

  async function sendStageSignal(signal: "ready" | "pouring" | "decanted") {
    if (!state) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/events/${preview.id}/stage-signal`, {
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({ signal })
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok){setError(result.error??"That stage update could not be shared.");return}
      setState(current=>current?{...current,stageSignal:signal}:current);
      if(soundRef.current)playInterfaceFeedback("selection");
    }catch{setError("That stage update is saved in your cup, but could not reach the host.")}
    finally{setBusy(false)}
  }

  async function saveBrewNote(brewId:string,note:string){
    try{
      const response=await fetch(`/api/events/${preview.id}/brew-note`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({brewId,note})});
      if(!response.ok)return false;
      setState(current=>current?.brew?.id===brewId?{...current,brewNote:note}:current);
      return true;
    }catch{return false}
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

  useEffect(() => {
    if (!state) return;
    const nextStage = resolveConductorStage(state.event);
    const previousStage = lastConductorStageRef.current;
    lastConductorStageRef.current = nextStage;
    if (previousStage && previousStage !== nextStage && soundRef.current) {
      playInterfaceFeedback(nextStage === "reveal" ? "confirm" : "selection");
    }
  }, [state]);

  useEffect(()=>{
    const next=state?.groupReveal?.state??null;
    const previous=lastGroupRevealStateRef.current;
    lastGroupRevealStateRef.current=next;
    if(previous&&next&&previous!==next&&soundRef.current)playInterfaceFeedback(next==="fingerprint"?"confirm":"selection");
  },[state?.groupReveal?.state]);

  const breakoutSessionId=state?.breakout?.session.id;
  useEffect(()=>{
    if(!breakoutSessionId)return;
    const tick=()=>setBreakoutNow(correctedNow(Date.now(),clockOffsetRef.current));
    const first=window.setTimeout(tick,0);
    const interval=window.setInterval(tick,250);
    return()=>{window.clearTimeout(first);window.clearInterval(interval)};
  },[breakoutSessionId]);

  useEffect(()=>{
    const breakout=state?.breakout;
    if(!breakout||returnedBreakoutRef.current===breakout.session.id||["returned","stayed_main","failed"].includes(breakout.memberStatus))return;
    const due=breakout.session.status==="returning"||(breakoutNow>0&&breakoutNow>=new Date(breakout.session.ends_at).getTime());
    if(!due)return;
    returnedBreakoutRef.current=breakout.session.id;
    void postBreakoutAction(preview.id,{action:"return"}).then(()=>{
      setState(current=>current?.breakout?.session.id===breakout.session.id?{...current,breakout:{...current.breakout,memberStatus:"returned"}}:current);
      void refresh();
    }).catch(()=>{returnedBreakoutRef.current=null});
  },[breakoutNow,preview.id,refresh,state?.breakout]);

  async function breakoutAction(action:{action:"signal";signal:BreakoutSignal}|{action:"stay_main"}|{action:"return"}|{action:"snapshot";snapshot:string}){
    if(!state?.breakout)return false;
    setBusy(true);setError("");
    try{
      await postBreakoutAction(preview.id,action);
      setState(current=>{
        if(!current?.breakout)return current;
        if(action.action==="signal")return{...current,breakout:{...current.breakout,signal:action.signal}};
        if(action.action==="snapshot")return{...current,breakout:{...current.breakout,room:{...current.breakout.room,snapshot:action.snapshot||null}}};
        return{...current,breakout:{...current.breakout,memberStatus:action.action==="stay_main"?"stayed_main":"returned"}};
      });
      return true;
    }catch(actionError){setError(actionError instanceof Error?actionError.message:"That tasting-table update could not be shared.");return false}
    finally{setBusy(false)}
  }

  async function discoveryAction(action:DiscoveryAction){
    setBusy(true);setError("");
    try{
      await postDiscoveryAction(preview.id,action);
      await refresh();
      return true;
    }catch(actionError){setError(actionError instanceof Error?actionError.message:"That table-card update could not be shared.");return false}
    finally{setBusy(false)}
  }

  if (!joined) return <Registration preview={preview} account={account} name={name} setName={setName} error={error} busy={busy} join={join} />;
  const conductorStage=state?resolveConductorStage(state.event):"arrival";
  const conductorDefinition=getConductorStage(conductorStage);
  const phaseAnnouncement = soundChosen && state ? getGuestPhaseAnnouncement({
    phase: state.event.phase,
    teaTitle: state.currentItem?.reveal_title ?? null,
    position: state.currentPosition,
    flightCount: state.flightCount,
    betweenTeas: state.betweenTeas,
    triviaClosed: Boolean(state.trivia?.closed),
    participantRemoved: state.participant.status === "removed"
  }) : "";
  const breakoutMediaRoomId=state?.breakout&&state.breakout.session.status==="active"&&breakoutNow>=new Date(state.breakout.session.starts_at).getTime()&&breakoutNow<new Date(state.breakout.session.ends_at).getTime()&&!['returned','failed','stayed_main'].includes(state.breakout.memberStatus)?state.breakout.room.id:null;
  const cheersActive=Boolean(state?.cheers);
  const videoRoom = soundChosen && state && state.event.location_mode === "remote" && (!['recap','ended'].includes(state.event.phase)||cheersActive) && state.event.status !== "completed"
    ? <AgoraVideoRoom eventId={state.event.id} displayName={state.participant.displayName} emphasis={conductorDefinition.video} breakoutRoomId={breakoutMediaRoomId} roomLabel={state.breakout?`Tasting Table ${state.breakout.room.room_number}`:undefined} />
    : null;
  const communicationLayer = soundChosen && state && (!['recap','ended'].includes(state.event.phase)||cheersActive) && state.event.status !== "completed" && state.participant.status !== "removed"
    ? <LiveCommunication eventId={state.event.id} presentation="guest" currentTeaId={state.event.current_flight_item_id} participantCount={state.breakout?.members.length??presenceCount} emphasis={cheersActive?"quiet":conductorDefinition.communication} breakoutRoomId={breakoutMediaRoomId} />
    : null;
  const cheersLayer=soundChosen&&state?.cheers?<VirtualTeaCheers key={state.cheers.id} eventId={state.event.id} initialSnapshot={state.cheers} clockOffsetMs={clockOffsetMs} feedbackEnabled={sound}/>:null;
  const rewardsLayer=soundChosen&&state?<LiveGoldLeaves eventId={state.event.id} stage={conductorStage} cheersActive={cheersActive} feedbackEnabled={sound}/>:null;
  const identityLayer=soundChosen&&state?<LiveIdentityReveal eventId={state.event.id} active={state.event.status==="completed"||state.event.phase==="ended"} stage={conductorStage} cheersActive={cheersActive}/>:null;
  const peopleFirst=liveAttentionOrder(conductorStage)==="people-first";
  const supportingLayers=<>{communicationLayer}{cheersLayer}{rewardsLayer}{identityLayer}</>;
  const withPhaseAnnouncement = (content: React.ReactNode) => <><GuestPhaseAnnouncer message={phaseAnnouncement} />{peopleFirst&&videoRoom}{content}{!peopleFirst&&videoRoom}{supportingLayers}</>;
  if (!soundChosen) return withPhaseAnnouncement(<SoundEntry onChoose={chooseSound} />);
  if (!state) return withPhaseAnnouncement(<LoadingRoom />);
  if (state.participant.status === "removed") return withPhaseAnnouncement(<Terminal title="You’ve been removed from this tasting." copy="Your notes remain yours and are still available in your recap." />);

  const phase = state.event.phase;
  const frameProps = {
    state,
    draft,
    setDraft,
    sound,
    toggleSound,
    notesSyncStatus,
    transitionNotice: pendingState ? `${getConductorStage(resolveConductorStage(pendingState.event)).label} is ready — tap to view` : null,
    onShowTransition: showPendingTransition,
    onNotesActiveChange: (active: boolean) => { notesProtectedRef.current = active; },
    onNotesBlur: () => { if (state.currentItem) void queuePersonalNotes(state.currentItem.id, draftRef.current.personalNotes); }
  };
  const stageHeader = <ConductorStageHeader stage={conductorStage} sequenceNumber={state.event.conductor_sequence_version} />;
  const discoveryLayer=conductorStage!=="reveal"&&state.discoveryBoard&&state.discoveryBoard.session.status!=="active"?<><GuestPresenterCue board={state.discoveryBoard} busy={busy} onAction={discoveryAction}/><GuestDiscoveryBoard board={state.discoveryBoard} teaName={state.currentItem?.tea?.name??state.currentItem?.reveal_title??"Current tea"}/></>:null;
  const breakoutMemberActive=Boolean(state.breakout&&!['returned','failed','stayed_main'].includes(state.breakout.memberStatus));
  const ownDiscoveryCard=state.discoveryBoard?.cards.find(card=>card.id===state.discoveryBoard?.ownCardId)??null;
  const promptLayer=state.currentItem?<ConversationPromptCard eventId={state.event.id} active={!breakoutMemberActive||Boolean(breakoutMediaRoomId)} canPromoteCuriosity={Boolean(breakoutMediaRoomId&&ownDiscoveryCard&&!ownDiscoveryCard.lockedAt)} onAskHost={breakoutMediaRoomId?async()=>{await breakoutAction({action:"signal",signal:"help"})}:undefined} onCuriositySaved={async()=>{await refresh()}}/>:null;
  const mapLayer=state.currentItem&&!breakoutMemberActive&&["aroma","first_sip","explore","discuss","reveal","debrief"].includes(conductorStage)?<LivingMapExperience eventId={state.event.id} stage={conductorStage}/>:null;
  const framed = (content: React.ReactNode) => withPhaseAnnouncement(<GuestFrame {...frameProps}>{stageHeader}{mapLayer}{discoveryLayer}{promptLayer}{content}</GuestFrame>);
  if (phase === "lobby") return withPhaseAnnouncement(<WaitingRoom state={state} count={presenceCount} />);
  if (phase === "trivia" && state.currentItem && state.trivia) return withPhaseAnnouncement(<GuestFrame {...frameProps}><Trivia trivia={state.trivia} choice={triviaChoice} answer={answerTrivia} error={error} saved={draft.saved} toggleSaved={async () => { const next = !draft.saved; if (await submitResponse(false, { saved: next })) setDraft(d => ({ ...d, saved: next })); }} /></GuestFrame>);
  if (["recap","ended"].includes(phase) || state.event.status === "completed") return withPhaseAnnouncement(<GuestRecap state={state} />);
  if (!state.currentItem) return withPhaseAnnouncement(<LoadingRoom />);
  if(state.breakout&&!['returned','failed','stayed_main'].includes(state.breakout.memberStatus))return framed(<BreakoutRoomStage key={state.breakout.session.id} breakout={state.breakout} discoveryBoard={state.discoveryBoard} tea={state.currentItem} now={breakoutNow} busy={busy} error={error} onAction={breakoutAction} onDiscoveryAction={discoveryAction}/>);
  if (conductorStage === "prepare") return framed(<PrepareStage state={state} busy={busy} error={error} onReady={() => void sendStageSignal("ready")} />);
  if (conductorStage === "brew") return framed(<BrewStage state={state} clockOffsetMs={clockOffsetMs} feedbackEnabled={sound} busy={busy} error={error} onSignal={signal => void sendStageSignal(signal)} onSaveNote={saveBrewNote} />);
  if (conductorStage === "aroma") return framed(<AromaStage item={state.currentItem} draft={draft} setDraft={setDraft} busy={busy} error={error} onSave={() => void submitResponse(false)} />);
  if (conductorStage === "first_sip") return framed(<FirstSipStage draft={draft} setDraft={setDraft} busy={busy} onSave={() => void submitResponse(false)} />);
  if (conductorStage === "explore") return framed(<ExploreStage draft={draft} setDraft={setDraft} busy={busy} error={error} onSave={() => void submitResponse(false)} />);
  if (conductorStage === "discuss") return framed(<DiscussStage draft={draft} />);
  if (conductorStage === "reveal") return framed(<ScheduledReveal state={state} draft={draft} setDraft={setDraft} busy={busy} error={error} onSave={() => void submitResponse(false)} clockOffsetMs={clockOffsetMs} roundTripMs={roundTripMs} />);
  if (conductorStage === "debrief") return framed(<DebriefStage draft={draft} setDraft={setDraft} />);
  if (conductorStage === "close_tea") return framed(draft.completed || step === 5
    ? <TeaComplete item={state.currentItem} stampReleased={Boolean(state.responses.find(response => response.event_flight_item_id === state.currentItem?.id)?.stamp_released_at)} saved={draft.saved} onToggle={async () => { const next = !draft.saved; if (await submitResponse(false, { saved: next })) setDraft(d => ({ ...d, saved: next })); }} />
    : <CloseTeaStage draft={draft} setDraft={setDraft} busy={busy} error={error} submit={async () => { if (await submitResponse(true)) setStep(5); }} />);
  if (conductorStage === "transition" || state.betweenTeas) return framed(<TransitionStage state={state} />);
  return withPhaseAnnouncement(<LoadingRoom />);
}

function persistGuestJoin(payload: GuestJoinPayload) {
  return fetch("/api/events/join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function postBreakoutAction(eventId:string,action:Record<string,unknown>){
  const response=await fetch(`/api/events/${eventId}/breakouts`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(action)});
  const result=await response.json().catch(()=>({})) as {error?:string};
  if(!response.ok)throw new Error(result.error??"That tasting-table action could not be completed.");
  return result;
}

async function postDiscoveryAction(eventId:string,action:DiscoveryAction){
  const response=await fetch(`/api/events/${eventId}/discovery-cards`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(action)});
  const result=await response.json().catch(()=>({})) as {error?:string};
  if(!response.ok)throw new Error(result.error??"That table-card action could not be completed.");
  return result;
}

function Registration({ preview, account, name, setName, error, busy, join }: { preview: EventPreview; account: SignedInAccount; name: string; setName: (x:string)=>void; error:string; busy:boolean; join:(e:React.FormEvent)=>void }) {
  return <main className="guest-shell" id="main-content"><div className="guest-pane enter"><Brand href="https://vintagefork.ca/" /><div style={{ textAlign: "center", margin: "1.5rem 0" }}><p className="eyebrow">{preview.title}</p><h1 className="page-title">What should we call you tonight?</h1><p className="page-lede">You are signed in{account.email ? ` as ${account.email}` : ""}. This tasting and every completed card will be saved to your Tea Cellar.</p></div><GuestError message={error} /><form onSubmit={join} className="stack"><div className="field"><label htmlFor="guest-name">Display name</label><input className="input" id="guest-name" autoComplete="name" maxLength={40} required value={name} onChange={e => setName(e.target.value)} /><span className="help">You can use your first name or a nickname during the tasting.</span></div><div className="guest-actions"><button className="btn btn-primary btn-attention" disabled={busy}>{busy ? "Saving your seat…" : "Join This Tasting"}</button></div></form></div></main>;
}
function SoundEntry({ onChoose }: { onChoose:(x:boolean)=>void }) { return <main className="guest-shell" id="main-content"><div className="guest-pane" style={{ justifyContent: "center", textAlign: "center" }}><Brand /><h1 className="page-title">A little feedback?</h1><p className="page-lede">Soft button sounds and gentle taps on supported phones, designed to stay behind the tasting and its live conversation.</p><div className="guest-actions"><button className="btn btn-primary btn-attention" onClick={() => onChoose(true)}>Yes, keep it subtle</button><button className="btn btn-secondary" onClick={() => onChoose(false)}>No, keep it quiet</button></div></div></main>; }
function LoadingRoom() { return <main className="guest-shell"><div className="guest-pane" style={{ justifyContent: "center", textAlign: "center" }}><Brand /><div className="skeleton" style={{ height: 4, marginTop: 30 }} /><p>Getting the room…</p></div></main>; }
function WaitingRoom({ state, count }: { state: StatePayload; count: number }) { return <main className="guest-shell"><div className="guest-pane" style={{ textAlign: "center" }}><Brand /><ConductorStageHeader stage="arrival" sequenceNumber={state.event.conductor_sequence_version} /><h1 className="page-title">You’re in. Your host will open the room shortly.</h1><p className="page-lede">{Math.max(0,count-1)} other{count===2?" is":"s are"} here.</p><section className="card" style={{ marginTop: 20 }}><h2>{state.event.title}</h2><p>{new Date(state.event.starts_at).toLocaleString("en-CA", { dateStyle: "full", timeStyle: "short" })}</p>{state.event.location_mode === "remote" && <div className="notice"><strong>Video and tasting tools now share this screen.</strong><br />Use “Join with camera &amp; mic” when you are ready.{state.event.video_call_url && <div style={{ marginTop: 12 }}><a className="btn btn-secondary" href={state.event.video_call_url} target="_blank" rel="noreferrer">Fallback video link ↗</a></div>}</div>}{state.event.location_mode === "in_person" && (state.event.venue_name || state.event.venue_address) && <div className="notice"><strong>{state.event.venue_name}</strong><br />{state.event.venue_address}</div>}</section><div className="guest-actions"><p className="muted">Waiting for your host…</p></div></div></main>; }
function ScheduledReveal({ state, draft, setDraft, busy, error, onSave, clockOffsetMs, roundTripMs }: { state: StatePayload; draft:Draft; setDraft:(update:DraftUpdate)=>void; busy:boolean; error:string; onSave:()=>void; clockOffsetMs:number; roundTripMs:number }) {
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
  if (!revealed) return <section className="conductor-guest-stage reveal-waiting"><p className="eyebrow">Shared reveal</p><h1 className="page-title">Ready at the table.</h1><p className="page-lede">The room will reveal together in a moment.</p></section>;
  return <section className="conductor-guest-stage reveal-stage"><p className="eyebrow">Tea {state.currentPosition} of {state.flightCount}</p><h1 className="page-title">{state.currentItem?.reveal_title}</h1><p className="page-lede">{state.currentItem?.tea?.origin??"A shared tasting portrait"}</p><div className="ceremony-rule" />{state.groupReveal?<GroupDiscoveryReveal snapshot={state.groupReveal} teaName={state.currentItem?.tea?.name??state.currentItem?.reveal_title??"Current tea"} producerNote={[state.currentItem?.tea?.producer?`Producer: ${state.currentItem.tea.producer}`:null,state.currentItem?.reveal_description].filter(Boolean).join(" · ")}/>:<div className="notice"><strong>The group portrait is reconnecting.</strong> Your personal observations remain saved.</div>}<details className="group-reveal-own-notes"><summary>Update my private tasting</summary><p className="help">Changes saved now are timestamped as post-reveal. They never overwrite the earlier group moment.</p><GuestError message={error}/><h3>Aroma</h3><FlavorDescriptorPicker options={LIVE_DESCRIPTOR_OPTIONS} selectedIds={draft.aromaDescriptors} onToggle={label=>setDraft(current=>({...current,aromaDescriptors:current.aromaDescriptors.includes(label)?current.aromaDescriptors.filter(candidate=>candidate!==label):current.aromaDescriptors.length<5?[...current.aromaDescriptors,label]:current.aromaDescriptors}))}/><h3>Taste</h3><FlavorDescriptorPicker options={LIVE_DESCRIPTOR_OPTIONS} selectedIds={draft.descriptors} onToggle={label=>setDraft(current=>({...current,descriptors:current.descriptors.includes(label)?current.descriptors.filter(candidate=>candidate!==label):current.descriptors.length<5?[...current.descriptors,label]:current.descriptors}))}/><div className="guest-actions"><button className="btn btn-secondary" disabled={busy} onClick={onSave}>{busy?"Adding later observation…":"Add later observation"}</button></div></details></section>;
}
function GuestFrame({ state, draft, setDraft, sound, toggleSound, notesSyncStatus, transitionNotice, onShowTransition, onNotesActiveChange, onNotesBlur, children }: { state: StatePayload; draft: Draft; setDraft:(update:DraftUpdate)=>void; sound:boolean; toggleSound:()=>void; notesSyncStatus:NotesSyncStatus; transitionNotice:string|null; onShowTransition:()=>void; onNotesActiveChange:(active:boolean)=>void; onNotesBlur:()=>void; children:React.ReactNode }) {
  const focused = useRef(false);
  const composing = useRef(false);
  const reportActivity = () => onNotesActiveChange(focused.current || composing.current);
  const syncCopy = notesSyncStatus === "saved" ? "Saved." : notesSyncStatus === "saving" ? "Saving…" : "Saved on this device. We’ll sync when you’re connected.";
  const stageLabel=getConductorStage(resolveConductorStage(state.event)).label;
  return <main className={`guest-shell conductor-participant-stage conductor-stage-${resolveConductorStage(state.event)}`} id="main-content"><header className="guest-header"><Brand compact /><strong>{state.currentItem?.reveal_title}</strong><span className="spacer" /><span className="chip chip-live">{stageLabel}</span><span className="chip">Tea {state.currentPosition} of {state.flightCount}</span><button className="btn btn-quiet" aria-pressed={sound} aria-label={`Button sound and haptic feedback ${sound ? "on" : "off"}`} onClick={toggleSound}>{sound ? "Feedback on" : "Feedback off"}</button></header><div className="guest-pane"><details className="card guest-notes" style={{ marginBottom: 16 }}><summary>Your notes</summary><textarea className="textarea" aria-label="Personal notes" maxLength={3000} value={draft.personalNotes} onFocus={() => { focused.current = true; reportActivity(); }} onBlur={() => { focused.current = false; reportActivity(); onNotesBlur(); }} onCompositionStart={() => { composing.current = true; reportActivity(); }} onCompositionEnd={() => { composing.current = false; reportActivity(); }} onChange={e => setDraft(d => ({ ...d, personalNotes: e.target.value }))} placeholder="Anything you want to remember…" /><p className="help" role="status" aria-live="polite">{syncCopy}</p></details>{transitionNotice && <div className="notice guest-transition-notice" role="status" aria-live="polite"><strong>{transitionNotice}</strong><button className="btn btn-secondary" onClick={onShowTransition}>View now</button></div>}{children}</div></main>;
}
function PrepareStage({ state, busy, error, onReady }: { state:StatePayload; busy:boolean; error:string; onReady:()=>void }) { const item=state.currentItem; return <section className="conductor-guest-stage prepare-stage"><p className="eyebrow">Tea {state.currentPosition} of {state.flightCount}</p><h1 className="page-title">Set the table for {item?.reveal_title}.</h1><p className="page-lede">{item?.reveal_description}</p><GuestError message={error} /><div className="grid grid-3 preparation-measures"><div className="card"><strong>{item?.temperature_c??"—"}°C</strong><span>water</span></div><div className="card"><strong>{item?.leaf_grams??"—"}g</strong><span>leaf</span></div><div className="card"><strong>{item?.water_ml??"—"}ml</strong><span>volume</span></div></div><div className="guest-actions"><button className={`btn ${state.stageSignal==="ready"?"btn-secondary":"btn-primary btn-attention"}`} aria-pressed={state.stageSignal==="ready"} disabled={busy||state.stageSignal==="ready"} onClick={onReady}>{state.stageSignal==="ready"?"Ready shared with host":"I’m ready"}</button></div></section>; }
function BrewStage({ state, clockOffsetMs, feedbackEnabled, busy, error, onSignal, onSaveNote }: { state:StatePayload; clockOffsetMs:number; feedbackEnabled:boolean; busy:boolean; error:string; onSignal:(signal:"ready"|"pouring"|"decanted")=>void; onSaveNote:(brewId:string,note:string)=>Promise<boolean> }) {
  const item=state.currentItem;
  if(!item)return null;
  return <section className="conductor-guest-stage brew-stage shared-brew-stage">
    <div className="shared-brew-heading"><div><p className="eyebrow">Tea {state.currentPosition} of {state.flightCount} · Shared brew</p><h1 className="page-title">{item.tea?.name??item.reveal_title}</h1></div><span className="chip">Infusion {state.brew?.infusion_number??1}</span></div>
    <div className="shared-brew-guidance" aria-label="Brewing guidance"><span><strong>{item.temperature_c??"—"}°C</strong> water</span><span><strong>{item.leaf_grams??"—"}g</strong> leaf</span><span><strong>{item.water_ml??"—"}ml</strong> vessel</span></div>
    {state.brew
      ? <SharedBrewingTimer brew={state.brew} clockOffsetMs={clockOffsetMs} feedbackEnabled={feedbackEnabled} />
      : <div className="notice" role="status">The shared clock is connecting. Keep the host in view.</div>}
    <section className="card shared-brew-instructions"><strong>For this infusion</strong><p>{item.brewing_instructions}</p></section>
    {state.brew&&<InfusionNote key={state.brew.id} brewId={state.brew.id} infusionNumber={state.brew.infusion_number} initialValue={state.brewNote} onSave={onSaveNote} />}
    {state.event.conductor_paused_at&&<div className="notice"><strong>The host paused this infusion.</strong> Video, chat, reactions, and your notes remain available.</div>}
    <GuestError message={error} />
    <div className="guest-actions stage-signal-actions" aria-label="Optional brew status">
      <button className="btn btn-secondary" aria-pressed={state.stageSignal==="ready"} disabled={busy} onClick={()=>onSignal("ready")}>{state.stageSignal==="ready"?"Ready shared":"Ready"}</button>
      <button className={`btn ${state.stageSignal==="pouring"?"btn-secondary":"btn-primary"}`} aria-pressed={state.stageSignal==="pouring"} disabled={busy} onClick={()=>onSignal("pouring")}>{state.stageSignal==="pouring"?"Pouring shared":"I’m pouring"}</button>
      <button className={`btn ${state.stageSignal==="decanted"?"btn-secondary":"btn-primary btn-attention"}`} aria-pressed={state.stageSignal==="decanted"} disabled={busy} onClick={()=>onSignal("decanted")}>{state.stageSignal==="decanted"?"Decanted · ready":"Decanted / ready"}</button>
    </div>
    <p className="help shared-brew-signal-help">These signals help the host feel the room. They never hold up the tasting.</p>
  </section>;
}
function InfusionNote({brewId,infusionNumber,initialValue,onSave}:{brewId:string;infusionNumber:number;initialValue:string;onSave:(brewId:string,note:string)=>Promise<boolean>}){
  const [value,setValue]=useState(initialValue);
  const [status,setStatus]=useState<"saved"|"saving"|"device">(initialValue?"saved":"device");
  const saved=useRef(initialValue);
  const persist=useCallback(async()=>{
    if(value===saved.current)return;
    setStatus("saving");
    if(await onSave(brewId,value)){saved.current=value;setStatus("saved")}else setStatus("device");
  },[brewId,onSave,value]);
  useEffect(()=>{if(value===saved.current)return;const timer=window.setTimeout(()=>{void persist()},650);return()=>window.clearTimeout(timer)},[persist,value]);
  return <section className="card shared-brew-note"><label htmlFor={`brew-note-${brewId}`}><strong>Infusion {infusionNumber} note</strong><span className="help">Private to you · {status==="saving"?"saving…":status==="saved"?"saved":"on this device"}</span></label><textarea id={`brew-note-${brewId}`} className="textarea" maxLength={1000} rows={2} value={value} onChange={event=>setValue(event.target.value)} onBlur={()=>void persist()} placeholder="What changed in this infusion?" /></section>;
}
function AromaStage({ item,draft,setDraft,busy,error,onSave }: { item:CurrentItem;draft:Draft;setDraft:(update:DraftUpdate)=>void;busy:boolean;error:string;onSave:()=>void }) { return <details className="card conductor-guest-stage aroma-stage legacy-tasting-card"><summary>Add to my private tasting card</summary><p className="help">The Living Map above is the shared experience. This optional card stays with your personal recap.</p><GuestError message={error}/><FlavorDescriptorPicker options={LIVE_DESCRIPTOR_OPTIONS} selectedIds={draft.aromaDescriptors} onToggle={label=>setDraft(current=>({...current,aromaDescriptors:current.aromaDescriptors.includes(label)?current.aromaDescriptors.filter(candidate=>candidate!==label):current.aromaDescriptors.length<5?[...current.aromaDescriptors,label]:current.aromaDescriptors}))}/><h2>How strongly?</h2><div className="grid grid-3">{(["subtle","clear","dominant"] as const).map(value=><button className={`btn ${draft.aromaIntensity===value?"btn-gold":"btn-secondary"}`} aria-pressed={draft.aromaIntensity===value} key={value} onClick={()=>setDraft(current=>({...current,aromaIntensity:value}))}>{value}</button>)}</div><div className="guest-actions"><button className="btn btn-secondary" disabled={busy} onClick={onSave}>{busy?"Adding…":"Add to private card"}</button></div><p className="help">Stay with {item.reveal_title}; the first sip comes next.</p></details>; }
function FirstSipStage({ draft, setDraft, busy, onSave }: { draft:Draft; setDraft:(update:DraftUpdate)=>void; busy:boolean; onSave:()=>void }) { return <section className="conductor-guest-stage first-sip-stage"><p className="eyebrow">Independent reflection · private</p><h1 className="page-title">{DISCOVERY_FIRST_COPY.firstSip}</h1><p className="page-lede">{DISCOVERY_FIRST_COPY.noticeWhenReady} {DISCOVERY_FIRST_COPY.noExpectedFlavor}</p><textarea className="textarea first-impression" aria-label="First observation" maxLength={500} value={draft.firstImpression} onChange={event=>setDraft(current=>({...current,firstImpression:event.target.value}))} onBlur={onSave} placeholder="What I noticed…" /><div className="guest-actions"><button className="btn btn-secondary" disabled={busy} onClick={onSave}>{busy?"Adding…":"Add observation"}</button></div></section>; }
function ExploreStage({ draft, setDraft, busy, error, onSave }: { draft:Draft; setDraft:(update:DraftUpdate)=>void; busy:boolean; error:string; onSave:()=>void }) { return <details className="card conductor-guest-stage explore-stage legacy-tasting-card"><summary>Update my private tasting card</summary><p className="help">“I can’t name it yet” is also a complete observation. This optional card stays private.</p><GuestError message={error} /><FlavorDescriptorPicker options={LIVE_DESCRIPTOR_OPTIONS} selectedIds={draft.descriptors} onToggle={label=>setDraft(current=>({ ...current, descriptors:current.descriptors.includes(label)?current.descriptors.filter(candidate=>candidate!==label):current.descriptors.length<5?[...current.descriptors,label]:current.descriptors }))}/><h2>How strongly?</h2><div className="grid grid-3">{(["subtle","clear","dominant"] as const).map(value=><button className={`btn ${draft.intensity===value?"btn-gold":"btn-secondary"}`} aria-pressed={draft.intensity===value} key={value} onClick={()=>setDraft(current=>({...current,intensity:value}))}>{value}</button>)}</div><div className="guest-actions"><button className="btn btn-secondary" disabled={busy} onClick={onSave}>{busy?"Adding…":"Add to private card"}</button></div></details>; }
function DiscussStage({ draft }: { draft:Draft }) { return <section className="conductor-guest-stage discuss-stage"><p className="eyebrow">Conversation</p><h1 className="page-title">Bring your cup into the room.</h1><p className="page-lede">Share what you noticed, then listen for differences without needing agreement.</p><div className="discussion-cues"><article className="card"><strong>Your first impression</strong><p>{draft.firstImpression||"Still taking shape."}</p></article><article className="card"><strong>Your descriptors</strong><p>{draft.descriptors.join(" · ")||"You can keep exploring while others speak."}</p></article><article className="card"><strong>A question to offer</strong><p>What changed most from aroma to finish?</p></article></div></section>; }
function DebriefStage({ draft, setDraft }: { draft:Draft; setDraft:(update:DraftUpdate)=>void }) { return <section className="conductor-guest-stage debrief-stage"><p className="eyebrow">Return to the cup</p><h1 className="page-title">What changed?</h1><p className="page-lede">Notice the tea again after hearing the room. Add anything you want to remember.</p><textarea className="textarea" aria-label="Debrief reflection" maxLength={3000} value={draft.personalNotes} onChange={event=>setDraft(current=>({...current,personalNotes:event.target.value}))} placeholder="After the discussion, I noticed…" /></section>; }
function CloseTeaStage({ draft, setDraft, busy, error, submit }: { draft:Draft; setDraft:(update:DraftUpdate)=>void; busy:boolean; error:string; submit:()=>void }) { return <section className="conductor-guest-stage close-tea-stage"><p className="eyebrow">Complete your tasting card</p><h1 className="page-title">How did this tea land overall?</h1><GuestError message={error} /><div className="rating" role="radiogroup">{[1,2,3,4,5].map(value=><button className={draft.rating>=value?"active":""} role="radio" aria-checked={draft.rating===value} aria-label={`${value} stars`} key={value} onClick={()=>setDraft(current=>({...current,rating:value}))}>★</button>)}</div><p className="help">Your first impression, descriptors, intensity, rating, and personal notes will stay together.</p><div className="guest-actions"><button className="btn btn-primary btn-attention" disabled={busy||draft.rating<1} onClick={submit}>{busy?"Saving…":"Complete this tea"}</button></div></section>; }
function TransitionStage({ state }: { state:StatePayload }) { const remaining=Math.max(0,state.flightCount-state.currentPosition); return <section className="conductor-guest-stage transition-stage"><p className="eyebrow">{remaining?`${remaining} tea${remaining===1?"":"s"} still to explore`:"Flight complete"}</p><h1 className="page-title">Rinse your cup and settle in.</h1><p className="page-lede">Your notes are safe. The host will prepare the next shared moment.</p></section>; }

function BreakoutRoomStage({breakout,discoveryBoard,tea,now,busy,error,onAction,onDiscoveryAction}:{breakout:BreakoutState;discoveryBoard:DiscoveryBoardState|null;tea:CurrentItem;now:number;busy:boolean;error:string;onAction:(action:{action:"signal";signal:BreakoutSignal}|{action:"stay_main"}|{action:"return"})=>Promise<boolean>;onDiscoveryAction:(action:DiscoveryAction)=>Promise<boolean>}){
  const [announcement,setAnnouncement]=useState("");
  const previousSeconds=useRef<number|null>(null);
  const currentNow=now;
  const startsAt=new Date(breakout.session.starts_at).getTime();
  const durationSeconds=Math.round((new Date(breakout.session.ends_at).getTime()-startsAt)/1000);
  const transitionSeconds=Math.max(0,Math.ceil((startsAt-currentNow)/1000));
  const remainingMs=breakoutRemainingMs(breakout.session,currentNow);
  const remainingSeconds=Math.ceil(remainingMs/1000);
  const transitioning=currentNow<startsAt&&breakout.session.status==="active";
  useEffect(()=>{
    const milestone=breakoutMilestone(previousSeconds.current,remainingSeconds);
    previousSeconds.current=remainingSeconds;
    if(milestone)setAnnouncement(milestone);
  },[remainingSeconds]);
  if(transitioning)return <section className="conductor-guest-stage breakout-transition" aria-labelledby="small-table-heading">
    <p className="eyebrow">A smaller table · {transitionSeconds}s</p>
    <h1 className="page-title" id="small-table-heading">You’re joining Tasting Table {breakout.room.room_number}.</h1>
    <p className="page-lede">A {formatClock(durationSeconds*1000)} conversation with {formatNames(breakout.members.map(member=>member.displayName))}. Your video will move automatically.</p>
    <div className="notice"><strong>Your private notes and tea tools stay here.</strong> The host can see connection health and table signals, never your table transcript.</div>
    <div className="guest-actions"><button className="btn btn-secondary" disabled={busy} onClick={()=>void onAction({action:"stay_main"})}>Stay in the main tasting</button></div>
  </section>;
  if(breakout.session.status==="returning"||remainingSeconds===0)return <section className="conductor-guest-stage breakout-returning"><p className="eyebrow">Tables returning</p><h1 className="page-title">Bringing everyone back together.</h1><p className="page-lede">Your personal notes and Our Table card are safe. Video is reconnecting to the main tasting now.</p></section>;
  const ownCard=discoveryBoard?.cards.find(card=>card.id===discoveryBoard.ownCardId)??null;
  const cardReady=remainingSeconds<=60;
  return <section className="conductor-guest-stage breakout-stage" aria-labelledby="small-table-heading">
    <div className="breakout-stage-heading"><div><p className="eyebrow">Tasting Table {breakout.room.room_number} · {formatNames(breakout.members.map(member=>member.displayName))}</p><h1 className="page-title" id="small-table-heading">Explore {tea.reveal_title} together.</h1></div><div className="breakout-clock" role="timer" aria-label={`${formatClock(remainingMs)} remaining`}><strong>{formatClock(remainingMs)}</strong><span>auto-return</span></div></div>
    <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
    {announcement&&<div className="notice" role="status">{announcement}</div>}
    <article className="card breakout-tea-card"><span className="eyebrow">Tea on the table</span><strong>{tea.tea?.name??tea.reveal_title}</strong><span>{tea.tea?.origin??tea.reveal_description}</span></article>
    <GuestError message={error}/>
    <div className="breakout-signal-row" aria-label="Table signals to host">{([['help','Ask host'],['more_time','More time'],['ready','Ready']] as const).map(([signal,label])=><button className={`btn ${breakout.signal===signal?"btn-gold":"btn-secondary"}`} aria-pressed={breakout.signal===signal} disabled={busy} key={signal} onClick={()=>void onAction({action:"signal",signal})}>{label}</button>)}</div>
    {ownCard?<section className={`our-table-unfold${cardReady?" ready":""}`} aria-labelledby={`our-table-title-${ownCard.id}`}><div className="card-header"><div><p className="eyebrow">Our Table · quietly assembled</p><h2 className="card-title" id={`our-table-title-${ownCard.id}`}>{cardReady?"Carry one table story back.":"Your card is taking shape."}</h2></div><span className="chip">{cardReady?"Final minute":"Auto-saving"}</span></div>{cardReady?<RoomDiscoveryEditor card={ownCard} teaName={tea.tea?.name??tea.reveal_title} busy={busy} isOwnSpokesperson={Boolean(discoveryBoard?.isOwnSpokesperson)} onAction={onDiscoveryAction}/>:<><RoomDiscoveryCard card={ownCard} teaName={tea.tea?.name??tea.reveal_title} compact/><p className="help">Shared, Unique, Changed, and Contrasting suggestions come only from structured tasting inputs. In the final minute, anyone here can keep, remove, or add short items.</p></>}</section>:<div className="notice"><strong>Our Table card is gathering.</strong> If suggestions are unavailable, the final minute will still offer a short manual card.</div>}
    <div className="breakout-privacy-note"><strong>Conversation stays at this table.</strong><span>Table chat is saved for participants here; no spoken transcript is created.</span></div>
    <div className="guest-actions"><button className="btn btn-quiet" disabled={busy} onClick={()=>{if(window.confirm("Return to the main tasting early? Your notes and current table card will remain saved."))void onAction({action:"return"})}}>Return to main tasting early</button></div>
  </section>;
}

function RoomDiscoveryEditor({card,teaName,busy,isOwnSpokesperson,onAction}:{card:DiscoveryCard;teaName:string;busy:boolean;isOwnSpokesperson:boolean;onAction:(action:DiscoveryAction)=>Promise<boolean>}){
  const [category,setCategory]=useState<DiscoveryCategory>("shared");
  const [text,setText]=useState("");
  const [curiosity,setCuriosity]=useState(card.curiosity??"");
  const [roomQuote,setRoomQuote]=useState(card.roomQuote??"");
  const [quoteAttributed,setQuoteAttributed]=useState(card.quoteAttributed);
  const [status,setStatus]=useState("Auto-saved suggestions");
  const actionRef=useRef(onAction);
  const savedDetailsRef=useRef(JSON.stringify({curiosity:card.curiosity??"",roomQuote:card.roomQuote??"",quoteAttributed:card.quoteAttributed}));
  const groups:Array<[DiscoveryCategory,string,DiscoveryCard["shared"]]>=[["shared","Shared",card.shared],["unique","Unique",card.unique],["changed","Changed",card.changed],["contrasting","Contrasting",card.contrasting]];
  useEffect(()=>{actionRef.current=onAction},[onAction]);
  useEffect(()=>{
    const next=JSON.stringify({curiosity,roomQuote,quoteAttributed});
    if(next===savedDetailsRef.current)return;
    setStatus("Saving…");
    const timer=window.setTimeout(()=>{void actionRef.current({action:"update_details",cardId:card.id,curiosity,roomQuote,quoteAttributed}).then(saved=>{if(saved){savedDetailsRef.current=next;setStatus("Card saved")}else setStatus("Not saved")})},450);
    return()=>window.clearTimeout(timer);
  },[card.id,curiosity,quoteAttributed,roomQuote]);
  async function add(){if(!text.trim())return;if(await onAction({action:"add_item",cardId:card.id,category,text:text.trim()})){setText("");setStatus("Item saved")}}
  async function saveDetails(){setStatus("Saving…");setStatus(await onAction({action:"update_details",cardId:card.id,curiosity,roomQuote,quoteAttributed})?"Card saved":"Not saved")}
  return <div className="room-discovery-editor"><div className="discovery-editor-anchor"><span className="eyebrow">Tea on this card</span><strong>{teaName}</strong><span>{card.participantCount} perspectives · no consensus required</span></div>
    <div className="discovery-edit-groups">{groups.map(([groupCategory,label,items])=><section key={groupCategory}><h3>{label}</h3>{items.length?<ul>{items.map(item=><li key={item.id}><span>{item.text}</span><button className="btn btn-quiet" type="button" disabled={busy} aria-label={`Remove ${item.text} from ${label}`} onClick={()=>void onAction({action:"remove_item",cardId:card.id,itemId:item.id})}>Remove</button></li>)}</ul>:<p className="help">Nothing in this group yet.</p>}</section>)}</div>
    <div className="discovery-add-item"><label>Short card item<select value={category} disabled={busy} onChange={event=>setCategory(event.target.value as DiscoveryCategory)}><option value="shared">Shared</option><option value="unique">Unique</option><option value="changed">Changed</option><option value="contrasting">Contrasting</option></select></label><input className="input" maxLength={120} value={text} onChange={event=>setText(event.target.value)} placeholder="Something this table noticed…"/><button className="btn btn-secondary" type="button" disabled={busy||!text.trim()} onClick={()=>void add()}>Add to card</button></div>
    <div className="discovery-open-fields"><label>Curious <span className="help">Optional open question</span><textarea className="textarea" rows={2} maxLength={240} value={curiosity} onChange={event=>setCuriosity(event.target.value)} placeholder="Something we still wonder…"/></label><label>Room quote <span className="help">Optional short phrase</span><textarea className="textarea" rows={2} maxLength={240} value={roomQuote} onChange={event=>setRoomQuote(event.target.value)} placeholder="A phrase worth carrying back…"/></label><label className="check-row"><input type="checkbox" checked={quoteAttributed} disabled={!roomQuote.trim()} onChange={event=>setQuoteAttributed(event.target.checked)}/><span>Attribute this quote to me in the main room</span></label><div className="row"><span className="help" role="status">{status}</span><span className="spacer"/><button className="btn btn-secondary" type="button" disabled={busy} onClick={()=>void saveDetails()}>Save card</button></div></div>
    <div className="discovery-volunteer"><div><strong>Share for our table</strong><p className="help">A social convenience, never a leader role. The card works without a speaker.</p></div>{isOwnSpokesperson?<button className="btn btn-quiet" type="button" disabled={busy} onClick={()=>void onAction({action:"withdraw",cardId:card.id})}>Withdraw</button>:card.hasSpokesperson?<span className="chip">Someone volunteered</span>:<button className="btn btn-primary" type="button" disabled={busy} onClick={()=>void onAction({action:"volunteer",cardId:card.id})}>I’ll share for us</button>}</div>
  </div>;
}

function GuestDiscoveryBoard({board,teaName}:{board:DiscoveryBoardState;teaName:string}){
  const openCards=board.openCardIds.map(id=>board.cards.find(card=>card.id===id)).filter((card):card is DiscoveryCard=>Boolean(card));
  return <section className="guest-discovery-board" aria-labelledby="guest-discovery-board-title"><div className="card-header"><div><p className="eyebrow">Tables returned</p><h2 className="card-title" id="guest-discovery-board-title">What the small tables found</h2></div><span className="chip">{board.cards.length} table{board.cards.length===1?"":"s"}</span></div><div className="discovery-table-strip" aria-label="Returned table cards">{board.cards.map(card=><div className={`discovery-table-tab${board.openCardIds.includes(card.id)?" active":""}`} key={card.id}><strong>Table {card.roomNumber}</strong><span>{card.shared.length} shared · {card.unique.length} unique</span></div>)}</div>{openCards.length?<div className={`guest-discovery-open${openCards.length>1?" compare":""}`} aria-live="polite">{openCards.map(card=><RoomDiscoveryCard card={card} teaName={teaName} highlightCuriosity={board.surfacedCuriosityCardId===card.id} key={card.id}/>)}</div>:<p className="help">Cards stay folded until your host opens a table story.</p>}</section>;
}

function GuestPresenterCue({board,busy,onAction}:{board:DiscoveryBoardState;busy:boolean;onAction:(action:DiscoveryAction)=>Promise<boolean>}){
  const cue=board.presenterCue;
  if(!cue)return null;
  if(cue.state==="invited")return <aside className="presenter-cue invited" aria-labelledby="presenter-cue-title"><p className="eyebrow">Private cue · Table {cue.roomNumber}</p><h2 id="presenter-cue-title">Your host invited you to share.</h2><p>Tell us what your table noticed—especially anything that surprised you. You don’t need to cover everything.</p><div className="row"><button className="btn btn-primary" type="button" disabled={busy} onClick={()=>void onAction({action:"accept_invite",cardId:cue.cardId})}>I’m ready</button><button className="btn btn-secondary" type="button" disabled={busy} onClick={()=>void onAction({action:"pass_invite",cardId:cue.cardId})}>Pass</button></div></aside>;
  return <aside className="presenter-cue accepted" aria-labelledby="presenter-cue-title"><p className="eyebrow">You’re sharing for Table {cue.roomNumber}</p><h2 id="presenter-cue-title">Your table is on screen.</h2><p>Use these as talking points, not a script:</p>{cue.talkingPoints.length?<ul>{cue.talkingPoints.map(point=><li key={point}>{point}</li>)}</ul>:<p className="help">Share whatever surprised your table.</p>}<button className="btn btn-quiet" type="button" disabled={busy} onClick={()=>void onAction({action:"pass_invite",cardId:cue.cardId})}>Pass / Cancel</button></aside>;
}

function formatNames(names:string[]){
  if(names.length<2)return names[0]??"your table";
  if(names.length===2)return`${names[0]} and ${names[1]}`;
  return`${names.slice(0,-1).join(", ")}, and ${names.at(-1)}`;
}
function formatClock(ms:number){const total=Math.max(0,Math.ceil(ms/1000));return`${Math.floor(total/60)}:${String(total%60).padStart(2,"0")}`}
function TeaComplete({ item, stampReleased, saved, onToggle }: { item:CurrentItem; stampReleased:boolean; saved:boolean; onToggle:()=>void }) { return <div style={{ textAlign:"center" }}><div style={{ width:168,height:168,border:"2px solid var(--vf-gold)",borderRadius:"50%",display:"grid",placeItems:"center",margin:"1rem auto" }}><div><strong>{item.reveal_title.toUpperCase()}</strong><br /><span style={{ fontSize:32 }}>{stampReleased?"✦":"✓"}</span></div></div><h1 className="page-title">{stampReleased?`Stamped. Tea ${item.position}.`:`Tea ${item.position} complete.`}</h1>{!stampReleased&&<p className="page-lede">Your stamp is released when your host moves to the next tea or ends the tasting.</p>}<section className="card" style={{ marginTop:20 }}><h2>Keep this tea</h2><p>Save it to include it in your customer dashboard.</p><button className={`btn ${saved?"btn-secondary":"btn-primary btn-attention"}`} onClick={onToggle}>{saved?"Remove from my tasting":"Save to my tasting"}</button></section><div className="guest-actions"><p className="muted">Your host will introduce the next step.</p></div></div>; }
function Trivia({ trivia, choice, answer, error, saved, toggleSaved }: { trivia:NonNullable<StatePayload["trivia"]>; choice:number|null; answer:(i:number)=>void; error:string; saved:boolean; toggleSaved:()=>void }) { return <><p className="eyebrow">Trivia · Question {trivia.questionNumber} of {trivia.questionTotal}</p><h1 className="page-title">{trivia.question}</h1><GuestError message={error} /><div className="stack">{trivia.options.map((x,i)=><button className={`btn ${choice===i?"btn-primary":"btn-secondary"}`} disabled={choice!==null||trivia.closed} key={x} onClick={()=>answer(i)}>{x}</button>)}</div>{choice!==null&&!trivia.closed&&<div className="notice" style={{ marginTop:16 }}>Answer locked in. Waiting for the host…</div>}{trivia.closed&&<section className={`notice ${choice===trivia.correctIndex?"success":""}`} style={{ marginTop:16 }}><strong>{choice===trivia.correctIndex?"That’s it.":`The answer was ${trivia.options[trivia.correctIndex ?? 0]}.`}</strong><br />{trivia.explanation}</section>}{trivia.closed&&<section className="card" style={{ marginTop:16 }}><h2>Your Passport</h2><p>Your tasting is complete. The stamp is released when your host moves to the next tea or ends the tasting.</p><button className={`btn ${saved?"btn-secondary":"btn-primary btn-attention"}`} onClick={toggleSaved}>{saved?"Remove from my tasting":"Save to my tasting"}</button></section>}</>; }
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
  useEffect(() => () => reportConnectionHealthy(guestConnectionSource(state.event.id, "saved-tea")), [state.event.id]);
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

  return <main className="guest-shell" id="main-content"><div className="guest-pane"><div style={{ textAlign: "center" }}><Brand /><h1 className="page-title">Your evening, {state.participant.displayName}</h1><p className="muted">{state.event.title}</p></div><div className="grid grid-3" style={{ marginTop: 20 }}><div className="card"><strong className="display" style={{ fontSize: 34 }}>{state.analytics?.average_rating ?? "—"}</strong><p>room average</p></div><div className="card"><strong className="display" style={{ fontSize: 34 }}>{savedCount}</strong><p>you saved</p></div><div className="card"><strong className="display" style={{ fontSize: 34 }} aria-label={participantTrivia.total ? `${participantTrivia.correct} correct trivia answers` : "No trivia questions"}>{participantTrivia.total ? participantTrivia.correct : "—"}</strong><p>{participantTrivia.total ? `correct · answered ${participantTrivia.answered} of ${participantTrivia.total}` : "no trivia questions"}</p></div></div><div className="section-label"><span>Your teas</span></div><div className="stack">{(state.allItems ?? []).map(item => { const response = own.find(candidate => candidate.event_flight_item_id === item.id); const tasted = Boolean(response?.completed_at); const ratingLabel = !tasted ? "Not tasted" : response?.rating ? `${response.rating} out of 5 stars` : "Rating not recorded"; const isSaved = Boolean(savedByTea[item.id]); const isSaving = savingTeaId === item.id; return <article className="card" key={item.id}><div className="card-header"><div><h2 className="card-title">{item.reveal_title}</h2><p className="card-meta">{item.tea?.origin}</p></div><span aria-label={ratingLabel}>{tasted && response?.rating ? `${"★".repeat(response.rating)}${"☆".repeat(5 - response.rating)}` : ratingLabel}</span></div><p>{tasted ? response?.descriptors?.join(" · ") || "No descriptors recorded" : "This tea wasn’t tasted."}</p>{isSaved && <span className="chip chip-success">Saved to remember</span>}<div className="card-footer"><button className={`btn ${isSaved ? "btn-secondary" : "btn-primary btn-attention"}`} type="button" disabled={isSaving || Boolean(savingTeaId && !isSaving)} aria-pressed={isSaved} onClick={() => toggleSavedTea(item.id)}>{isSaving ? "Saving…" : isSaved ? "Remove from my tasting" : "Save to my tasting"}</button></div>{saveMessage?.teaId === item.id && (saveMessage.error ? <GuestError message={saveMessage.text} /> : <div className="notice success" role="status" aria-atomic="true">{saveMessage.text}</div>)}</article>; })}</div><div className="section-label"><span>Keep your recap</span></div><RecapPrivacyControls state={state} onDeleted={() => setDeleted(true)} /><div className="guest-actions"><ClaimButton eventId={state.event.id} linked={state.participant.linkedToAccount} /></div></div></main>;
}

async function persistGuestSavedTea(eventId: string, flightItemId: string, saved: boolean) {
  const source = guestConnectionSource(eventId, "saved-tea");
  let response: Response;
  try {
    response = await fetch(`/api/events/${eventId}/saved-tea`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ flightItemId, saved })
    });
  } catch {
    reportConnectionIssue(source);
    throw new Error("We couldn’t reach the tasting. Try that saved-tea change again.");
  }
  const result = await response.json().catch(() => ({}));
  if (response.status >= 500) reportConnectionIssue(source); else reportConnectionHealthy(source);
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
  return <div className="stack"><section className="card"><h2 className="card-title">Email me my recap</h2><p>Get your own ratings, descriptors, notes and saved teas, plus a private link to delete this tasting data later.</p>{editingEmail && <div className="field"><label htmlFor="recap-email">Email address</label><input className="input" id="recap-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder={maskedEmail ?? "you@example.com"} /></div>}{emailMessage && (emailStatus === "sent" ? <div className="notice success" role="status" aria-atomic="true">{emailMessage}</div> : <GuestError message={emailMessage} />)}{attemptsRemaining !== null && <p className="help">{attemptsRemaining} resend{attemptsRemaining === 1 ? "" : "s"} remaining in the next 24 hours.</p>}<div className="row" style={{ marginTop: 16 }}><button className="btn btn-primary btn-attention" type="button" disabled={emailStatus === "sending" || noRetriesRemain || (editingEmail && !email.trim())} onClick={sendRecap}>{emailStatus === "sending" ? "Sending…" : emailStatus === "sent" ? "Send this to me again" : emailStatus === "failed" ? "Try again" : "Send my recap"}</button>{!editingEmail && <button className="btn btn-quiet" type="button" onClick={() => setEditingEmail(true)}>Use another address</button>}</div></section><section className="card"><h2 className="card-title">Your tasting data</h2>{!confirmingDelete ? <><p>You can permanently remove your notes, ratings, answers, stamps and saved teas from this tasting.</p><button className="btn btn-secondary" type="button" onClick={() => setConfirmingDelete(true)}>Delete my tasting data</button></> : <><div className="notice error"><strong>This cannot be undone.</strong><p style={{ margin: "8px 0 0" }}>Your tasting data will be permanently deleted. Your Vintage Fork account, if you have one, will not be deleted.</p></div><GuestError message={deleteError} /><div className="row" style={{ marginTop: 16 }}><button className="btn btn-danger" type="button" disabled={deleting} onClick={deleteData}>{deleting ? "Deleting…" : "Yes, delete my tasting data"}</button><button className="btn btn-secondary" type="button" disabled={deleting} onClick={() => { setConfirmingDelete(false); setDeleteError(""); }}>Keep my data</button></div></>}</section></div>;
}
function ClaimButton({ eventId, linked }: { eventId: string; linked: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const source = guestConnectionSource(eventId, "claim");
  useEffect(() => () => reportConnectionHealthy(source), [source]);

  async function claim() {
    if (linked) { window.location.href = "/dashboard"; return; }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/claim`, { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (response.status >= 500) reportConnectionIssue(source); else reportConnectionHealthy(source);
      if (response.status === 401) { window.location.href = withNextPath("/login", window.location.pathname); return; }
      if (!response.ok) { setMessage(result.error ?? "The tasting could not be linked."); return; }
      window.location.href = "/dashboard";
    } catch {
      reportConnectionIssue(source);
      setMessage("We couldn’t reach the tasting. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return <><button className="btn btn-primary btn-attention" disabled={busy} onClick={claim}>{linked ? "Open My Tea Cellar" : busy ? "Saving…" : "Save to My Tea Cellar"}</button><GuestError message={message} /></>;
}

function Terminal({ title, copy }: { title:string; copy:string }) { return <main className="guest-shell"><div className="guest-pane" style={{ justifyContent:"center",textAlign:"center" }}><Brand /><h1 className="page-title">{title}</h1><p>{copy}</p></div></main>; }
function draftKey(eventId:string,participantId:string,flightId:string){return `vf:draft:${eventId}:${participantId}:${flightId}`;}
function loadDraft(eventId:string,participantId:string,flightId:string):Draft{try{const raw=localStorage.getItem(draftKey(eventId,participantId,flightId));return raw?{...blankDraft,...JSON.parse(raw)}:blankDraft}catch{return blankDraft}}
function saveLocalDraft(eventId:string,participantId:string,flightId:string,draft:Draft){try{localStorage.setItem(draftKey(eventId,participantId,flightId),JSON.stringify(draft))}catch{}}
function loadPendingTrivia():PendingTriviaAnswer|null{try{const raw=sessionStorage.getItem("pending_trivia_answer");return raw?JSON.parse(raw) as PendingTriviaAnswer:null}catch{return null}}
function savePendingTrivia(pending:PendingTriviaAnswer){try{sessionStorage.setItem("pending_trivia_answer",JSON.stringify(pending))}catch{}}
function clearPendingTrivia(){try{sessionStorage.removeItem("pending_trivia_answer")}catch{}}
