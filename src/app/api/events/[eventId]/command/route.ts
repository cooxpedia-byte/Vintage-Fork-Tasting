import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { CONDUCTOR_STAGES } from "@/lib/conductor";
import { assignBreakoutRooms, breakoutPriorPairs } from "@/lib/breakouts";
import {refreshDiscoveryCardsForSession} from "@/lib/discovery-cards-server";
import {createAdminClient} from "@/lib/supabase/admin";
import {canManageAgoraEvent} from "@/lib/agora";
import {groupRevealFingerprint,loadGroupRevealSnapshot} from "@/lib/group-reveal-server";
import {queueAndProcessLiveRewards} from "@/lib/live-rewards-server";
import {recalculateEventDiscoveryIdentities} from "@/lib/discovery-identity-server";
import {refreshLivingMapProjection} from "@/lib/living-tasting-map-server";

const conductorStageIds = CONDUCTOR_STAGES.map(stage => stage.id) as [string, ...string[]];
const conductorCommands = new Set(["advance_stage","pause_stage","resume_stage","extend_stage","skip_stage","go_back_stage","jump_stage"]);
const sharedBrewCommands = new Set(["start_brew","restart_brew","start_next_infusion","end_brew_early"]);
const breakoutCommands = new Set(["launch_breakouts","extend_breakouts","end_breakouts"]);
const discoveryCommands = new Set(["open_discovery_card","compare_discovery_card","surface_discovery_curiosity","close_discovery_cards","invite_discovery_spokesperson","complete_discovery_share"]);
const groupRevealCommands = new Set(["reveal_group_aroma","reveal_group_taste","combine_group_reveal","show_group_timeline","set_group_timeline","highlight_group_flavor","clear_group_flavor","show_group_producer_notes","hide_group_producer_notes","freeze_group_fingerprint","return_group_discussion"]);
const cheersCommands = new Set(["open_cheers","resolve_cheers","cancel_cheers"]);
const liveRewardCommands = new Set(["set_reward_mode","grant_reward_completion"]);
const conversationPromptCommands = new Set(["set_conversation_prompts_enabled","send_conversation_prompt"]);
const livingMapCommands = new Set(["configure_living_map","start_living_map","pause_living_map","resume_living_map","freeze_living_map","start_living_map_replay","pause_living_map_replay","resume_living_map_replay","seek_living_map_replay","commit_living_map_fingerprint","reopen_living_map"]);

