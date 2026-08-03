"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { Brand } from "@/components/Brand";
import { StatusChip } from "@/components/StatusChip";
import { canAcquireHostControl } from "@/lib/host-control";
import { requestHostCommand } from "@/lib/host-command";
import { getHostRecoveryView, isHostConsoleCurrent, type HostConnectionStatus, type HostSyncStatus } from "@/lib/host-recovery";
import { isActiveRoomParticipant } from "@/lib/host-participants";
import { getHostPhaseAnnouncement, getHostPrimaryAnnouncement } from "@/lib/host-announcements";
import { getTriviaProgress } from "@/lib/event-trivia";
import type { EventCommand, SessionPhase, UserRole } from "@/types/domain";

type Trivia = {id:string;position:number;question:string;options:string[];correct_index:number;explanation:string|null;answer_window_seconds:number};
type Flight = { id:string; position:number; reveal_title:string; reveal_description:string; brewing_instructions:string; steep_seconds:number; temperature_c:number|null; leaf_grams:number|null; water_ml:number|null; tea:{name:string;origin:string|null;producer:string|null}|null; trivia:Trivia[]|Trivia|null };
type EventState = { id:string; title:string; status:string; phase:SessionPhase; sequence_number:number; current_flight_item_id:string|null; current_trivia_question_id:string|null; tasting_opened_flight_item_id:string|null; reveal_at:string|null; timer_ends_at:string|null; trivia_closes_at:string|null; invite_code:string|null; starts_at:string; location_mode:string; capacity:number; host_user_id:string; backup_host_user_id:string|null };
type Participant = { id:string;display_name:string;status:string;last_seen_at:string|null;joined_at:string|null };
type Lease = { holder_user_id:string;lease_token:string;expires_at:string;heartbeat_at:string };
type ConsoleError = { message:string; detail:string };

