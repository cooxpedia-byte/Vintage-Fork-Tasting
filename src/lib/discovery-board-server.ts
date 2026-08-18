import type {SupabaseClient} from "@supabase/supabase-js";
import type {DiscoveryBoardState,DiscoveryCard,DiscoveryCardItem,DiscoveryCategory,SpokespersonState} from "@/lib/discovery-cards";

export async function loadParticipantDiscoveryBoard({admin,eventId,eventFlightItemId,participantId}:{admin:SupabaseClient;eventId:string;eventFlightItemId:string|null;participantId:string}):Promise<DiscoveryBoardState|null>{
  if(!eventFlightItemId)return null;
  const sessionResult=await admin.from("event_breakout_sessions").select("id,status,event_flight_item_id,completed_at,created_at")
    .eq("event_id",eventId).eq("event_flight_item_id",eventFlightItemId).in("status",["active","returning","complete"])
    .order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(sessionResult.error)throw sessionResult.error;
  const session=sessionResult.data;
  if(!session)return null;
  const [roomsResult,cardsResult,membershipResult,presentationResult]=await Promise.all([
    admin.from("event_breakout_rooms").select("id,room_number,status").eq("session_id",session.id).order("room_number"),
    admin.from("room_discovery_cards").select("id,breakout_room_id,participant_ids,curiosity,room_quote,room_quote_attributed,spokesperson_participant_id,spokesperson_state,locked_at,source_version").eq("session_id",session.id),
    admin.from("event_breakout_members").select("breakout_room_id,status").eq("session_id",session.id).eq("participant_id",participantId).maybeSingle(),
    admin.from("event_discovery_presentations").select("open_card_ids,surfaced_curiosity_card_id").eq("breakout_session_id",session.id).maybeSingle()
  ]);
  if(roomsResult.error)throw roomsResult.error;
  if(cardsResult.error)throw cardsResult.error;
  if(membershipResult.error)throw membershipResult.error;
  if(presentationResult.error)throw presentationResult.error;
  const ownRoomId=membershipResult.data?.breakout_room_id??null;
  const visibleCardRows=session.status==="active"?(cardsResult.data??[]).filter(card=>card.breakout_room_id===ownRoomId):(cardsResult.data??[]);
  const cardIds=visibleCardRows.map(card=>card.id);
  const itemsResult=cardIds.length
    ? await admin.from("room_discovery_card_items").select("id,card_id,category,item_text,normalized_key,source,prevalence_count,prevalence_total").in("card_id",cardIds).is("removed_at",null).order("created_at")
    : {data:[],error:null};
  if(itemsResult.error)throw itemsResult.error;
  const rooms=new Map((roomsResult.data??[]).map(room=>[room.id,room]));
  const itemsByCard=new Map<string,DiscoveryCardItem[]>();
  for(const item of itemsResult.data??[]){
    const mapped:DiscoveryCardItem={
      id:item.id,category:item.category as DiscoveryCategory,text:item.item_text,normalizedKey:item.normalized_key,
      source:item.source as "structured"|"participant",prevalenceCount:item.prevalence_count,prevalenceTotal:item.prevalence_total
    };
    itemsByCard.set(item.card_id,[...(itemsByCard.get(item.card_id)??[]),mapped]);
  }
  const cards:DiscoveryCard[]=visibleCardRows.map(card=>{
    const items=itemsByCard.get(card.id)??[];
    return{
      id:card.id,breakoutRoomId:card.breakout_room_id,roomNumber:rooms.get(card.breakout_room_id)?.room_number??0,
      participantCount:Array.isArray(card.participant_ids)?card.participant_ids.length:0,
      shared:items.filter(item=>item.category==="shared"),unique:items.filter(item=>item.category==="unique"),
      changed:items.filter(item=>item.category==="changed"),contrasting:items.filter(item=>item.category==="contrasting"),
      curiosity:card.curiosity,roomQuote:card.room_quote,quoteAttributed:Boolean(card.room_quote_attributed),
      lockedAt:card.locked_at,sourceVersion:Number(card.source_version??0),
      hasSpokesperson:Boolean(card.spokesperson_participant_id)&&card.spokesperson_state!=="passed",
      spokespersonState:card.spokesperson_state as SpokespersonState
    };
  }).sort((left,right)=>left.roomNumber-right.roomNumber);
  const ownCard=cards.find(card=>card.breakoutRoomId===ownRoomId)??null;
  const ownCardRow=visibleCardRows.find(card=>card.id===ownCard?.id)??null;
  const cueState=ownCardRow?.spokesperson_participant_id===participantId&&["invited","accepted"].includes(ownCardRow.spokesperson_state)
    ? ownCardRow.spokesperson_state as "invited"|"accepted"
    : null;
  const talkingPoints=ownCard?[...ownCard.shared,...ownCard.unique,...ownCard.changed].slice(0,2).map(item=>item.text):[];
  if(ownCard?.curiosity&&talkingPoints.length<3)talkingPoints.push(ownCard.curiosity);
  return{
    session:{id:session.id,status:session.status as "active"|"returning"|"complete",eventFlightItemId:session.event_flight_item_id,completedAt:session.completed_at},
    cards,openCardIds:Array.isArray(presentationResult.data?.open_card_ids)?presentationResult.data.open_card_ids:[],
    surfacedCuriosityCardId:presentationResult.data?.surfaced_curiosity_card_id??null,
    ownCardId:ownCard?.id??null,
    canEditOwnCard:Boolean(ownCard&&!ownCard.lockedAt&&session.status==="active"&&!["returned","failed","stayed_main"].includes(membershipResult.data?.status??"")),
    isOwnSpokesperson:ownCardRow?.spokesperson_participant_id===participantId&&!["none","passed"].includes(ownCardRow.spokesperson_state),
    presenterCue:cueState&&ownCard?{cardId:ownCard.id,roomNumber:ownCard.roomNumber,state:cueState,talkingPoints}:null
  };
}
