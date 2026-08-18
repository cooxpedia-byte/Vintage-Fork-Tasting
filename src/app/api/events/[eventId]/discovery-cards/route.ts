import {NextResponse} from "next/server";
import {z} from "zod";
import {discoveryKey} from "@/lib/discovery-cards";
import {requireParticipant} from "@/lib/guest-token";
import {logger} from "@/lib/logger";
import {createAdminClient} from "@/lib/supabase/admin";

const nonJudgmentalText=z.string().trim().min(1).max(120).refine(value=>!/(^|\s)(correct|wrong|outlier|missed|best)(\s|$)/i.test(value),"Use descriptive, non-judgmental language.");
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("add_item"),cardId:z.string().uuid(),category:z.enum(["shared","unique","changed","contrasting"]),text:nonJudgmentalText}),
  z.object({action:z.literal("remove_item"),cardId:z.string().uuid(),itemId:z.string().uuid()}),
  z.object({action:z.literal("update_details"),cardId:z.string().uuid(),curiosity:z.string().trim().max(240),roomQuote:z.string().trim().max(240),quoteAttributed:z.boolean()}),
  z.object({action:z.literal("volunteer"),cardId:z.string().uuid()}),
  z.object({action:z.literal("withdraw"),cardId:z.string().uuid()}),
  z.object({action:z.literal("accept_invite"),cardId:z.string().uuid()}),
  z.object({action:z.literal("pass_invite"),cardId:z.string().uuid()})
]);

export async function POST(request:Request,{params}:{params:Promise<{eventId:string}>}){
  const {eventId}=await params;
  try{
    const participant=await requireParticipant(eventId);
    if(!participant||participant.status==="removed")return json({error:"Your current tasting seat is required."},401);
    const parsed=schema.safeParse(await request.json().catch(()=>null));
    if(!parsed.success)return json({error:parsed.error.issues[0]?.message??"Invalid discovery-card action."},400);
    const admin=createAdminClient();
    const action=parsed.data;
    const cardResult=await admin.from("room_discovery_cards").select("id,breakout_room_id,session_id,event_id,participant_ids,locked_at,spokesperson_participant_id,spokesperson_state")
      .eq("id",action.cardId).eq("event_id",eventId).maybeSingle();
    if(cardResult.error)throw cardResult.error;
    const card=cardResult.data;
    if(!card)return json({error:"That table card is no longer available."},404);
    const [memberResult,sessionResult]=await Promise.all([
      admin.from("event_breakout_members").select("status").eq("session_id",card.session_id).eq("breakout_room_id",card.breakout_room_id).eq("participant_id",participant.id).maybeSingle(),
      admin.from("event_breakout_sessions").select("status").eq("id",card.session_id).maybeSingle()
    ]);
    if(memberResult.error)throw memberResult.error;
    if(sessionResult.error)throw sessionResult.error;
    if(!memberResult.data||!sessionResult.data)return json({error:"Only members of this table can change its card."},403);
    const now=new Date().toISOString();
    const editable=!card.locked_at&&sessionResult.data.status==="active"&&!["returned","failed","stayed_main"].includes(memberResult.data.status);

    if(action.action==="add_item"){
      if(!editable)return json({error:"This card locked when the table returned."},409);
      const normalizedKey=`participant-${discoveryKey(action.text)}`;
      if(normalizedKey==="participant-")return json({error:"Add a short discovery first."},400);
      const existingResult=await admin.from("room_discovery_card_items").select("id").eq("card_id",card.id).eq("category",action.category).eq("normalized_key",normalizedKey).maybeSingle();
      if(existingResult.error)throw existingResult.error;
      const payload={item_text:action.text,source:"participant",prevalence_count:null,prevalence_total:Array.isArray(card.participant_ids)?card.participant_ids.length:0,created_by:participant.id,removed_by:null,removed_at:null,updated_at:now};
      const itemResult=existingResult.data
        ? await admin.from("room_discovery_card_items").update(payload).eq("id",existingResult.data.id)
        : await admin.from("room_discovery_card_items").insert({card_id:card.id,category:action.category,normalized_key:normalizedKey,...payload});
      if(itemResult.error)throw itemResult.error;
    }else if(action.action==="remove_item"){
      if(!editable)return json({error:"This card locked when the table returned."},409);
      const itemResult=await admin.from("room_discovery_card_items").update({removed_at:now,removed_by:participant.id,updated_at:now}).eq("id",action.itemId).eq("card_id",card.id);
      if(itemResult.error)throw itemResult.error;
    }else if(action.action==="update_details"){
      if(!editable)return json({error:"This card locked when the table returned."},409);
      if(action.quoteAttributed&&!action.roomQuote)return json({error:"Add the quote before choosing attribution."},400);
      const detailResult=await admin.from("room_discovery_cards").update({
        curiosity:action.curiosity||null,room_quote:action.roomQuote||null,room_quote_attributed:Boolean(action.roomQuote&&action.quoteAttributed),
        room_quote_participant_id:action.roomQuote&&action.quoteAttributed?participant.id:null,updated_at:now
      }).eq("id",card.id).is("locked_at",null);
      if(detailResult.error)throw detailResult.error;
    }else if(action.action==="volunteer"){
      if(!editable)return json({error:"Volunteer before the table returns."},409);
      if(card.spokesperson_participant_id&&card.spokesperson_participant_id!==participant.id&&!['passed','none'].includes(card.spokesperson_state))return json({error:"Someone at your table has already volunteered."},409);
      const volunteerResult=await admin.from("room_discovery_cards").update({spokesperson_participant_id:participant.id,spokesperson_state:"volunteered",updated_at:now}).eq("id",card.id).is("locked_at",null);
      if(volunteerResult.error)throw volunteerResult.error;
    }else if(action.action==="withdraw"){
      if(card.spokesperson_participant_id!==participant.id||!["volunteered","accepted"].includes(card.spokesperson_state))return json({error:"There is no active volunteer role to withdraw."},409);
      const withdrawResult=await admin.from("room_discovery_cards").update({spokesperson_participant_id:null,spokesperson_state:"none",updated_at:now}).eq("id",card.id);
      if(withdrawResult.error)throw withdrawResult.error;
    }else{
      if(card.spokesperson_participant_id!==participant.id||card.spokesperson_state!=="invited")return json({error:"That presenter invitation is no longer active."},409);
      const presenterResult=await admin.from("room_discovery_cards").update({spokesperson_state:action.action==="accept_invite"?"accepted":"passed",updated_at:now}).eq("id",card.id).eq("spokesperson_participant_id",participant.id).eq("spokesperson_state","invited");
      if(presenterResult.error)throw presenterResult.error;
    }
    return json({ok:true});
  }catch(error){
    logger.error("discovery_card_action_failed",error,{eventId});
    return json({error:"That table-card update could not be completed."},500);
  }
}

function json(body:unknown,status=200){return NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store, max-age=0"}})}
