export type CheersContext = "first_sip" | "welcome_back" | "final" | "spontaneous";
export type CheersStatus = "open" | "resolving" | "complete" | "cancelled";
export type CheersRichness = "intimate" | "gathering" | "full";

export type ParticipantCheersSnapshot = {
  id: string;
  context: CheersContext;
  invitation: string;
  openedAt: string;
  closesAt: string;
  resolveAt: string;
  status: CheersStatus;
  joined: boolean;
  richness: CheersRichness;
  soundEnabled: boolean;
};

export type HostCheersSnapshot = ParticipantCheersSnapshot & {
  joinedCount: number;
};

export type CheersBeat = "invitation" | "gathering" | "clink" | "resolved" | "cancelled";

export const CHEERS_CONTEXT_LABELS:Record<CheersContext,string>={
  first_sip:"First Sip",
  welcome_back:"Welcome Back",
  final:"Final Cheers",
  spontaneous:"Cheers"
};

export function cheersInvitation(context:CheersContext){
  if(context==="welcome_back")return"Welcome back. Raise your cup.";
  if(context==="final")return"To what we discovered together.";
  if(context==="spontaneous")return"Cheers.";
  return"Raise your cup.";
}

export function cheersRichness(participantCount:number,roomCount:number):CheersRichness{
  if(participantCount<=2||roomCount<=4)return"intimate";
  const rate=roomCount?participantCount/roomCount:0;
  if(rate>=.65||participantCount>=12)return"full";
  return"gathering";
}

export function cheersBeat(snapshot:Pick<ParticipantCheersSnapshot,"status"|"closesAt"|"resolveAt">,now:number):CheersBeat{
  if(snapshot.status==="cancelled")return"cancelled";
  const closesAt=new Date(snapshot.closesAt).getTime();
  const resolveAt=new Date(snapshot.resolveAt).getTime();
  if(now<closesAt)return"invitation";
  if(now<resolveAt)return"gathering";
  if(now<resolveAt+1_650)return"clink";
  return"resolved";
}

export function cheersProgress(snapshot:Pick<ParticipantCheersSnapshot,"openedAt"|"closesAt">,now:number){
  const openedAt=new Date(snapshot.openedAt).getTime();
  const closesAt=new Date(snapshot.closesAt).getTime();
  if(closesAt<=openedAt)return 1;
  return Math.max(0,Math.min(1,(now-openedAt)/(closesAt-openedAt)));
}

export function cheersSteamCount(richness:CheersRichness){
  if(richness==="full")return 9;
  if(richness==="gathering")return 6;
  return 3;
}

export function defaultCheersContext(stage:string):CheersContext{
  if(["brew","aroma"].includes(stage))return"first_sip";
  if(["close_tea","transition"].includes(stage))return"final";
  if(stage==="discuss")return"welcome_back";
  return"spontaneous";
}
