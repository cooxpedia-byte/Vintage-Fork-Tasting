import "server-only";

import type {SupabaseClient} from "@supabase/supabase-js";
import {
  LIVING_MAP_PROMPTS,
  livingMapElapsedMs,
  livingMapGroupVisible,
  livingMapPatterns,
  livingMapReplayManifest,
  projectLivingMap,
  type LivingMapFamily,
  type LivingMapLayer,
  type LivingMapObservationEvent,
  type LivingMapReplayEvent,
  type LivingMapSession,
  type LivingMapSnapshot
} from "@/lib/living-tasting-map";

type SessionRow={
  id:string;event_id:string;event_flight_item_id:string;status:LivingMapSession["status"];duration_seconds:number;
  visibility_mode:LivingMapSession["visibilityMode"];custom_notes_enabled:boolean;started_at:string|null;paused_at:string|null;
  accumulated_pause_ms:number;frozen_at:string|null;replay_started_at:string|null;replay_paused_at:string|null;
  replay_position_ms:number;replay_duration_seconds:number;version:number;
};

type ObservationRow={
  id:string;participant_id:string;layer:LivingMapLayer;flavor_key:string;flavor_label:string;family:LivingMapFamily;
  is_custom:boolean;intensity:number;action:LivingMapObservationEvent["action"];elapsed_ms:number;server_time:string;
};

export async function loadLivingMapSnapshot({admin,eventId,eventFlightItemId,participantId=null,now=Date.now()}:{
  admin:SupabaseClient;eventId:string;eventFlightItemId:string|null;participantId?:string|null;now?:number;
}):Promise<LivingMapSnapshot|null>{
  if(!eventFlightItemId)return null;
  const sessionResult=await admin.from("living_tasting_map_sessions")
    .select("id,event_id,event_flight_item_id,status,duration_seconds,visibility_mode,custom_notes_enabled,started_at,paused_at,accumulated_pause_ms,frozen_at,replay_started_at,replay_paused_at,replay_position_ms,replay_duration_seconds,version")
    .eq("event_id",eventId).eq("event_flight_item_id",eventFlightItemId).maybeSingle();
  if(sessionResult.error)throw sessionResult.error;
  if(!sessionResult.data)return null;
  const row=sessionResult.data as SessionRow;
  const session=mapSession(row);
  const [eventsResult,participantsResult,moderationResult,fingerprintResult]=await Promise.all([
    admin.from("living_tasting_map_observation_events").select("id,participant_id,layer,flavor_key,flavor_label,family,is_custom,intensity,action,elapsed_ms,server_time").eq("session_id",session.id).order("elapsed_ms").order("server_time").order("id"),
    admin.from("participants").select("id").eq("event_id",eventId).in("status",["registered","waiting","admitted","active"]),
    admin.from("living_tasting_map_moderation_actions").select("flavor_key,action,id").eq("session_id",session.id).order("id"),
    admin.from("living_tasting_map_fingerprints").select("replay_manifest,generated_patterns").eq("session_id",session.id).maybeSingle()
  ]);
  for(const result of[eventsResult,participantsResult,moderationResult,fingerprintResult])if(result.error)throw result.error;
  const events=(eventsResult.data??[]).map(mapObservation);
  const hiddenState=new Map<string,string>();
  for(const action of moderationResult.data??[])hiddenState.set(String(action.flavor_key),String(action.action));
  const hiddenKeys=[...hiddenState].filter(([,action])=>action==="hide").map(([key])=>key);
  const elapsedMs=livingMapElapsedMs(session,now);
  const projection=projectLivingMap(events,participantsResult.data?.length??0,elapsedMs,hiddenKeys);
  const viewerObservations=participantId?currentViewerObservations(events,participantId,elapsedMs,hiddenKeys):[];
  const manifest=fingerprintResult.data?.replay_manifest as {events?:unknown;promptMarkersMs?:unknown}|null;
  const replayEvents=Array.isArray(manifest?.events)?manifest.events as LivingMapReplayEvent[]:[];
  const replay=session.status==="frozen"||session.status==="replaying"||session.status==="committed"
    ?{events:replayEvents,promptMarkersMs:Array.isArray(manifest?.promptMarkersMs)?manifest.promptMarkersMs.filter((value):value is number=>typeof value==="number"):LIVING_MAP_PROMPTS.map(prompt=>prompt.atMs)}
    :null;
  return{
    session,projection,viewerObservations,
    generatedPatterns:Array.isArray(fingerprintResult.data?.generated_patterns)?fingerprintResult.data.generated_patterns.filter((value):value is string=>typeof value==="string"):[],
    replay,groupVisible:livingMapGroupVisible(session,elapsedMs)
  };
}

