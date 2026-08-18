import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireParticipant } from "@/lib/guest-token";
import { logger } from "@/lib/logger";

const schema=z.object({brewId:z.string().uuid(),note:z.string().max(1000)});

export async function POST(request:Request,{params}:{params:Promise<{eventId:string}>}){
  const {eventId}=await params;
  try{
    const participant=await requireParticipant(eventId);
    if(!participant||participant.status==="removed")return NextResponse.json({error:"A current tasting seat is required."},{status:401});
    const parsed=schema.safeParse(await request.json().catch(()=>null));
    if(!parsed.success)return NextResponse.json({error:"Keep this infusion note under 1,000 characters."},{status:400});
    const admin=createAdminClient();
    const eventResult=await admin.from("events").select("status,current_brew_id").eq("id",eventId).maybeSingle();
    if(eventResult.error)throw eventResult.error;
    if(!eventResult.data||eventResult.data.status!=="live"||eventResult.data.current_brew_id!==parsed.data.brewId){
      return NextResponse.json({error:"That infusion is no longer current."},{status:409});
    }
    const result=await admin.from("participant_brew_notes").upsert({
      participant_id:participant.id,event_brew_id:parsed.data.brewId,note:parsed.data.note,updated_at:new Date().toISOString()
    },{onConflict:"participant_id,event_brew_id"});
    if(result.error)throw result.error;
    return NextResponse.json({ok:true},{headers:{"Cache-Control":"private, no-store, max-age=0"}});
  }catch(error){
    logger.error("brew_note_save_failed",error,{eventId});
    return NextResponse.json({error:"Your infusion note is still on this screen, but could not be saved."},{status:500});
  }
}
