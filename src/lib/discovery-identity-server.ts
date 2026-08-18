import type {SupabaseClient} from "@supabase/supabase-js";
import {
  EMPTY_DISCOVERY_METRICS,
  type DiscoveryIdentity,
  type DiscoveryIdentityEmblem,
  type DiscoveryMetrics,
  type DiscoveryProfileSnapshot,
  type DiscoveryRelatedTea,
  type EventDiscoveryIdentitySnapshot
} from "@/lib/discovery-identity";

type DefinitionRow={
  slug:string;
  name:string;
  description:string;
  emblem:string;
  sort_order:number;
};

type IdentityRow={
  id:string;
  criteria_version:number;
  source_metrics_version:string;
  earned_at:string;
  earned_event_id:string|null;
  evidence_summary:string;
  evidence:Record<string,unknown>|null;
  is_featured:boolean;
  visibility:"private"|"event"|"public";
  hidden_at:string|null;
  definition:DefinitionRow|DefinitionRow[]|null;
};

type MetricsRow={
  teas_explored?:number;
  tea_type_count?:number;
  origin_count?:number;
  live_tastings_completed?:number;
  tea_type_distribution?:Record<string,number>;
  origins?:string[];
  descriptor_family_distribution?:Record<string,number>;
  source_metrics_version?:string;
};

function first<T>(value:T|T[]|null):T|null{return Array.isArray(value)?value[0]??null:value}
function numberValue(value:unknown){const parsed=Number(value);return Number.isFinite(parsed)?parsed:0}

function mapMetrics(value:unknown):DiscoveryMetrics{
  const row=(value&&typeof value==="object"?value:{}) as MetricsRow;
  return{
    teasExplored:numberValue(row.teas_explored),
    teaTypeCount:numberValue(row.tea_type_count),
    originCount:numberValue(row.origin_count),
    liveTastingsCompleted:numberValue(row.live_tastings_completed),
    teaTypeDistribution:row.tea_type_distribution??{},
    origins:Array.isArray(row.origins)?row.origins:[],
    descriptorFamilyDistribution:row.descriptor_family_distribution??{},
    sourceMetricsVersion:row.source_metrics_version??"discovery-v1"
  };
}

function mapIdentity(row:IdentityRow):DiscoveryIdentity|null{
  const definition=first(row.definition);
  if(!definition)return null;
  const evidence=row.evidence??{};
  const related=Array.isArray(evidence.relatedTeas)?evidence.relatedTeas:[];
  return{
    id:row.id,
    slug:definition.slug,
    name:definition.name,
    description:definition.description,
    emblem:definition.emblem as DiscoveryIdentityEmblem,
    earnedAt:row.earned_at,
    earnedEventId:row.earned_event_id,
    evidenceSummary:row.evidence_summary,
    relatedTeas:related.filter((item):item is DiscoveryRelatedTea=>Boolean(item&&typeof item==="object"&&"teaName" in item)),
    currentlyConfirmed:evidence.currentlyConfirmed!==false,
    criteriaVersion:row.criteria_version,
    sourceMetricsVersion:row.source_metrics_version,
    featured:row.is_featured,
    hidden:Boolean(row.hidden_at),
    visibility:row.visibility
  };
}

export async function recalculateDiscoveryIdentities(admin:SupabaseClient,userId:string,sourceEventId:string|null=null){
  const result=await admin.rpc("recalculate_discovery_identities",{p_user_id:userId,p_source_event_id:sourceEventId});
  if(result.error)throw result.error;
  const data=(result.data&&typeof result.data==="object"?result.data:{}) as {newIdentityIds?:unknown};
  return{
    newIdentityIds:Array.isArray(data.newIdentityIds)?data.newIdentityIds.filter((value):value is string=>typeof value==="string"):[],
    metrics:mapMetrics((data as {metrics?:unknown}).metrics)
  };
}

export async function recalculateEventDiscoveryIdentities(admin:SupabaseClient,eventId:string){
  const participants=await admin.from("participants").select("user_id").eq("event_id",eventId).neq("status","removed").not("user_id","is",null);
  if(participants.error)throw participants.error;
  const userIds=[...new Set((participants.data??[]).flatMap(row=>row.user_id?[row.user_id]:[]))];
  const results=await Promise.allSettled(userIds.map(userId=>recalculateDiscoveryIdentities(admin,userId,eventId)));
  const rejected=results.find((result):result is PromiseRejectedResult=>result.status==="rejected");
  if(rejected)throw rejected.reason;
  return results.flatMap(result=>result.status==="fulfilled"?result.value.newIdentityIds:[]);
}

export async function loadPrivateDiscoveryProfile(admin:SupabaseClient,userId:string):Promise<DiscoveryProfileSnapshot>{
  const[settingsResult,identitiesResult,metricsResult]=await Promise.all([
    admin.from("user_discovery_profiles").select("identity_reveals_enabled,social_profile_enabled").eq("user_id",userId).maybeSingle(),
    admin.from("user_discovery_identities").select("id,criteria_version,source_metrics_version,earned_at,earned_event_id,evidence_summary,evidence,is_featured,visibility,hidden_at,definition:discovery_identity_definitions(slug,name,description,emblem,sort_order)").eq("user_id",userId),
    admin.rpc("discovery_metrics_for_user",{p_user_id:userId})
  ]);
  if(settingsResult.error||identitiesResult.error||metricsResult.error)throw settingsResult.error??identitiesResult.error??metricsResult.error;
  const identities=((identitiesResult.data??[]) as unknown as IdentityRow[]).flatMap(row=>{const mapped=mapIdentity(row);return mapped?[mapped]:[]});
  identities.sort((left,right)=>Number(right.featured)-Number(left.featured)||Number(left.hidden)-Number(right.hidden)||right.earnedAt.localeCompare(left.earnedAt));
  return{
    available:true,
    privateByDefault:true,
    identityRevealsEnabled:settingsResult.data?.identity_reveals_enabled!==false,
    socialProfileEnabled:Boolean(settingsResult.data?.social_profile_enabled),
    metrics:mapMetrics(metricsResult.data??EMPTY_DISCOVERY_METRICS),
    identities
  };
}

export async function refreshPrivateDiscoveryProfile(admin:SupabaseClient,userId:string){
  await recalculateDiscoveryIdentities(admin,userId);
  return loadPrivateDiscoveryProfile(admin,userId);
}

export async function loadEventDiscoveryIdentitySnapshot(admin:SupabaseClient,eventId:string,userId:string|null):Promise<EventDiscoveryIdentitySnapshot>{
  if(!userId)return{available:true,accountLinked:false,identityRevealsEnabled:false,identities:[]};
  const profile=await loadPrivateDiscoveryProfile(admin,userId);
  return{
    available:profile.available,
    accountLinked:true,
    identityRevealsEnabled:profile.identityRevealsEnabled,
    identities:profile.identities.filter(identity=>identity.earnedEventId===eventId)
  };
}