export async function refreshLivingMapProjection({admin,eventId,eventFlightItemId,commitFingerprint=false}:{
  admin:SupabaseClient;eventId:string;eventFlightItemId:string|null;commitFingerprint?:boolean;
}){
  const snapshot=await loadLivingMapSnapshot({admin,eventId,eventFlightItemId});
  if(!snapshot)return null;
  const countResult=await admin.from("living_tasting_map_observation_events").select("id",{count:"exact",head:true}).eq("session_id",snapshot.session.id);
  if(countResult.error)throw countResult.error;
  const insertResult=await admin.from("living_tasting_map_snapshots").insert({
    session_id:snapshot.session.id,event_id:eventId,event_flight_item_id:eventFlightItemId,
    elapsed_ms:Math.round(snapshot.projection.atMs),aggregate_payload:snapshot.projection,source_event_count:countResult.count??0,
    is_prompt_marker:LIVING_MAP_PROMPTS.some(prompt=>Math.abs(prompt.atMs-snapshot.projection.atMs)<=1500),projector_version:1
  });
  if(insertResult.error)throw insertResult.error;
  if(commitFingerprint){
    const eventsResult=await admin.from("living_tasting_map_observation_events").select("id,participant_id,layer,flavor_key,flavor_label,family,is_custom,intensity,action,elapsed_ms,server_time").eq("session_id",snapshot.session.id).order("elapsed_ms").order("server_time").order("id");
    if(eventsResult.error)throw eventsResult.error;
    const events=(eventsResult.data??[]).map(mapObservation);
    const patterns=livingMapPatterns(events,snapshot.projection);
    const existing=await admin.from("living_tasting_map_fingerprints").select("version,committed_at").eq("session_id",snapshot.session.id).maybeSingle();
    if(existing.error)throw existing.error;
    if(existing.data?.committed_at)throw new Error("living_map_fingerprint_committed");
    const upsert=await admin.from("living_tasting_map_fingerprints").upsert({
      session_id:snapshot.session.id,event_id:eventId,event_flight_item_id:eventFlightItemId,
      final_snapshot:snapshot.projection,
      replay_manifest:{schemaVersion:1,durationSeconds:snapshot.session.durationSeconds,promptMarkersMs:LIVING_MAP_PROMPTS.map(prompt=>prompt.atMs),events:livingMapReplayManifest(events)},
      generated_patterns:patterns,version:Number(existing.data?.version??0)+1,committed_at:null,updated_at:new Date().toISOString()
    },{onConflict:"session_id"});
    if(upsert.error)throw upsert.error;
    return await loadLivingMapSnapshot({admin,eventId,eventFlightItemId});
  }
  return snapshot;
}

function mapSession(row:SessionRow):LivingMapSession{return{
  id:row.id,eventId:row.event_id,eventFlightItemId:row.event_flight_item_id,status:row.status,durationSeconds:Number(row.duration_seconds),
  visibilityMode:row.visibility_mode,customNotesEnabled:Boolean(row.custom_notes_enabled),startedAt:row.started_at,pausedAt:row.paused_at,
  accumulatedPauseMs:Number(row.accumulated_pause_ms),frozenAt:row.frozen_at,replayStartedAt:row.replay_started_at,replayPausedAt:row.replay_paused_at,
  replayPositionMs:Number(row.replay_position_ms),replayDurationSeconds:Number(row.replay_duration_seconds),version:Number(row.version)
};}

function mapObservation(row:ObservationRow):LivingMapObservationEvent{return{
  id:row.id,participantKey:row.participant_id,layer:row.layer,flavorKey:row.flavor_key,flavorLabel:row.flavor_label,
  family:row.family,isCustom:Boolean(row.is_custom),intensity:Number(row.intensity),action:row.action,elapsedMs:Number(row.elapsed_ms),serverTime:row.server_time
};}

function currentViewerObservations(events:LivingMapObservationEvent[],participantId:string,atMs:number,hiddenKeys:string[]){
  const hidden=new Set(hiddenKeys);const latest=new Map<string,LivingMapObservationEvent>();
  for(const event of events.filter(candidate=>candidate.participantKey===participantId&&candidate.elapsedMs<=atMs).sort((a,b)=>a.elapsedMs-b.elapsedMs||a.serverTime.localeCompare(b.serverTime))){
    const key=`${event.layer}:${event.flavorKey}`;
    if(event.action==="remove"||hidden.has(event.flavorKey))latest.delete(key);else latest.set(key,event);
  }
  return[...latest.values()].map(({layer,flavorKey,flavorLabel,family,isCustom,intensity})=>({layer,flavorKey,flavorLabel,family,isCustom,intensity}));
}