export function HostConsole({ initialEvent, flight, initialParticipants, userId, userName, userRole }: { initialEvent:EventState; flight:Flight[]; initialParticipants:Participant[]; userId:string; userName:string; userRole:UserRole }) {
  const [event, setEvent] = useState(initialEvent);
  const [participants, setParticipants] = useState(initialParticipants);
  const [lease, setLease] = useState<Lease|null>(null);
  const [leaseError, setLeaseError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ConsoleError|null>(null);
  const [presence, setPresence] = useState(0);
  const [now, setNow] = useState<number|null>(null);
  const [connectionStatus, setConnectionStatus] = useState<HostConnectionStatus>("reconnecting");
  const [syncStatus, setSyncStatus] = useState<HostSyncStatus>("catching_up");
  const [recoveryNotice, setRecoveryNotice] = useState(false);
  const eventRef = useRef(event); eventRef.current = event;
  const roomSignalRef = useRef<((sequenceNumber:number, phase:SessionPhase)=>Promise<void>)|null>(null);
  const staffChannelSubscribedRef = useRef(false);
  const roomChannelSubscribedRef = useRef(false);
  const hadConnectionProblemRef = useRef(false);

  const current = useMemo(() => flight.find(x => x.id === event.current_flight_item_id) ?? flight[0] ?? null, [flight,event.current_flight_item_id]);
  const currentTime = now ?? 0;
  const controllable = canAcquireHostControl(event.status, event.phase);
  const leaseExpired = Boolean(lease && now !== null && new Date(lease.expires_at).getTime() <= now);
  const holder = controllable && lease?.holder_user_id === userId && !leaseExpired;
  const leaseUnhealthy = Boolean(lease && now !== null && now - new Date(lease.heartbeat_at).getTime() >= 15000);
  const consoleCurrent = isHostConsoleCurrent(connectionStatus, syncStatus);
  const recoveryView = getHostRecoveryView(connectionStatus, syncStatus);
  const canTakeControl = consoleCurrent && controllable && !holder && now !== null && (!lease || leaseExpired || (leaseUnhealthy && (userRole === "admin" || event.backup_host_user_id === userId)));
  const forceTakeover = Boolean(lease && !leaseExpired);
  const active = participants.filter(participant => isActiveRoomParticipant(participant, now));
  const currentTriviaProgress = getTriviaProgress(triviaList(current), event.current_trivia_question_id);
  const currentTrivia = currentTriviaProgress.currentIndex >= 0 ? currentTriviaProgress.ordered[currentTriviaProgress.currentIndex] : null;

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const [eventResult, participantResult, leaseResult] = await Promise.all([
      supabase.from("events").select("id,title,status,phase,sequence_number,current_flight_item_id,current_trivia_question_id,tasting_opened_flight_item_id,reveal_at,timer_ends_at,trivia_closes_at,invite_code,starts_at,location_mode,capacity,host_user_id,backup_host_user_id").eq("id", initialEvent.id).single(),
      supabase.from("participants").select("id,display_name,status,last_seen_at,joined_at").eq("event_id", initialEvent.id).order("joined_at"),
      supabase.from("host_control_leases").select("holder_user_id,lease_token,expires_at,heartbeat_at").eq("event_id", initialEvent.id).maybeSingle()
    ]);
    if (eventResult.error || participantResult.error || leaseResult.error) return false;
    const { data: eventData } = eventResult;
    const { data: participantData } = participantResult;
    const { data: leaseData } = leaseResult;
    if (eventData && eventData.sequence_number >= eventRef.current.sequence_number) setEvent(eventData as EventState);
    if (participantData) setParticipants(participantData as Participant[]);
    setLease((leaseData as Lease|null) ?? null);
    return true;
  }, [initialEvent.id]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    function markConnectionProblem(status: HostConnectionStatus) {
      if (cancelled) return;
      hadConnectionProblemRef.current = true;
      setConnectionStatus(status);
      setSyncStatus("stale");
      setRecoveryNotice(false);
    }
    async function recoverFromSnapshot() {
      if (!cancelled) setSyncStatus("catching_up");
      const snapshotCurrent = await refresh();
      if (cancelled) return;
      if (!snapshotCurrent) {
        hadConnectionProblemRef.current = true;
        setConnectionStatus(current => current === "offline" ? "offline" : "unstable");
        setSyncStatus("stale");
        return;
      }
      setSyncStatus("current");
      if (staffChannelSubscribedRef.current && roomChannelSubscribedRef.current) {
        setConnectionStatus("online");
        if (hadConnectionProblemRef.current) setRecoveryNotice(true);
        hadConnectionProblemRef.current = false;
      }
    }
    function refreshFromChange() {
      void refresh().then(snapshotCurrent => {
        if (cancelled) return;
        if (snapshotCurrent) {
          setSyncStatus("current");
          if (staffChannelSubscribedRef.current && roomChannelSubscribedRef.current) {
            setConnectionStatus("online");
            if (hadConnectionProblemRef.current) setRecoveryNotice(true);
            hadConnectionProblemRef.current = false;
          }
          return;
        }
        hadConnectionProblemRef.current = true;
        setConnectionStatus(current => current === "offline" ? "offline" : "unstable");
        setSyncStatus("stale");
      });
    }
    async function acquire() {
      const { data, error: acquireError } = await supabase.rpc("acquire_host_control", { p_event_id: initialEvent.id, p_force: false });
      if (data) setLease(data as Lease);
      if (acquireError) { setLeaseError(acquireError.message.includes("control_held") ? "Another assigned host is running this tasting. You are watching." : "Host control could not be acquired."); await refresh(); }
    }
    if (canAcquireHostControl(initialEvent.status, initialEvent.phase)) acquire();
    const channel = supabase.channel(`host-${initialEvent.id}`, { config: { presence: { key: userId } } });
    const roomChannel = supabase.channel(`event-${initialEvent.invite_code ?? initialEvent.id}`);
    channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "events", filter: `id=eq.${initialEvent.id}` }, payload => { const next = payload.new as EventState; if (next.sequence_number >= eventRef.current.sequence_number) setEvent(next); });
    channel.on("postgres_changes", { event: "*", schema: "public", table: "participants", filter: `event_id=eq.${initialEvent.id}` }, refreshFromChange);
    channel.on("postgres_changes", { event: "*", schema: "public", table: "host_control_leases", filter: `event_id=eq.${initialEvent.id}` }, refreshFromChange);
    channel.on("presence", { event: "sync" }, () => setPresence(Object.keys(channel.presenceState()).length));
    channel.subscribe(status => {
      if (cancelled) return;
      if (status === "SUBSCRIBED") {
        staffChannelSubscribedRef.current = true;
        void channel.track({ name:userName, role:"host", onlineAt:new Date().toISOString() });
        if (roomChannelSubscribedRef.current) void recoverFromSnapshot();
      } else if (status === "TIMED_OUT" || status === "CHANNEL_ERROR") {
        staffChannelSubscribedRef.current = false;
        markConnectionProblem("reconnecting");
      } else if (status === "CLOSED") {
        staffChannelSubscribedRef.current = false;
        markConnectionProblem("offline");
      }
    });
    roomChannel.subscribe(status => {
      if (cancelled) return;
      if (status === "SUBSCRIBED") {
        roomChannelSubscribedRef.current = true;
        if (staffChannelSubscribedRef.current) void recoverFromSnapshot();
      } else if (status === "TIMED_OUT" || status === "CHANNEL_ERROR") {
        roomChannelSubscribedRef.current = false;
        markConnectionProblem("reconnecting");
      } else if (status === "CLOSED") {
        roomChannelSubscribedRef.current = false;
        markConnectionProblem("offline");
      }
    });
    roomSignalRef.current = async (sequenceNumber, phase) => {
      const sendStatus = await roomChannel.send({ type:"broadcast", event:"phase.changed", payload:{ sequenceNumber, phase } });
      if (sendStatus !== "ok") {
        hadConnectionProblemRef.current = true;
        setConnectionStatus("unstable");
        setSyncStatus("stale");
        throw new Error("room_broadcast_unconfirmed");
      }
    };
    function handleOffline() {
      staffChannelSubscribedRef.current = false;
      roomChannelSubscribedRef.current = false;
      markConnectionProblem("offline");
    }
    function handleOnline() { markConnectionProblem("reconnecting"); void recoverFromSnapshot(); }
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      cancelled = true;
      staffChannelSubscribedRef.current = false;
      roomChannelSubscribedRef.current = false;
      roomSignalRef.current=null;
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      supabase.removeChannel(channel);
      supabase.removeChannel(roomChannel);
    };
  }, [initialEvent.id, initialEvent.invite_code, initialEvent.phase, initialEvent.status, refresh, userId, userName]);

  useEffect(() => {
    if (consoleCurrent) return;
    const poll = window.setInterval(() => {
      void refresh().then(snapshotCurrent => {
        if (!snapshotCurrent) return;
        setSyncStatus("current");
        if (staffChannelSubscribedRef.current && roomChannelSubscribedRef.current) {
          setConnectionStatus("online");
          if (hadConnectionProblemRef.current) setRecoveryNotice(true);
          hadConnectionProblemRef.current = false;
        }
      });
    }, 5000);
    return () => window.clearInterval(poll);
  }, [consoleCurrent, refresh]);

  useEffect(() => {
    if (!recoveryNotice) return;
    const timeout = window.setTimeout(() => setRecoveryNotice(false), 6000);
    return () => window.clearTimeout(timeout);
  }, [recoveryNotice]);

  useEffect(() => {
    if (!controllable || !lease || lease.holder_user_id !== userId) return;
    const supabase = createClient();
    const t = window.setInterval(async () => {
      const { data, error: heartbeatError } = await supabase.rpc("heartbeat_host_control", { p_event_id: initialEvent.id, p_lease_token: lease.lease_token });
      if (data) {
        setLease(data as Lease);
        if (staffChannelSubscribedRef.current && roomChannelSubscribedRef.current) {
          setConnectionStatus("online");
          setSyncStatus("current");
          setLeaseError("");
          if (hadConnectionProblemRef.current) setRecoveryNotice(true);
          hadConnectionProblemRef.current = false;
        }
      }
      if (heartbeatError) {
        hadConnectionProblemRef.current = true;
        setConnectionStatus(window.navigator.onLine ? "reconnecting" : "offline");
        setSyncStatus("stale");
        setRecoveryNotice(false);
        setLeaseError("Host control could not be confirmed. Nothing changed for guests.");
        await refresh();
      }
    }, 5000);
    return () => window.clearInterval(t);
  }, [controllable, lease, userId, initialEvent.id, refresh]);

  useEffect(() => { const t=setInterval(()=>setNow(Date.now()),250); return()=>clearInterval(t); },[]);

  async function takeControl(force = false) {
    if (!controllable || !consoleCurrent) return;
    const supabase = createClient(); setBusy(true); setError(null);
    const { data, error: takeError } = await supabase.rpc("acquire_host_control", { p_event_id: event.id, p_force: force });
    setBusy(false);
    if (takeError) { setError({ message:takeError.message.includes("control_held") ? "The current host still has a healthy control lease." : "Control could not be acquired.", detail:"Nothing changed for guests." }); return; }
    setLease(data as Lease); setLeaseError("");
  }

  async function copyInvite() {
    const value = `${window.location.origin}/event/${event.invite_code}`;
    try { await navigator.clipboard.writeText(value); setError(null); }
    catch { const input=document.createElement("textarea"); input.value=value; input.style.position="fixed"; input.style.opacity="0"; document.body.append(input); input.select(); const copied=document.execCommand("copy"); input.remove(); if (!copied) setError({ message:"The invite could not be copied. Select it from event setup instead.", detail:"Nothing changed for guests." }); }
  }

  async function command(command: EventCommand) {
    if (!lease || !holder || !consoleCurrent) return;
    setBusy(true); setError(null);
    let shouldRefresh = false;
    try {
      const result = await requestHostCommand<EventState>({ eventId:event.id, command, expectedSequence:event.sequence_number, leaseToken:lease.lease_token });
      if (result.kind === "rejected") {
        setError({ message:result.message, detail:"Nothing changed for guests." });
        shouldRefresh = true;
        return;
      }
      if (result.kind === "unconfirmed") {
        setError({ message:"The connection dropped while checking that command.", detail:"We couldn’t confirm what guests received. Check the current phase before trying again." });
        shouldRefresh = true;
        return;
      }
      setEvent(result.event);
      if (result.event.phase === "ended") setLease(null);
      await roomSignalRef.current?.(result.event.sequence_number, result.event.phase);
    } catch {
      setError({ message:"The connection dropped while checking that command.", detail:"We couldn’t confirm what guests received. Check the current phase before trying again." });
      shouldRefresh = true;
    } finally {
      setBusy(false);
      if (shouldRefresh) void refresh().catch(() => undefined);
    }
  }

  const triviaClosed = Boolean(event.trivia_closes_at && now !== null && new Date(event.trivia_closes_at).getTime() <= now);
  const revealEligible = !event.reveal_at || Boolean(now !== null && now >= new Date(event.reveal_at).getTime() + 1400);
  const primary = getPrimary(event,current,triviaClosed,flight,revealEligible);
  const remaining = event.timer_ends_at && now !== null ? Math.max(0,new Date(event.timer_ends_at).getTime()-now) : (current?.steep_seconds ?? 0) * 1000;
  const leaseMessage = holder ? "You’re running this tasting." : leaseError || "You are watching this tasting.";
  const phaseAnnouncement = getHostPhaseAnnouncement(event.phase, current?.reveal_title ?? null);
  const primaryAnnouncement = getHostPrimaryAnnouncement({ consoleCurrent, holder, phase:event.phase, label:primary?.label ?? null, disabled:Boolean(primary?.disabled) });

  return <main className="live-shell" id="main-content">
    <div className="live-topbar"><Brand compact /><div><strong>{event.title}</strong><div style={{fontSize:12,opacity:.75}}>{new Date(event.starts_at).toLocaleString("en-CA",{dateStyle:"medium",timeStyle:"short"})}</div></div><span className="spacer"/><StatusChip value={event.phase}/><span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{phaseAnnouncement}</span><span className={`chip ${recoveryView.tone === "success" ? "chip-success" : "chip-warning"}`}>{recoveryView.label}</span><span className="chip">{presence} staff device{presence===1?"":"s"}</span></div>
    <div className={`notice ${holder?"success":""}`} style={{borderRadius:0}}><span role="status" aria-live="polite" aria-atomic="true">{leaseMessage}</span>{canTakeControl&&<button className="btn btn-secondary" style={{marginLeft:12}} disabled={busy} onClick={()=>takeControl(forceTakeover)}>{forceTakeover ? "Claim host control" : "Take control"}</button>}</div>
    {!consoleCurrent&&<div className={`notice ${recoveryView.tone === "error" ? "error" : ""}`} role="status" aria-live="assertive"><strong>{recoveryView.message}</strong> Controls will return after the current room state is confirmed.</div>}
    {consoleCurrent&&recoveryNotice&&<div className="notice success" role="status" aria-live="polite">You’re back. Nothing changed for your guests.</div>}
    {error&&<div className="notice error" role="alert">{error.message} {error.detail}</div>}
    <div className="live-main"><div className="row" style={{marginBottom:16,overflowX:"auto",flexWrap:"nowrap"}}>{flight.map(item=><div key={item.id} className={`chip ${item.id===event.current_flight_item_id?"chip-live":""}`}>{item.position}. {item.reveal_title}</div>)}</div>
      <div className="live-grid"><section className="card">{event.phase==="lobby"?<Lobby event={event} flight={flight} active={active.length}/>:event.phase==="ended"?<Ended event={event}/>:<CurrentPhase event={event} current={current} trivia={currentTrivia} triviaClosed={triviaClosed} remaining={remaining} participants={active} triviaNumber={currentTriviaProgress.currentNumber} triviaTotal={currentTriviaProgress.total}/>}</section>
      <aside className="card" style={{position:"sticky",top:80}}><div className="card-header"><h2 className="card-title">The room</h2><span className="chip chip-success">{active.length} / {event.capacity}</span></div><div className="stack" style={{gap:8}}>{participants.map(p=><div className="row" key={p.id} style={{borderBottom:"1px solid var(--vf-line)",paddingBottom:8}}><div><strong>{p.display_name}</strong><div className="help">{p.status} · {freshness(p.last_seen_at,currentTime)}</div></div><span className="spacer"/><span aria-hidden="true" style={{color:isActiveRoomParticipant(p,now)?"var(--vf-forest)":"var(--vf-gold)"}}>●</span></div>)}</div><div className="card-footer"><button className="btn btn-secondary" onClick={copyInvite}>Copy invite</button><Link className="btn btn-secondary" href={`/admin/events/${event.id}`} prefetch={false}>Event setup</Link></div></aside></div>
    </div>
    <footer className="command-rail"><span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{primaryAnnouncement}</span><div className="command-inner">{event.phase!=="ended"&&!consoleCurrent&&<button className="btn btn-secondary" disabled>Reconnecting — controls paused</button>}{event.phase!=="ended"&&consoleCurrent&&holder&&primary&&(primary.command==="reveal_tea"?<RevealControl label={primary.label} busy={busy} onCommit={()=>command(primary.command)}/>:<button className="btn btn-primary" disabled={busy||primary.disabled} onClick={()=>command(primary.command)}>{busy?"Applying…":primary.label}</button>)}{event.phase!=="ended"&&consoleCurrent&&!holder&&<button className="btn btn-secondary" disabled>Watching — {lease?.holder_user_id?"another host has control":"no active control"}</button>}{event.phase!=="lobby"&&event.phase!=="ended"&&consoleCurrent&&holder&&<button className="btn btn-danger" disabled={busy} onClick={()=>{if(confirm("End this tasting? This tasting can’t be reopened. Your guests’ live screens will close. Their recap stays available."))command("end_session")}}>End tasting</button>}{event.phase==="ended"&&<Link className="btn btn-primary" href={`/admin/events/${event.id}/results`} prefetch={false}>See results</Link>}</div></footer>
  </main>;
}