const schema = z.object({
  command: z.enum(["open_session","reveal_tea","start_timer","open_tasting","open_trivia","close_trivia","return_to_tasting","next_tea","start_recap","advance_stage","start_brew","restart_brew","start_next_infusion","end_brew_early","pause_stage","resume_stage","extend_stage","skip_stage","go_back_stage","jump_stage","launch_breakouts","extend_breakouts","end_breakouts","open_discovery_card","compare_discovery_card","surface_discovery_curiosity","close_discovery_cards","invite_discovery_spokesperson","complete_discovery_share","reveal_group_aroma","reveal_group_taste","combine_group_reveal","show_group_timeline","set_group_timeline","highlight_group_flavor","clear_group_flavor","show_group_producer_notes","hide_group_producer_notes","freeze_group_fingerprint","return_group_discussion","open_cheers","resolve_cheers","cancel_cheers","set_reward_mode","grant_reward_completion","set_conversation_prompts_enabled","send_conversation_prompt","configure_living_map","start_living_map","pause_living_map","resume_living_map","freeze_living_map","start_living_map_replay","pause_living_map_replay","resume_living_map_replay","seek_living_map_replay","commit_living_map_fingerprint","reopen_living_map","end_session"]),
  expectedSequence: z.number().int().nonnegative(),
  leaseToken: z.string().uuid(),
  clientCommandId: z.string().uuid(),
  payload: z.object({
    targetStage: z.enum(conductorStageIds).optional(),
    seconds: z.number().int().min(10).max(300).optional(),
    durationSeconds: z.number().int().min(1).max(7200).optional(),
    countdownSeconds: z.number().int().min(0).max(5).optional(),
    roomSize: z.number().int().min(2).max(4).optional(),
    assignmentMode: z.enum(["shuffle","remix"]).optional(),
    prompt: z.string().trim().min(1).max(240).optional(),
    cardId: z.string().uuid().optional(),
    participantId: z.string().uuid().optional(),
    flavorKey: z.string().trim().min(1).max(100).optional(),
    timelineIndex: z.number().int().nonnegative().max(1000).optional(),
    cheersWindowSeconds: z.union([z.literal(5),z.literal(8),z.literal(10)]).optional(),
    cheersContext: z.enum(["first_sip","welcome_back","final","spontaneous"]).optional(),
    cheersSoundEnabled: z.boolean().optional(),
    rewardModeEnabled: z.boolean().optional(),
    conversationPromptsEnabled:z.boolean().optional(),
    conversationPromptId:z.string().uuid().optional(),
    conversationPromptTarget:z.enum(["main","breakouts"]).optional(),
    visibilityMode:z.enum(["quiet_start","shared_live"]).optional(),
    customNotesEnabled:z.boolean().optional(),
    replayPositionMs:z.number().int().min(0).max(1800000).optional()
  }).optional().default({})
});

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid host command." }, { status: 400 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    let commandPayload:Record<string,unknown>={...parsed.data.payload};
    if(parsed.data.command==="launch_breakouts"){
      const participantResult=await supabase.from("participants").select("id").eq("event_id",eventId).in("status",["admitted","active"]).gte("last_seen_at",new Date(Date.now()-45_000).toISOString());
      if(participantResult.error)throw participantResult.error;
      const participantIds=(participantResult.data??[]).map(participant=>participant.id);
      if(participantIds.length<2)return NextResponse.json({error:"Continue together in the main tasting until another guest joins."},{status:409});

      const priorSessionResult=await supabase.from("event_breakout_sessions").select("id").eq("event_id",eventId).in("status",["complete","cancelled"]);
      if(priorSessionResult.error)throw priorSessionResult.error;
      const priorSessionIds=(priorSessionResult.data??[]).map(session=>session.id);
      const priorMemberResult=priorSessionIds.length
        ? await supabase.from("event_breakout_members").select("session_id,breakout_room_id,participant_id").in("session_id",priorSessionIds)
        : {data:[],error:null};
      if(priorMemberResult.error)throw priorMemberResult.error;
      const priorRooms=new Map<string,string[]>();
      for(const member of priorMemberResult.data??[]){
        const key=`${member.session_id}:${member.breakout_room_id}`;
        priorRooms.set(key,[...(priorRooms.get(key)??[]),member.participant_id]);
      }
      const previousRooms=[...priorRooms.values()];
      commandPayload={
        ...commandPayload,
        assignments:assignBreakoutRooms({
          participantIds,
          targetSize:parsed.data.payload.roomSize??3,
          mode:parsed.data.payload.assignmentMode??"shuffle",
          priorPairs:breakoutPriorPairs(previousRooms),
          seed:parsed.data.clientCommandId
        })
      };
    }
    if(parsed.data.command==="freeze_group_fingerprint"){
      const admin=createAdminClient();
      const [eventResult,profileResult]=await Promise.all([
        admin.from("events").select("id,title,owner_user_id,host_user_id,backup_host_user_id,current_flight_item_id").eq("id",eventId).maybeSingle(),
        supabase.from("profiles").select("role").eq("id",user.id).maybeSingle()
      ]);
      if(eventResult.error||profileResult.error)throw eventResult.error??profileResult.error;
      const fingerprintEvent=eventResult.data;
      if(!fingerprintEvent||!canManageAgoraEvent(user.id,profileResult.data?.role,fingerprintEvent))return NextResponse.json({error:"You cannot freeze this group portrait."},{status:403});
      if(!fingerprintEvent.current_flight_item_id)return NextResponse.json({error:"The current tea is not available."},{status:409});
      const [snapshot,teaResult,brewResult]=await Promise.all([
        loadGroupRevealSnapshot({admin,eventId,eventFlightItemId:fingerprintEvent.current_flight_item_id}),
        admin.from("event_flight_items").select("id,reveal_title,tea:teas(name,origin)").eq("id",fingerprintEvent.current_flight_item_id).single(),
        admin.from("event_brews").select("infusion_number,duration_ms,started_at,completed_at").eq("event_id",eventId).eq("event_flight_item_id",fingerprintEvent.current_flight_item_id).order("started_at")
      ]);
      if(!snapshot||teaResult.error||brewResult.error)throw teaResult.error??brewResult.error??new Error("group_reveal_unavailable");
      const teaRelation=teaResult.data.tea as unknown as {name?:string;origin?:string|null}|Array<{name?:string;origin?:string|null}>|null;
      const tea=Array.isArray(teaRelation)?teaRelation[0]:teaRelation;
      commandPayload={...commandPayload,fingerprint:groupRevealFingerprint({snapshot,event:{id:eventId,title:fingerprintEvent.title},tea:{id:teaResult.data.id,title:teaResult.data.reveal_title,name:tea?.name??null,origin:tea?.origin??null},brews:brewResult.data??[]})};
    }
    const { data, error } = livingMapCommands.has(parsed.data.command)
      ? await supabase.rpc("apply_living_tasting_map_command",{
          p_event_id:eventId,p_command:parsed.data.command,p_expected_sequence:parsed.data.expectedSequence,
          p_lease_token:parsed.data.leaseToken,p_client_command_id:parsed.data.clientCommandId,p_payload:commandPayload
        })
      : conversationPromptCommands.has(parsed.data.command)
      ? await supabase.rpc("apply_conversation_prompt_command",{
          p_event_id:eventId,p_command:parsed.data.command,p_expected_sequence:parsed.data.expectedSequence,
          p_lease_token:parsed.data.leaseToken,p_client_command_id:parsed.data.clientCommandId,p_payload:commandPayload
        })
      : liveRewardCommands.has(parsed.data.command)
      ? await supabase.rpc("apply_live_tasting_reward_command",{
          p_event_id:eventId,p_command:parsed.data.command,p_expected_sequence:parsed.data.expectedSequence,
          p_lease_token:parsed.data.leaseToken,p_client_command_id:parsed.data.clientCommandId,p_payload:commandPayload
        })
      : cheersCommands.has(parsed.data.command)
      ? await supabase.rpc("apply_cheers_command",{
          p_event_id:eventId,
          p_command:parsed.data.command,
          p_expected_sequence:parsed.data.expectedSequence,
          p_lease_token:parsed.data.leaseToken,
          p_client_command_id:parsed.data.clientCommandId,
          p_payload:commandPayload
        })
      : groupRevealCommands.has(parsed.data.command)
      ? await supabase.rpc("apply_group_reveal_command",{
          p_event_id:eventId,
          p_command:parsed.data.command,
          p_expected_sequence:parsed.data.expectedSequence,
          p_lease_token:parsed.data.leaseToken,
          p_client_command_id:parsed.data.clientCommandId,
          p_payload:commandPayload
        })
      : discoveryCommands.has(parsed.data.command)
      ? await supabase.rpc("apply_discovery_presentation_command",{
          p_event_id:eventId,
          p_command:parsed.data.command,
          p_expected_sequence:parsed.data.expectedSequence,
          p_lease_token:parsed.data.leaseToken,
          p_client_command_id:parsed.data.clientCommandId,
          p_payload:commandPayload
        })
      : breakoutCommands.has(parsed.data.command)
      ? await supabase.rpc("apply_breakout_command", {
          p_event_id:eventId,
          p_command:parsed.data.command,
          p_expected_sequence:parsed.data.expectedSequence,
          p_lease_token:parsed.data.leaseToken,
          p_client_command_id:parsed.data.clientCommandId,
          p_payload:commandPayload
        })
      : sharedBrewCommands.has(parsed.data.command)
      ? await supabase.rpc("apply_shared_brew_command", {
          p_event_id: eventId,
          p_command: parsed.data.command,
          p_expected_sequence: parsed.data.expectedSequence,
          p_lease_token: parsed.data.leaseToken,
          p_client_command_id: parsed.data.clientCommandId,
          p_payload: commandPayload
        })
      : conductorCommands.has(parsed.data.command)
      ? await supabase.rpc("apply_conductor_command", {
          p_event_id: eventId,
          p_command: parsed.data.command,
          p_expected_sequence: parsed.data.expectedSequence,
          p_lease_token: parsed.data.leaseToken,
          p_client_command_id: parsed.data.clientCommandId,
          p_payload: commandPayload
        })
      : await supabase.rpc("apply_event_command", {
          p_event_id: eventId,
          p_command: parsed.data.command,
          p_expected_sequence: parsed.data.expectedSequence,
          p_lease_token: parsed.data.leaseToken
        });
    if (error) {
      logger.warn("host_command_rejected", { eventId, command: parsed.data.command, userId: user.id, reason: error.message });
      return NextResponse.json({ error: friendly(error.message) }, { status: 409 });
    }
    if(parsed.data.command==="launch_breakouts"&&data?.current_breakout_session_id){
      try{await refreshDiscoveryCardsForSession(createAdminClient(),data.current_breakout_session_id)}
      catch(cardError){logger.warn("room_discovery_launch_refresh_failed",{eventId,sessionId:data.current_breakout_session_id,reason:cardError instanceof Error?cardError.message:"unknown"})}
    }
    if(livingMapCommands.has(parsed.data.command)&&data?.current_flight_item_id){
      try{await refreshLivingMapProjection({admin:createAdminClient(),eventId,eventFlightItemId:data.current_flight_item_id,commitFingerprint:parsed.data.command==="freeze_living_map"})}
      catch(mapError){logger.warn("living_map_projection_refresh_deferred",{eventId,command:parsed.data.command,reason:mapError instanceof Error?mapError.message:"unknown"})}
    }
    if(parsed.data.command==="end_session"){
      try{await queueAndProcessLiveRewards(createAdminClient(),eventId)}
      catch(rewardError){logger.warn("live_reward_processing_deferred",{eventId,reason:rewardError instanceof Error?rewardError.message:"unknown"})}
      try{await recalculateEventDiscoveryIdentities(createAdminClient(),eventId)}
      catch(identityError){logger.warn("discovery_identity_processing_deferred",{eventId,reason:identityError instanceof Error?identityError.message:"unknown"})}
    }
    logger.info("host_command_applied", { eventId, command: parsed.data.command, userId: user.id, sequence: data?.sequence_number });
    return NextResponse.json({ event: data });
  } catch (error) {
    logger.error("host_command_failed", error, { eventId });
    return NextResponse.json({ error: "The command was not applied. Nothing changed for guests." }, { status: 500 });
  }
}
function friendly(message: string) {
  if (message.includes("stale_sequence")) return "The room moved on another device. The latest state has been loaded.";
  if (message.includes("lease_lost")) return "Another host now controls this tasting.";
  if (message.includes("not_ready")) return "Finish every launch-readiness item first.";
  if (message.includes("illegal_phase")) return "The room is already past that step.";
  if (message.includes("last_tea")) return "This is the last tea. Start the recap next.";
  if (message.includes("not_last_tea")) return "There is another tea in the flight.";
  if (message.includes("trivia_open")) return "Close the trivia question before continuing.";
  if (message.includes("trivia_incomplete")) return "Finish every trivia question for this tea before continuing.";
  if (message.includes("trivia_complete")) return "All trivia questions for this tea are already complete.";
  if (message.includes("tasting_not_open")) return "Reveal and open this tea before continuing.";
  if (message.includes("reveal_in_progress")) return "The reveal is still in progress. The next control will unlock when the ceremony finishes.";
  if (message.includes("stage_paused")) return "Resume this stage before moving the room on.";
  if (message.includes("stage_not_paused")) return "This stage is already running.";
  if (message.includes("stage_not_timed")) return "Only a timed stage can be extended.";
  if (message.includes("brew_not_ready")) return "Prepare this tea before starting its shared brew.";
  if (message.includes("brew_not_running")) return "There is no current infusion to change.";
  if (message.includes("invalid_countdown")) return "Choose an immediate start or a countdown of up to five seconds.";
  if (message.includes("invalid_stage")) return "That stage is not available in this tasting flow.";
  if (message.includes("first_stage")) return "Arrival is already the first stage.";
  if (message.includes("breakout_stage_unavailable")) return "Small tasting rooms open after the first sip or while guests explore and discuss.";
  if (message.includes("breakout_video_required")) return "Small tasting rooms are available for remote Agora tastings.";
  if (message.includes("breakout_already_active")) return "Small tasting rooms are already open.";
  if (message.includes("breakout_not_active")) return "Those tasting tables have already returned.";
  if (message.includes("invalid_breakout")) return "That tasting-table setup is no longer available. Everyone can continue in the main tasting.";
  if (message.includes("discovery_board_unavailable")) return "The returned table cards are not available for this tea.";
  if (message.includes("discovery_card_unavailable")) return "That table card is no longer available.";
  if (message.includes("discovery_spokesperson_unavailable")) return "That table member is not available to share right now.";
  if (message.includes("discovery_curiosity_unavailable")) return "That table did not add a curiosity to surface.";
  if (message.includes("group_reveal_stage_unavailable")) return "Group discovery controls open during the Reveal stage.";
  if (message.includes("group_reveal_not_started")) return "Reveal aroma or taste before combining the group portrait.";
  if (message.includes("group_timeline_unavailable")) return "Open the tasting timeline before moving through it.";
  if (message.includes("group_flavor_unavailable")) return "That flavor is not available to highlight.";
  if (message.includes("producer_notes_too_early")) return "Explore the group portrait before opening producer notes.";
  if (message.includes("group_fingerprint_too_early")) return "Combine the group portrait before freezing its fingerprint.";
  if (message.includes("cheers_already_open")) return "A shared Cheers is already in progress.";
  if (message.includes("cheers_not_open")) return "That shared Cheers has already resolved.";
  if (message.includes("invalid_cheers_window")) return "Choose a five, eight, or ten second Cheers window.";
  if (message.includes("invalid_cheers_context")) return "Choose a supported Cheers moment.";
  if (message.includes("reward_policy_unavailable")) return "The centrally governed Gold Leaves policy is not available.";
  if (message.includes("reward_participant_unavailable")) return "That guest is not available for a completion exception.";
  if (message.includes("conversation_prompt_disabled")) return "Enable conversation prompts before sending one.";
  if (message.includes("conversation_prompt_unavailable")) return "That prompt is not available for this tasting stage.";
  if (message.includes("conversation_prompt_breakouts_unavailable")) return "Open tasting tables before sending a prompt to them.";
  if (message.includes("conversation_prompt_target_invalid")) return "Choose the main room or the active small tables.";
  if (message.includes("living_map_stage_unavailable")) return "Open the Living Map during Aroma, First Sip, Explore, or Discuss.";
  if (message.includes("living_map_already_started")) return "This Living Map has already started.";
  if (message.includes("living_map_not_live")) return "This Living Map is not currently changing.";
  if (message.includes("living_map_not_paused")) return "This Living Map is already moving.";
  if (message.includes("living_map_fingerprint_unavailable")) return "Freeze the map before beginning its replay.";
  if (message.includes("living_map_replay_not_running")) return "The replay is already paused.";
  if (message.includes("living_map_replay_not_paused")) return "The replay is already playing.";
  if (message.includes("living_map_reopen_unavailable")) return "A committed fingerprint cannot be reopened.";
  return message.replaceAll("_", " ");
}
