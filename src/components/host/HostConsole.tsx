"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { Brand } from "@/components/Brand";
import { AgoraVideoRoom } from "@/components/live/AgoraVideoRoom";
import { LiveCommunication } from "@/components/live/LiveCommunication";
import { SharedBrewingTimer } from "@/components/live/SharedBrewingTimer";
import { HostConductorRail, type ConductorMetrics } from "@/components/host/HostConductorRail";
import {EMPTY_BREAKOUT_METRICS,HostBreakoutPanel,type BreakoutMetrics} from "@/components/host/HostBreakoutPanel";
import {EMPTY_HOST_DISCOVERY_BOARD,type HostDiscoveryBoard} from "@/components/host/HostDiscoveryPanel";
import {HostGroupRevealPanel} from "@/components/host/HostGroupRevealPanel";
import {HostCheersControl} from "@/components/host/HostCheersControl";
import {HostLiveRewardsControl} from "@/components/host/HostLiveRewardsControl";
import {HostConversationPrompts} from "@/components/host/HostConversationPrompts";
import {HostLivingTastingMap} from "@/components/host/HostLivingTastingMap";
import { StatusChip } from "@/components/StatusChip";
import { canAcquireHostControl } from "@/lib/host-control";
import { requestHostCommand,type HostCommandPayload } from "@/lib/host-command";
import { getHostRecoveryView, isHostConsoleCurrent, type HostConnectionStatus, type HostSyncStatus } from "@/lib/host-recovery";
import { isActiveRoomParticipant } from "@/lib/host-participants";
import { getHostPhaseAnnouncement } from "@/lib/host-announcements";
import { getTriviaProgress } from "@/lib/event-trivia";
import { guestEventPath } from "@/lib/live-events-routes";
import { getConductorStage, resolveConductorStage } from "@/lib/conductor";
import { liveAttentionOrder } from "@/lib/discovery-first";
import type { SharedBrew } from "@/lib/shared-brewing";
import type {GroupRevealSnapshot} from "@/lib/group-reveal";
import type {HostCheersSnapshot} from "@/lib/cheers";
import type {HostLiveRewardsSnapshot} from "@/lib/live-rewards";
import type { ConductorStage, EventCommand, SessionPhase, UserRole } from "@/types/domain";

type Trivia = {id:string;position:number;question:string;options:string[];correct_index:number;explanation:string|null;answer_window_seconds:number};
type Flight = { id:string; position:number; reveal_title:string; reveal_description:string; brewing_instructions:string; steep_seconds:number; temperature_c:number|null; leaf_grams:number|null; water_ml:number|null; tea:{name:string;origin:string|null;producer:string|null}|null; trivia:Trivia[]|Trivia|null };
type EventState = { id:string; title:string; status:string; phase:SessionPhase; sequence_number:number; current_flight_item_id:string|null; current_trivia_question_id:string|null; tasting_opened_flight_item_id:string|null; reveal_at:string|null; timer_ends_at:string|null; trivia_closes_at:string|null; invite_code:string|null; starts_at:string; location_mode:string; capacity:number; host_user_id:string; backup_host_user_id:string|null; conductor_stage:ConductorStage; conductor_stage_started_at:string|null; conductor_stage_duration_seconds:number|null; conductor_paused_at:string|null; conductor_remaining_seconds:number|null; conductor_sequence_version:number; conductor_id:string|null; current_brew_id:string|null;current_breakout_session_id:string|null };
type Participant = { id:string;display_name:string;status:string;last_seen_at:string|null;joined_at:string|null };
type Lease = { holder_user_id:string;lease_token:string;expires_at:string;heartbeat_at:string };
type ConsoleError = { message:string; detail:string };
const EMPTY_METRICS:ConductorMetrics={participants:0,connected:0,ready:0,pouring:0,decanted:0,poured:0,observed:0,completed:0};

