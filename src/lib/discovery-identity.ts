import type {ConductorStage} from "@/lib/conductor";

export type DiscoveryIdentityEmblem="compass"|"flower"|"leaf"|"garden"|"moon"|"map"|"story"|"mountain";

export type DiscoveryRelatedTea={
  teaKey:string;
  teaName:string;
  origin:string|null;
  completedAt:string;
  source:"live"|"solo";
};

export type DiscoveryIdentity={
  id:string;
  slug:string;
  name:string;
  description:string;
  emblem:DiscoveryIdentityEmblem;
  earnedAt:string;
  earnedEventId:string|null;
  evidenceSummary:string;
  relatedTeas:DiscoveryRelatedTea[];
  currentlyConfirmed:boolean;
  criteriaVersion:number;
  sourceMetricsVersion:string;
  featured:boolean;
  hidden:boolean;
  visibility:"private"|"event"|"public";
};

export type DiscoveryMetrics={
  teasExplored:number;
  teaTypeCount:number;
  originCount:number;
  liveTastingsCompleted:number;
  teaTypeDistribution:Record<string,number>;
  origins:string[];
  descriptorFamilyDistribution:Record<string,number>;
  sourceMetricsVersion:string;
};

export type DiscoveryProfileSnapshot={
  available:boolean;
  privateByDefault:boolean;
  identityRevealsEnabled:boolean;
  socialProfileEnabled:boolean;
  metrics:DiscoveryMetrics;
  identities:DiscoveryIdentity[];
};

export type EventDiscoveryIdentitySnapshot={
  available:boolean;
  accountLinked:boolean;
  identityRevealsEnabled:boolean;
  identities:DiscoveryIdentity[];
};

export const EMPTY_DISCOVERY_METRICS:DiscoveryMetrics={
  teasExplored:0,
  teaTypeCount:0,
  originCount:0,
  liveTastingsCompleted:0,
  teaTypeDistribution:{},
  origins:[],
  descriptorFamilyDistribution:{},
  sourceMetricsVersion:"discovery-v1"
};

export const UNAVAILABLE_DISCOVERY_PROFILE:DiscoveryProfileSnapshot={
  available:false,
  privateByDefault:true,
  identityRevealsEnabled:true,
  socialProfileEnabled:false,
  metrics:EMPTY_DISCOVERY_METRICS,
  identities:[]
};

export function isIdentityRevealSuppressed(stage:ConductorStage,cheersActive:boolean,speechActive:boolean){
  return cheersActive||speechActive||(["aroma","first_sip","reveal"] as ConductorStage[]).includes(stage);
}

export function formatIdentityEarnedDate(value:string){
  return new Date(value).toLocaleDateString("en-CA",{dateStyle:"long"});
}
