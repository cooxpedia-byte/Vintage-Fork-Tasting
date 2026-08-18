import {NextResponse} from "next/server";
import {z} from "zod";
import {createAdminClient} from "@/lib/supabase/admin";
import {resolveCommunicationContext} from "@/lib/live-communication-server";
import {logger} from "@/lib/logger";
import {findTeaDescriptor} from "@/lib/tea-lab/descriptors";
import {
  LIVING_MAP_FAMILIES,customFlavorTextIssue,livingMapElapsedMs,livingMapFamily,livingMapFlavorKey
} from "@/lib/living-tasting-map";
import {loadLivingMapSnapshot,refreshLivingMapProjection} from "@/lib/living-tasting-map-server";

const recordSchema=z.object({
  action:z.literal("record_observation"),operation:z.enum(["add","update","remove"]),layer:z.enum(["aroma","taste"]),
  flavorLabel:z.string().trim().min(1).max(80),family:z.enum(LIVING_MAP_FAMILIES),isCustom:z.boolean(),intensity:z.number().int().min(0).max(100),
  clientSequence:z.number().int().nonnegative(),clientId:z.string().uuid()
});
const moderateSchema=z.object({
  action:z.literal("moderate_flavor"),operation:z.enum(["hide","restore"]),flavorKey:z.string().trim().min(1).max(80),reason:z.string().trim().max(240).optional()
});
const actionSchema=z.discriminatedUnion("action",[recordSchema,moderateSchema]);

export async function GET(request:Request,{params}:{params:Promise<{eventId:string}>}){
  const{eventId}=await params;
  try{
    const context=await resolveCommunicationContext(request,eventId);
    if(!context)return json({error:"A current tasting seat or staff sign-in is required."},401);
    const snapshot=await loadLivingMapSnapshot({admin:createAdminClient(),eventId,eventFlightItemId:context.event.current_flight_item_id,participantId:context.viewer.kind==="guest"?context.viewer.id:null});
    return json({snapshot});
  }catch(error){logger.error("living_map_load_failed",error,{eventId});return json({error:"The Living Tasting Map could not be loaded."},500)}
}

export async function POST(request:Request,{params}:{params:Promise<{eventId:string}>}){
  const{eventId}=await params;
  try{
    const context=await resolveCommunicationContext(request,eventId);
    if(!context)return json({error:"A current tasting seat or staff sign-in is required."},401);
    const parsed=actionSchema.safeParse(await request.json().catch(()=>null));
    if(!parsed.success)return json({error:parsed.error.issues[0]?.message??"Invalid map update."},400);
    const admin=createAdminClient();
    if(parsed.data.action==="moderate_flavor"){
      if(!context.viewer.canModerate)return json({error:"Host access is required."},403);
      const session=await currentSession(admin,eventId,context.event.current_flight_item_id);
      if(!session)return json({error:"The map is not open for this tea."},409);
      const insert=await admin.from("living_tasting_map_moderation_actions").insert({session_id:session.id,event_id:eventId,flavor_key:parsed.data.flavorKey,action:parsed.data.operation,reason:parsed.data.reason??null,actor_user_id:context.viewer.userId});
      if(insert.error)throw insert.error;
      const snapshot=await refreshLivingMapProjection({admin,eventId,eventFlightItemId:context.event.current_flight_item_id});
      return json({snapshot});
    }
    if(context.viewer.kind!=="guest")return json({error:"Only tasting participants can add observations."},403);
    const session=await currentSession(admin,eventId,context.event.current_flight_item_id);
    if(!session)return json({error:"The Living Map will open with the host."},409);
    if(session.status!=="live")return json({error:session.status==="paused"?"The map is paused. Your current observations are safe.":"This map is no longer accepting changes."},409);
    const sessionShape={id:session.id,eventId:eventId,eventFlightItemId:session.event_flight_item_id,status:session.status,durationSeconds:Number(session.duration_seconds),visibilityMode:session.visibility_mode,customNotesEnabled:Boolean(session.custom_notes_enabled),startedAt:session.started_at,pausedAt:session.paused_at,accumulatedPauseMs:Number(session.accumulated_pause_ms),frozenAt:session.frozen_at,replayStartedAt:session.replay_started_at,replayPausedAt:session.replay_paused_at,replayPositionMs:Number(session.replay_position_ms),replayDurationSeconds:Number(session.replay_duration_seconds),version:Number(session.version)} as const;
    const elapsedMs=Math.round(livingMapElapsedMs(sessionShape,Date.now()));
    if(elapsedMs>=sessionShape.durationSeconds*1000)return json({error:"The twelve-minute portrait is ready for the host to freeze."},409);
    const recent=await admin.from("living_tasting_map_observation_events").select("id",{count:"exact",head:true}).eq("session_id",session.id).eq("participant_id",context.viewer.id).gte("server_time",new Date(Date.now()-60_000).toISOString());
    if(recent.error)throw recent.error;
    if((recent.count??0)>=120)return json({error:"Give the map a moment, then continue adjusting your observation."},429);
    const descriptor=findTeaDescriptor(parsed.data.flavorLabel);
    if(parsed.data.isCustom){
      if(!session.custom_notes_enabled)return json({error:"This round is using the shared vocabulary only."},409);
      const issue=customFlavorTextIssue(parsed.data.flavorLabel);if(issue)return json({error:issue},400);
    }else if(!descriptor)return json({error:"Choose a note from the shared vocabulary."},400);
    const flavorLabel=descriptor?.label??parsed.data.flavorLabel.replace(/\s+/g," ").trim();
    const flavorKey=livingMapFlavorKey(flavorLabel);
    const family=descriptor?livingMapFamily(descriptor.label):parsed.data.family;
    const insert=await admin.from("living_tasting_map_observation_events").upsert({
      session_id:session.id,event_id:eventId,event_flight_item_id:session.event_flight_item_id,participant_id:context.viewer.id,
      layer:parsed.data.layer,flavor_key:flavorKey,flavor_label:flavorLabel,family,is_custom:parsed.data.isCustom,
      intensity:parsed.data.intensity,action:parsed.data.operation,elapsed_ms:elapsedMs,client_sequence:parsed.data.clientSequence,client_id:parsed.data.clientId
    },{onConflict:"session_id,participant_id,client_id",ignoreDuplicates:true});
    if(insert.error)throw insert.error;
    await refreshLivingMapProjection({admin,eventId,eventFlightItemId:session.event_flight_item_id});
    const observations=await ownObservations(admin,session.id,context.viewer.id);
    await syncLegacyResponse(admin,context.viewer.id,session.event_flight_item_id,observations);
    const snapshot=await loadLivingMapSnapshot({admin,eventId,eventFlightItemId:session.event_flight_item_id,participantId:context.viewer.id});
    return json({snapshot});
  }catch(error){logger.error("living_map_action_failed",error,{eventId});return json({error:"That observation could not be added. Your cup and the room are unchanged."},500)}
}