export function HostConsole({ initialEvent, initialBrew, flight, initialParticipants, userId, userName, userRole }: { initialEvent:EventState; initialBrew:SharedBrew|null; flight:Flight[]; initialParticipants:Participant[]; userId:string; userName:string; userRole:UserRole }) {
  const [event, setEvent] = useState(initialEvent);
  const [currentBrew,setCurrentBrew]=useState<SharedBrew|null>(initialBrew);
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
  const [conductorMetrics, setConductorMetrics] = useState<ConductorMetrics>(EMPTY_METRICS);
  const [breakoutMetrics,setBreakoutMetrics]=useState<BreakoutMetrics>(EMPTY_BREAKOUT_METRICS);
  const [discoveryBoard,setDiscoveryBoard]=useState<HostDiscoveryBoard>(EMPTY_HOST_DISCOVERY_BOARD);
  const [groupReveal,setGroupReveal]=useState<GroupRevealSnapshot|null>(null);
  const [hostCheers,setHostCheers]=useState<HostCheersSnapshot|null>(null);
  const [hostRewards,setHostRewards]=useState<HostLiveRewardsSnapshot|null>(null);
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
  const conductorStage = resolveConductorStage(event);
  const currentIndex = flight.findIndex(item => item.id === event.current_flight_item_id);
  const nextTea = currentIndex >= 0 ? flight[currentIndex + 1] ?? null : flight[0] ?? null;

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const [eventResult, participantResult, leaseResult, metricsResult, brewResult,breakoutResult,discoveryResult,groupRevealResult,cheersResult,rewardsResult] = await Promise.all([
      supabase.from("events").select("id,title,status,phase,sequence_number,current_flight_item_id,current_trivia_question_id,tasting_opened_flight_item_id,reveal_at,timer_ends_at,trivia_closes_at,invite_code,starts_at,location_mode,capacity,host_user_id,backup_host_user_id,conductor_stage,conductor_stage_started_at,conductor_stage_duration_seconds,conductor_paused_at,conductor_remaining_seconds,conductor_sequence_version,conductor_id,current_brew_id,current_breakout_session_id").eq("id", initialEvent.id).single(),
      supabase.from("participants").select("id,display_name,status,last_seen_at,joined_at").eq("event_id", initialEvent.id).order("joined_at"),
      supabase.from("host_control_leases").select("holder_user_id,lease_token,expires_at,heartbeat_at").eq("event_id", initialEvent.id).maybeSingle(),
      supabase.rpc("event_conductor_metrics", { p_event_id:initialEvent.id }),
      supabase.from("event_brews").select("id,event_id,event_flight_item_id,infusion_number,started_at,duration_ms,status,paused_at,accumulated_pause_ms,host_id,completed_at").eq("event_id",initialEvent.id).order("created_at",{ascending:false}).limit(1),
      supabase.rpc("event_breakout_metrics",{p_event_id:initialEvent.id}),
      supabase.rpc("event_discovery_board",{p_event_id:initialEvent.id}),
      fetch(`/api/events/${initialEvent.id}/group-reveal`,{cache:"no-store"}).then(async response=>response.ok?await response.json() as {snapshot:GroupRevealSnapshot|null}:null).catch(()=>null),
      fetch(`/api/events/${initialEvent.id}/cheers`,{cache:"no-store"}).then(async response=>response.ok?await response.json() as {snapshot:HostCheersSnapshot|null}:null).catch(()=>null),
      fetch(`/api/events/${initialEvent.id}/live-rewards`,{cache:"no-store"}).then(async response=>response.ok?await response.json() as {snapshot:HostLiveRewardsSnapshot|null}:null).catch(()=>null)
    ]);
    if (eventResult.error || participantResult.error || leaseResult.error) return false;
    const { data: eventData } = eventResult;
    const { data: participantData } = participantResult;
    const { data: leaseData } = leaseResult;
    if (eventData && eventData.sequence_number >= eventRef.current.sequence_number) setEvent(eventData as EventState);
    if (participantData) setParticipants(participantData as Participant[]);
    setLease((leaseData as Lease|null) ?? null);
    if(!brewResult.error){const latest=(brewResult.data?.[0] as SharedBrew|undefined)??null;setCurrentBrew(eventData?.current_brew_id===latest?.id?latest:null)}
    if (metricsResult.data && typeof metricsResult.data === "object") setConductorMetrics({ ...EMPTY_METRICS, ...(metricsResult.data as Partial<ConductorMetrics>) });
    if(breakoutResult.data&&typeof breakoutResult.data==="object")setBreakoutMetrics({...EMPTY_BREAKOUT_METRICS,...(breakoutResult.data as Partial<BreakoutMetrics>)});
    if(discoveryResult.data&&typeof discoveryResult.data==="object")setDiscoveryBoard({...EMPTY_HOST_DISCOVERY_BOARD,...(discoveryResult.data as Partial<HostDiscoveryBoard>)});
    if(groupRevealResult?.snapshot)setGroupReveal(groupRevealResult.snapshot);
    if(cheersResult)setHostCheers(cheersResult.snapshot);
    if(rewardsResult)setHostRewards(rewardsResult.snapshot);
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
    let cancelled=false;
    const supabase=createClient();
    async function refreshConductorMetrics() {
      const [conductorResult,breakoutResult,discoveryResult,groupRevealResult,cheersResult,rewardsResult]=await Promise.all([supabase.rpc("event_conductor_metrics", { p_event_id:initialEvent.id }),supabase.rpc("event_breakout_metrics",{p_event_id:initialEvent.id}),supabase.rpc("event_discovery_board",{p_event_id:initialEvent.id}),fetch(`/api/events/${initialEvent.id}/group-reveal`,{cache:"no-store"}).then(async response=>response.ok?await response.json() as {snapshot:GroupRevealSnapshot|null}:null).catch(()=>null),fetch(`/api/events/${initialEvent.id}/cheers`,{cache:"no-store"}).then(async response=>response.ok?await response.json() as {snapshot:HostCheersSnapshot|null}:null).catch(()=>null),fetch(`/api/events/${initialEvent.id}/live-rewards`,{cache:"no-store"}).then(async response=>response.ok?await response.json() as {snapshot:HostLiveRewardsSnapshot|null}:null).catch(()=>null)]);
      if (!cancelled&&conductorResult.data&&typeof conductorResult.data==="object") setConductorMetrics({ ...EMPTY_METRICS, ...(conductorResult.data as Partial<ConductorMetrics>) });
      if(!cancelled&&breakoutResult.data&&typeof breakoutResult.data==="object")setBreakoutMetrics({...EMPTY_BREAKOUT_METRICS,...(breakoutResult.data as Partial<BreakoutMetrics>)});
      if(!cancelled&&discoveryResult.data&&typeof discoveryResult.data==="object")setDiscoveryBoard({...EMPTY_HOST_DISCOVERY_BOARD,...(discoveryResult.data as Partial<HostDiscoveryBoard>)});
      if(!cancelled&&groupRevealResult?.snapshot)setGroupReveal(groupRevealResult.snapshot);
      if(!cancelled&&cheersResult)setHostCheers(cheersResult.snapshot);
      if(!cancelled&&rewardsResult)setHostRewards(rewardsResult.snapshot);
    }
    const initial=window.setTimeout(()=>{void refreshConductorMetrics()},0);
    const interval=window.setInterval(()=>{void refreshConductorMetrics()},5000);
    return()=>{cancelled=true;window.clearTimeout(initial);window.clearInterval(interval)};
  },[initialEvent.id]);

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
    if (!event.invite_code) return;
    const value = `${window.location.origin}${guestEventPath(event.invite_code)}`;
    try { await navigator.clipboard.writeText(value); setError(null); }
    catch { const input=document.createElement("textarea"); input.value=value; input.style.position="fixed"; input.style.opacity="0"; document.body.append(input); input.select(); const copied=document.execCommand("copy"); input.remove(); if (!copied) setError({ message:"The invite could not be copied. Select it from event setup instead.", detail:"Nothing changed for guests." }); }
  }

  async function command(command: EventCommand, payload:HostCommandPayload = {}) {
    if (!lease || !holder || !consoleCurrent) return;
    setBusy(true); setError(null);
    let shouldRefresh = false;
    try {
      const result = await requestHostCommand<EventState>({ eventId:event.id, command, expectedSequence:event.sequence_number, leaseToken:lease.lease_token, clientCommandId:crypto.randomUUID(), payload });
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
      await refresh();
    } catch {
      setError({ message:"The connection dropped while checking that command.", detail:"We couldn’t confirm what guests received. Check the current phase before trying again." });
      shouldRefresh = true;
    } finally {
      setBusy(false);
      if (shouldRefresh) void refresh().catch(() => undefined);
    }
  }

  const triviaClosed = Boolean(event.trivia_closes_at && now !== null && new Date(event.trivia_closes_at).getTime() <= now);
  const remaining = event.conductor_paused_at && event.conductor_remaining_seconds !== null
    ? event.conductor_remaining_seconds * 1000
    : event.timer_ends_at && now !== null ? Math.max(0,new Date(event.timer_ends_at).getTime()-now) : (current?.steep_seconds ?? 0) * 1000;
  const leaseMessage = holder ? "You’re running this tasting." : leaseError || "You are watching this tasting.";
  const phaseAnnouncement = `${getHostPhaseAnnouncement(event.phase, current?.reveal_title ?? null)} Conductor stage: ${getConductorStage(conductorStage).label}.`;
  const optionalAction = event.phase === "trivia"
    ? triviaClosed
      ? { label:"Return from trivia", command:"return_to_tasting" as EventCommand }
      : { label:"Close trivia", command:"close_trivia" as EventCommand }
    : conductorStage === "discuss" && currentTriviaProgress.hasNext
      ? { label:currentTriviaProgress.total > 1 ? `Open trivia ${currentTriviaProgress.nextNumber} of ${currentTriviaProgress.total}` : "Open optional trivia", command:"open_trivia" as EventCommand }
      : null;
  const breakoutActive=breakoutMetrics.active||Boolean(event.current_breakout_session_id);
  const peopleFirst=liveAttentionOrder(conductorStage)==="people-first";
  const hostVideo=event.location_mode === "remote" && ["scheduled", "live"].includes(event.status) && event.phase !== "ended"
    ? <AgoraVideoRoom eventId={event.id} displayName={userName} presentation="host" emphasis={getConductorStage(conductorStage).video} />
    : null;

  return <main className="live-shell" id="main-content">
    <div className="live-topbar"><Brand compact /><div className="live-topbar-event"><strong>{event.title}</strong><div>{new Date(event.starts_at).toLocaleString("en-CA",{dateStyle:"medium",timeStyle:"short"})}</div></div><span className="spacer"/><span className="chip chip-live live-topbar-stage">{getConductorStage(conductorStage).label}</span><span className="live-topbar-phase"><StatusChip value={event.phase}/></span><span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{phaseAnnouncement}</span><span className={`chip live-topbar-recovery ${recoveryView.tone === "success" ? "chip-success" : "chip-warning"}`}>{recoveryView.label}</span><span className="chip live-topbar-presence">{presence} staff device{presence===1?"":"s"}</span><Link className="live-console-exit" href={`/admin/events/${event.id}`} prefetch={false} aria-label="Exit the live console and return to event setup" title="Exit console without ending the tasting"><span aria-hidden="true">×</span><span>Exit console</span></Link></div>
    <div className={`notice ${holder?"success":""}`} style={{borderRadius:0}}><span role="status" aria-live="polite" aria-atomic="true">{leaseMessage}</span>{canTakeControl&&<button className="btn btn-secondary" style={{marginLeft:12}} disabled={busy} onClick={()=>takeControl(forceTakeover)}>{forceTakeover ? "Claim host control" : "Take control"}</button>}</div>
    {!consoleCurrent&&<div className={`notice ${recoveryView.tone === "error" ? "error" : ""}`} role="status" aria-live="assertive"><strong>{recoveryView.message}</strong> Controls will return after the current room state is confirmed.</div>}
    {consoleCurrent&&recoveryNotice&&<div className="notice success" role="status" aria-live="polite">You’re back. Nothing changed for your guests.</div>}
    {error&&<div className="notice error" role="alert">{error.message} {error.detail}</div>}
    <LiveCommunication eventId={event.id} presentation="host" currentTeaId={event.current_flight_item_id} participantCount={active.length + 1} emphasis={hostCheers?"quiet":getConductorStage(conductorStage).communication} />
    {event.status==="live"&&<HostCheersControl key={hostCheers?.id??conductorStage} eventId={event.id} initialSnapshot={hostCheers} stage={conductorStage} busy={busy} enabled={consoleCurrent&&holder&&!breakoutActive} onCommand={command}/>}
    {event.status==="live"&&<HostLiveRewardsControl snapshot={hostRewards} participants={participants} busy={busy} enabled={consoleCurrent&&holder} onCommand={command}/>}
    <div className={`live-main conductor-host-stage conductor-stage-${conductorStage}`}>{peopleFirst&&hostVideo}<div className="row" style={{marginBottom:16,overflowX:"auto",flexWrap:"nowrap"}}>{flight.map(item=><div key={item.id} className={`chip ${item.id===event.current_flight_item_id?"chip-live":""}`}>{item.position}. {item.reveal_title}</div>)}</div>
      {event.status==="live"&&<HostLivingTastingMap eventId={event.id} stage={conductorStage} busy={busy} enabled={consoleCurrent&&holder&&!breakoutActive} onCommand={command}/>}
      {event.status==="live"&&<HostConversationPrompts eventId={event.id} busy={busy} enabled={consoleCurrent&&holder} onCommand={command}/>}
      {event.location_mode==="remote"&&event.status==="live"&&event.phase!=="ended"&&<HostBreakoutPanel stage={conductorStage} metrics={breakoutMetrics} discoveryBoard={discoveryBoard} teaName={current?.tea?.name??current?.reveal_title??"Current tea"} participantCount={active.length} now={currentTime} busy={busy} enabled={consoleCurrent&&holder} onCommand={command}/>}
      {event.status==="live"&&conductorStage==="reveal"&&<HostGroupRevealPanel snapshot={groupReveal} teaName={current?.tea?.name??current?.reveal_title??"Current tea"} producerNote={[current?.tea?.producer?`Producer: ${current.tea.producer}`:null,current?.reveal_description].filter(Boolean).join(" · ")||null} busy={busy} enabled={consoleCurrent&&holder} onCommand={command}/>}
      <div className="live-grid"><section className="card">{event.phase==="lobby"?<Lobby event={event} flight={flight} active={active.length}/>:event.phase==="ended"?<Ended event={event}/>:<CurrentPhase event={event} brew={currentBrew} stage={conductorStage} current={current} trivia={currentTrivia} triviaClosed={triviaClosed} remaining={remaining} participants={active} metrics={conductorMetrics} triviaNumber={currentTriviaProgress.currentNumber} triviaTotal={currentTriviaProgress.total}/>}</section>
      <aside className="card" style={{position:"sticky",top:80}}><div className="card-header"><h2 className="card-title">The room</h2><span className="chip chip-success">{active.length} / {event.capacity}</span></div><div className="stack" style={{gap:8}}>{participants.map(p=><div className="row" key={p.id} style={{borderBottom:"1px solid var(--vf-line)",paddingBottom:8}}><div><strong>{p.display_name}</strong><div className="help">{p.status} · {freshness(p.last_seen_at,currentTime)}</div></div><span className="spacer"/><span aria-hidden="true" style={{color:isActiveRoomParticipant(p,now)?"var(--vf-forest)":"var(--vf-gold)"}}>●</span></div>)}</div><div className="card-footer"><button className="btn btn-secondary" onClick={copyInvite}>Copy invite</button><Link className="btn btn-secondary" href={`/admin/events/${event.id}`} prefetch={false}>Event setup</Link></div></aside></div>
      {!peopleFirst&&hostVideo}
    </div>
    {event.phase==="ended"?<footer className="command-rail"><div className="command-inner"><Link className="btn btn-primary btn-attention" href={`/admin/events/${event.id}/results`} prefetch={false}>See what we discovered</Link></div></footer>:<HostConductorRail key={`${conductorStage}-${currentBrew?.id??"none"}`} event={event} teaNumber={event.current_flight_item_id?current?.position??null:null} teaTitle={event.current_flight_item_id?current?.reveal_title??null:null} nextTeaTitle={nextTea?.reveal_title??null} brewSeconds={current?.steep_seconds??0} brew={currentBrew} metrics={conductorMetrics} now={now??0} busy={busy} enabled={consoleCurrent&&holder&&!breakoutActive} watchingLabel={breakoutActive?"Tasting tables open — stage held":!consoleCurrent?"Reconnecting — controls paused":`Watching — ${lease?.holder_user_id?"another host has control":"no active control"}`} optionalAction={optionalAction} onCommand={command} onEnd={()=>{if(confirm("End this tasting? This tasting can’t be reopened. Your guests’ live screens will close. Their recap stays available."))void command("end_session")}}/>}
  </main>;
}

