import type {ConductorStage} from "@/lib/conductor";

export type LiveRewardStatus="queued"|"processing"|"awarded"|"retry";

export type ParticipantLiveRewardsSnapshot={
  available:boolean;
  enabled:boolean;
  balance:number|null;
  label:string;
  award:null|{
    id:string;
    type:"event_complete";
    amount:number;
    status:LiveRewardStatus;
    awardedAt:string|null;
  };
};

export type HostLiveRewardsSnapshot={
  available:boolean;
  enabled:boolean;
  ruleVersion:string|null;
  completionLeaves:number;
  eventCap:number;
  minimumPresenceSeconds:number;
  eligibleCount:number;
  awardedCount:number;
  pendingCount:number;
  retryCount:number;
  totalAwarded:number;
  manualCompletionParticipantIds:string[];
};

export function isRewardPresentationSuppressed(stage:ConductorStage,cheersActive:boolean,speechActive:boolean){
  return cheersActive||speechActive||(["aroma","first_sip","reveal"] as ConductorStage[]).includes(stage);
}

export function liveRewardStatusCopy(status:LiveRewardStatus){
  if(status==="awarded")return"Added to your Gold Leaves.";
  return"Your Gold Leaves are pending quietly.";
}