async function currentSession(admin:ReturnType<typeof createAdminClient>,eventId:string,eventFlightItemId:string|null){
  if(!eventFlightItemId)return null;
  const result=await admin.from("living_tasting_map_sessions").select("*").eq("event_id",eventId).eq("event_flight_item_id",eventFlightItemId).maybeSingle();
  if(result.error)throw result.error;return result.data;
}

async function ownObservations(admin:ReturnType<typeof createAdminClient>,sessionId:string,participantId:string){
  const result=await admin.from("living_tasting_map_observation_events").select("layer,flavor_key,flavor_label,family,is_custom,intensity,action,elapsed_ms,server_time").eq("session_id",sessionId).eq("participant_id",participantId).order("elapsed_ms").order("server_time");
  if(result.error)throw result.error;const latest=new Map<string,(typeof result.data)[number]>();
  for(const event of result.data??[]){const key=`${event.layer}:${event.flavor_key}`;if(event.action==="remove")latest.delete(key);else latest.set(key,event)}
  return[...latest.values()].map(event=>({layer:event.layer,flavorKey:event.flavor_key,flavorLabel:event.flavor_label,family:event.family,isCustom:event.is_custom,intensity:event.intensity}));
}

async function syncLegacyResponse(admin:ReturnType<typeof createAdminClient>,participantId:string,eventFlightItemId:string,observations:Array<{layer:string;flavorLabel:string;intensity:number}>){
  const aroma=observations.filter(item=>item.layer==="aroma");const taste=observations.filter(item=>item.layer==="taste");
  const level=(items:typeof aroma)=>{if(!items.length)return null;const average=items.reduce((sum,item)=>sum+item.intensity,0)/items.length;return average<50?"subtle":average<80?"clear":"dominant"};
  const result=await admin.from("tea_responses").upsert({participant_id:participantId,event_flight_item_id:eventFlightItemId,
    aroma_descriptors:aroma.map(item=>item.flavorLabel),aroma_intensity:level(aroma),descriptors:taste.map(item=>item.flavorLabel),intensity:level(taste)
  },{onConflict:"participant_id,event_flight_item_id"});
  if(result.error)throw result.error;
}

function json(body:unknown,status=200){return NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store, max-age=0"}})}