function Lobby({event,flight,active}:{event:EventState;flight:Flight[];active:number}){return <><p className="eyebrow">Pre-session</p><h1 className="page-title">The room is ready.</h1><div className="grid grid-3" style={{marginTop:20}}><div className="card"><strong className="display" style={{fontSize:36}}>{flight.length}</strong><p>teas</p></div><div className="card"><strong className="display" style={{fontSize:36}}>{active}</strong><p>joined</p></div><div className="card"><strong className="display" style={{fontSize:36}}>{event.capacity}</strong><p>capacity</p></div></div>{event.location_mode === "remote" && <div className="notice success" style={{marginTop:16}}>Join the Vintage Fork video room above, check your camera and microphone, then open the tasting.</div>}</>}
function CurrentPhase({event,brew,stage,current,trivia,triviaClosed,remaining,metrics,triviaNumber,triviaTotal}:{event:EventState;brew:SharedBrew|null;stage:ConductorStage;current:Flight|null;trivia:Trivia|null;triviaClosed:boolean;remaining:number;participants:Participant[];metrics:ConductorMetrics;triviaNumber:number;triviaTotal:number}){
  if(!current)return <div className="empty-state"><h2>No tea is selected.</h2></div>;
  const definition=getConductorStage(stage);
  return <>
    <p className="eyebrow">Tea {current.position} · {definition.label}{stage==="brew"?` · Infusion ${brew?.infusion_number??1}`:""}</p>
    <h1 className="page-title">{current.reveal_title}</h1><p className="page-lede">{definition.instruction}</p>
    <div className="conductor-host-confidence"><div><strong>{metrics.connected} / {metrics.participants}</strong><span>connected</span></div><div><strong>{stage==="brew"?metrics.pouring:metrics.observed}</strong><span>{stage==="brew"?"pouring":"observations"}</span></div><div><strong>{stage==="brew"?metrics.decanted:metrics.completed}</strong><span>{stage==="brew"?"decanted":"tea complete"}</span></div></div>
    {event.conductor_paused_at&&<div className="notice"><strong>Infusion paused.</strong> Video and conversation remain live.</div>}
    <div className="section-label"><span>Tea context</span></div><p>{current.reveal_description}</p>
    <div className="grid grid-3"><div className="card"><strong>{current.temperature_c??"—"}°C</strong><p className="help">Water</p></div><div className="card"><strong>{current.leaf_grams??"—"}g</strong><p className="help">Leaf</p></div><div className="card"><strong>{current.water_ml??"—"}ml</strong><p className="help">Vessel</p></div></div>
    <p style={{marginTop:12}}>{current.brewing_instructions}</p>
    {stage==="brew"&&(brew?<SharedBrewingTimer brew={brew} compact />:<div className="timer-ring" role="timer" aria-live="off" aria-label={`Brewing timer, ${formatClock(remaining)} remaining`}><div><div className="timer-readout">{formatClock(remaining)}</div><small>connecting shared clock</small></div></div>)}
    {event.phase==="trivia"&&trivia&&<section className="card" style={{marginTop:16}}><p className="eyebrow">Optional trivia · Question {triviaNumber} of {triviaTotal}</p><h2 className="card-title">{trivia.question}</h2><div className="stack">{trivia.options.map((x,i)=><div className="row" key={x}><span>{String.fromCharCode(65+i)}.</span><span>{x}</span>{triviaClosed&&i===trivia.correct_index&&<span className="chip chip-success">Correct</span>}</div>)}</div></section>}
  </>;
}
function Ended({event}:{event:EventState}){return <div className="empty-state"><h1>This tasting has ended.</h1><p>Guest live screens are closed. Their recaps and customer histories remain available.</p><div className="row" style={{ justifyContent:"center" }}><Link className="btn btn-primary btn-attention" href={`/admin/events/${event.id}/results`} prefetch={false}>See what we discovered</Link></div></div>}
function triviaList(flight:Flight|null):Trivia[]{if(!flight?.trivia)return[];return Array.isArray(flight.trivia)?flight.trivia:[flight.trivia]}
function freshness(value:string|null,now:number){if(!value)return"not connected";const seconds=Math.floor((now-new Date(value).getTime())/1000);return seconds<10?"with us":seconds<45?`${seconds}s ago`:"quiet"}
function formatClock(ms:number){const total=Math.max(0,Math.ceil(ms/1000));return`${Math.floor(total/60)}:${String(total%60).padStart(2,"0")}`}
