import type {SupabaseClient} from "@supabase/supabase-js";
import type {HostLiveRewardsSnapshot,LiveRewardStatus,ParticipantLiveRewardsSnapshot} from "@/lib/live-rewards";

type PolicyRow={rule_version:string;event_completion_leaves:number;max_leaves_per_participant_event:number;minimum_presence_seconds:number};
type SettingsRow={reward_mode_enabled:boolean;policy:PolicyRow|PolicyRow[]|null};

function policyFrom(settings:SettingsRow|null):PolicyRow|null{
  if(!settings?.policy)return null;
  return Array.isArray(settings.policy)?settings.policy[0]??null:settings.policy;
}

async function loadSettings(admin:SupabaseClient,eventId:string){
  const result=await admin.from("event_live_reward_settings")
    .select("reward_mode_enabled,policy:live_tasting_reward_policies(rule_version,event_completion_leaves,max_leaves_per_participant_event,minimum_presence_seconds)")
    .eq("event_id",eventId).maybeSingle();
  if(result.error)throw result.error;
  const settings=result.data as SettingsRow|null;
  return{settings,policy:policyFrom(settings)};
}

export async function queueAndProcessLiveRewards(admin:SupabaseClient,eventId:string){
  const queued=await admin.rpc("queue_live_tasting_completion_rewards",{p_event_id:eventId});
  if(queued.error)throw queued.error;
  const processed=await admin.rpc("process_live_tasting_rewards",{p_event_id:eventId});
  if(processed.error)throw processed.error;
  return{queued:queued.data,processed:processed.data};
}

export async function processCompletedLiveRewards(admin:SupabaseClient,eventId:string){
  const eventResult=await admin.from("events").select("status,phase").eq("id",eventId).maybeSingle();
  if(eventResult.error)throw eventResult.error;
  if(eventResult.data?.status==="completed"&&eventResult.data.phase==="ended")return queueAndProcessLiveRewards(admin,eventId);
  return null;
}

export async function loadParticipantLiveRewards({admin,eventId,userId}:{admin:SupabaseClient;eventId:string;userId:string|null}):Promise<ParticipantLiveRewardsSnapshot>{
  if(!userId)return{available:false,enabled:false,balance:null,label:"Gold Leaves",award:null};
  const[{settings,policy},walletResult,awardResult]=await Promise.all([
    loadSettings(admin,eventId),
    admin.from("merchant_wallets").select("balance").eq("owner_user_id",userId).maybeSingle(),
    admin.from("event_live_reward_awards").select("id,reward_type,amount,status,awarded_at").eq("event_id",eventId).eq("user_id",userId).eq("reward_type","event_complete").maybeSingle()
  ]);
  if(walletResult.error)throw walletResult.error;
  if(awardResult.error)throw awardResult.error;
  const balance=walletResult.data?Number(walletResult.data.balance):0;
  const award=awardResult.data?{
    id:awardResult.data.id,type:"event_complete" as const,amount:Number(awardResult.data.amount),
    status:awardResult.data.status as LiveRewardStatus,awardedAt:awardResult.data.awarded_at
  }:null;
  return{available:Boolean(settings&&policy),enabled:Boolean(settings?.reward_mode_enabled),balance,label:balance===1?"Gold Leaf":"Gold Leaves",award};
}

export async function loadHostLiveRewards({admin,eventId}:{admin:SupabaseClient;eventId:string}):Promise<HostLiveRewardsSnapshot>{
  const[{settings,policy},awardsResult,overridesResult,participantsResult,flightResult]=await Promise.all([
    loadSettings(admin,eventId),
    admin.from("event_live_reward_awards").select("status,amount").eq("event_id",eventId),
    admin.from("event_live_reward_completion_overrides").select("participant_id").eq("event_id",eventId),
    admin.from("participants").select("id,user_id,status,joined_at,last_seen_at").eq("event_id",eventId),
    admin.from("event_flight_items").select("id").eq("event_id",eventId)
  ]);
  if(awardsResult.error||overridesResult.error||participantsResult.error||flightResult.error)throw awardsResult.error??overridesResult.error??participantsResult.error??flightResult.error;
  const flightIds=(flightResult.data??[]).map(item=>item.id);
  const responsesResult=flightIds.length
    ? await admin.from("tea_responses").select("participant_id").in("event_flight_item_id",flightIds).not("completed_at","is",null)
    : {data:[],error:null};
  if(responsesResult.error)throw responsesResult.error;
  const overrides=new Set((overridesResult.data??[]).map(item=>item.participant_id));
  const completed=new Set((responsesResult.data??[]).map(item=>item.participant_id));
  const minimum=(policy?.minimum_presence_seconds??0)*1000;
  const eligible=(participantsResult.data??[]).filter(participant=>{
    if(!participant.user_id||participant.status==="removed")return false;
    if(overrides.has(participant.id))return true;
    if(!participant.joined_at||!participant.last_seen_at||!completed.has(participant.id))return false;
    return new Date(participant.last_seen_at).getTime()-new Date(participant.joined_at).getTime()>=minimum;
  }).length;
  const awards=awardsResult.data??[];
  return{
    available:Boolean(settings&&policy),enabled:Boolean(settings?.reward_mode_enabled),ruleVersion:policy?.rule_version??null,
    completionLeaves:Number(policy?.event_completion_leaves??0),eventCap:Number(policy?.max_leaves_per_participant_event??0),
    minimumPresenceSeconds:Number(policy?.minimum_presence_seconds??0),eligibleCount:eligible,
    awardedCount:awards.filter(award=>award.status==="awarded").length,
    pendingCount:awards.filter(award=>["queued","processing"].includes(award.status)).length,
    retryCount:awards.filter(award=>award.status==="retry").length,
    totalAwarded:awards.filter(award=>award.status==="awarded").reduce((sum,award)=>sum+Number(award.amount),0),
    manualCompletionParticipantIds:[...overrides]
  };
}