function Lobby({event,flight,active}:{event:EventState;flight:Flight[];active:number}){return <><p className="eyebrow">Pre-session</p><h1 className="page-title">The room is ready.</h1><div className="grid grid-3" style={{marginTop:20}}><div className="card"><strong className="display" style={{fontSize:36}}>{flight.length}</strong><p>teas</p></div><div className="card"><strong className="display" style={{fontSize:36}}>{active}</strong><p>joined</p></div><div className="card"><strong className="display" style={{fontSize:36}}>{event.capacity}</strong><p>capacity</p></div></div><div className="notice" style={{marginTop:16}}>For remote tastings, open Zoom or Meet and turn captions on before opening the room.</div></>}
function CurrentPhase({event,current,trivia,triviaClosed,remaining,participants,triviaNumber,triviaTotal}:{event:EventState;current:Flight|null;trivia:Trivia|null;triviaClosed:boolean;remaining:number;participants:Participant[];triviaNumber:number;triviaTotal:number}){if(!current)return <div className="empty-state"><h2>No tea is selected.</h2></div>;const done=participants.filter(p=>p.status==="active").length;return <><p className="eyebrow">Tea {current.position}</p><h1 className="page-title">{current.reveal_title}</h1><p className="page-lede">{current.tea?.producer} · {current.tea?.origin}</p><div className="section-label"><span>Reveal text</span></div><p>{current.reveal_description}</p><div className="section-label"><span>Brewing</span></div><div className="grid grid-3"><div className="card"><strong>{current.temperature_c??"—"}°C</strong><p className="help">Water</p></div><div className="card"><strong>{current.leaf_grams??"—"}g</strong><p className="help">Leaf</p></div><div className="card"><strong>{current.water_ml??"—"}ml</strong><p className="help">Water volume</p></div></div><p style={{marginTop:12}}>{current.brewing_instructions}</p>{event.phase==="brewing"&&<div className="timer-ring" role="timer" aria-live="off" aria-label={`Brewing timer, ${formatClock(remaining)} remaining`}><div><div className="timer-readout">{formatClock(remaining)}</div><small>server timer</small></div></div>}{event.phase==="tasting"&&(event.tasting_opened_flight_item_id===event.current_flight_item_id?<div className="notice success">Tasting responses are open. {done} participants are active.</div>:<div className="notice">Ready for the next reveal. Guests are waiting between teas.</div>)}{event.phase==="trivia"&&trivia&&<section className="card" style={{marginTop:16}}><p className="eyebrow">Question {triviaNumber} of {triviaTotal}</p><h2 className="card-title">{trivia.question}</h2><div className="stack">{trivia.options.map((x,i)=><div className="row" key={x}><span>{String.fromCharCode(65+i)}.</span><span>{x}</span>{triviaClosed&&i===trivia.correct_index&&<span className="chip chip-success">Correct</span>}</div>)}</div></section>}</>}
function Ended({event}:{event:EventState}){return <div className="empty-state"><h1>This tasting has ended.</h1><p>Guest live screens are closed. Their recaps and customer histories remain available.</p><div className="row" style={{ justifyContent:"center" }}><Link className="btn btn-primary" href={`/admin/events/${event.id}/results`} prefetch={false}>See results</Link></div></div>}
function RevealControl({label,busy,onCommit}:{label:string;busy:boolean;onCommit:()=>void}){const[mode,setMode]=useState<"idle"|"arming"|"armed">("idle");const[commitReady,setCommitReady]=useState(false);const armTimer=useRef<number|null>(null);const readyTimer=useRef<number|null>(null);const holding=useRef(false);const armed=useRef(false);const clearArm=useCallback(()=>{if(armTimer.current!==null)window.clearTimeout(armTimer.current);armTimer.current=null},[]);useEffect(()=>()=>{clearArm();if(readyTimer.current!==null)window.clearTimeout(readyTimer.current)},[clearArm]);function startArm(){if(busy||armed.current)return;holding.current=true;armed.current=false;setMode("arming");clearArm();armTimer.current=window.setTimeout(()=>{if(!holding.current)return;armed.current=true;setMode("armed");setCommitReady(false);readyTimer.current=window.setTimeout(()=>setCommitReady(true),400)},600)}function releaseArm(){holding.current=false;if(!armed.current){clearArm();setMode("idle")}}function cancel(){holding.current=false;armed.current=false;clearArm();if(readyTimer.current!==null)window.clearTimeout(readyTimer.current);setCommitReady(false);setMode("idle")}if(mode==="armed")return <div className="row reveal-actions" aria-live="polite"><button className="btn btn-gold" disabled={busy||!commitReady} onClick={onCommit}>{busy?"Scheduling…":commitReady?label:"Armed…"}</button><button className="btn btn-secondary" disabled={busy} onClick={cancel}>Cancel</button></div>;return <button className="btn btn-secondary" disabled={busy} onPointerDown={startArm} onPointerUp={releaseArm} onPointerCancel={releaseArm} onPointerLeave={releaseArm} onKeyDown={event=>{if(event.code==="Space"&&!event.repeat){event.preventDefault();startArm()}}} onKeyUp={event=>{if(event.code==="Space"){event.preventDefault();releaseArm()}}}>{mode==="arming"?"Keep holding…":"Hold 600ms to arm the reveal"}</button>}
function getPrimary(event:EventState,current:Flight|null,triviaClosed:boolean,flight:Flight[],revealEligible:boolean):{label:string;command:EventCommand;disabled?:boolean}|null{switch(event.phase){case"lobby":return{label:"Open the tasting",command:"open_session"};case"welcome":return{label:`Reveal ${current?.reveal_title??"tea"} now`,command:"reveal_tea"};case"reveal":return revealEligible?{label:`Start timer · ${formatClock((current?.steep_seconds??0)*1000)}`,command:"start_timer"}:{label:"Reveal in progress",command:"start_timer",disabled:true};case"brewing":return{label:"Open the tasting",command:"open_tasting"};case"tasting":{const idx=flight.findIndex(x=>x.id===event.current_flight_item_id);if(event.tasting_opened_flight_item_id!==event.current_flight_item_id)return{label:`Reveal ${current?.reveal_title??"tea"} now`,command:"reveal_tea"};const progress=getTriviaProgress(triviaList(current),event.current_trivia_question_id);if(progress.hasNext)return{label:progress.total>1?`Open trivia ${progress.nextNumber} of ${progress.total}`:"Open trivia",command:"open_trivia"};if(idx<flight.length-1)return{label:`Next tea — ${flight[idx+1].reveal_title}`,command:"next_tea"};return{label:"Start the recap",command:"start_recap"}}case"trivia":return triviaClosed?{label:"Back to the tasting",command:"return_to_tasting"}:{label:"Close trivia",command:"close_trivia"};case"recap":return null;default:return null}}
function triviaList(flight:Flight|null):Trivia[]{if(!flight?.trivia)return[];return Array.isArray(flight.trivia)?flight.trivia:[flight.trivia]}
function freshness(value:string|null,now:number){if(!value)return"not connected";const seconds=Math.floor((now-new Date(value).getTime())/1000);return seconds<10?"with us":seconds<45?`${seconds}s ago`:"quiet"}
function formatClock(ms:number){const total=Math.max(0,Math.ceil(ms/1000));return`${Math.floor(total/60)}:${String(total%60).padStart(2,"0")}`}
