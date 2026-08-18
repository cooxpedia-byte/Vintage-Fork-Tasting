import type {SupabaseClient} from "@supabase/supabase-js";
import {generateDiscoverySuggestions,type StructuredDiscoveryObservation,type StructuredDiscoveryRevision} from "@/lib/discovery-cards";

type ServerClient=SupabaseClient;

export async function refreshDiscoveryCardsForSession(admin:ServerClient,sessionId:string){
  const roomsResult=await admin.from("event_breakout_rooms").select("id").eq("session_id",sessionId);
  if(roomsResult.error)throw roomsResult.error;
  await Promise.all((roomsResult.data??[]).map(room=>refreshRoomDiscoveryCard(admin,room.id)));
}

export async function refreshRoomDiscoveryCard(admin:ServerClient,breakoutRoomId:string){
  const [cardResult,roomResult,membersResult]=await Promise.all([
    admin.from("room_discovery_cards").select("id,event_flight_item_id,locked_at,source_version").eq("breakout_room_id",breakoutRoomId).maybeSingle(),
    admin.from("event_breakout_rooms").select("id,session_id").eq("id",breakoutRoomId).maybeSingle(),
    admin.from("event_breakout_members").select("participant_id").eq("breakout_room_id",breakoutRoomId)
  ]);
  if(cardResult.error)throw cardResult.error;
  if(roomResult.error)throw roomResult.error;
  if(membersResult.error)throw membersResult.error;
  const card=cardResult.data;
  const participantIds=(membersResult.data??[]).map(member=>member.participant_id);
  if(!card||card.locked_at||!roomResult.data||!participantIds.length)return;
  const [responsesResult,revisionsResult]=await Promise.all([
    admin.from("tea_responses").select("participant_id,first_impression,descriptors,intensity").eq("event_flight_item_id",card.event_flight_item_id).in("participant_id",participantIds),
    admin.from("tea_response_revisions").select("participant_id,created_at,observation").eq("breakout_room_id",breakoutRoomId).eq("event_flight_item_id",card.event_flight_item_id).order("created_at")
  ]);
  if(responsesResult.error)throw responsesResult.error;
  if(revisionsResult.error)throw revisionsResult.error;
  const observations:StructuredDiscoveryObservation[]=(responsesResult.data??[]).map(response=>({
    participantId:response.participant_id,
    firstImpression:typeof response.first_impression==="string"?response.first_impression:null,
    descriptors:Array.isArray(response.descriptors)?response.descriptors.filter((value):value is string=>typeof value==="string"):[],
    intensity:typeof response.intensity==="string"?response.intensity:null
  }));
  const revisions:StructuredDiscoveryRevision[]=(revisionsResult.data??[]).map(revision=>{
    const observation=revision.observation&&typeof revision.observation==="object"&&!Array.isArray(revision.observation)
      ? revision.observation as Record<string,unknown>
      : {};
    return{
      participantId:revision.participant_id,
      createdAt:revision.created_at,
      firstImpression:typeof observation.firstImpression==="string"?observation.firstImpression:null,
      descriptors:Array.isArray(observation.descriptors)?observation.descriptors.filter((value):value is string=>typeof value==="string"):[],
      intensity:typeof observation.intensity==="string"?observation.intensity:null
    };
  });
  const suggestions=generateDiscoverySuggestions(observations,revisions);
  if(suggestions.length){
    const itemResult=await admin.from("room_discovery_card_items").upsert(suggestions.map(suggestion=>({
      card_id:card.id,category:suggestion.category,item_text:suggestion.text,normalized_key:suggestion.normalizedKey,
      source:"structured",prevalence_count:suggestion.prevalenceCount,prevalence_total:suggestion.prevalenceTotal,
      attribution_participant_id:suggestion.attributionParticipantId
    })),{onConflict:"card_id,category,normalized_key",ignoreDuplicates:true});
    if(itemResult.error)throw itemResult.error;
  }
  const updateResult=await admin.from("room_discovery_cards").update({
    participant_ids:participantIds,source_version:Number(card.source_version??0)+1,updated_at:new Date().toISOString()
  }).eq("id",card.id).is("locked_at",null);
  if(updateResult.error)throw updateResult.error;
}
