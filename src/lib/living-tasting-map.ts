import { findTeaDescriptor, type TeaDescriptorCategory } from "@/lib/tea-lab/descriptors";

export const LIVING_MAP_FAMILIES = [
  "floral","fruit","sweet","roasted","earthy","mineral","vegetal","spice","nutty","savoury"
] as const;

export type LivingMapFamily = typeof LIVING_MAP_FAMILIES[number];
export type LivingMapLayer = "aroma" | "taste";
export type LivingMapVisibilityMode = "quiet_start" | "shared_live";
export type LivingMapStatus = "ready" | "live" | "paused" | "frozen" | "replaying" | "committed";
export type LivingMapAction = "add" | "update" | "remove";

export type LivingMapSession = {
  id:string;
  eventId:string;
  eventFlightItemId:string;
  status:LivingMapStatus;
  durationSeconds:number;
  visibilityMode:LivingMapVisibilityMode;
  customNotesEnabled:boolean;
  startedAt:string|null;
  pausedAt:string|null;
  accumulatedPauseMs:number;
  frozenAt:string|null;
  replayStartedAt:string|null;
  replayPausedAt:string|null;
  replayPositionMs:number;
  replayDurationSeconds:number;
  version:number;
};

export type LivingMapObservationEvent = {
  id:string;
  participantKey:string;
  layer:LivingMapLayer;
  flavorKey:string;
  flavorLabel:string;
  family:LivingMapFamily;
  isCustom:boolean;
  intensity:number;
  action:LivingMapAction;
  elapsedMs:number;
  serverTime:string;
};

export type LivingMapAggregateItem = {
  key:string;
  label:string;
  family:LivingMapFamily;
  layer:LivingMapLayer;
  isCustom:boolean;
  participantCount:number|null;
  participantTotal:number;
  participationRate:number;
  averageIntensity:number;
  intensitySpread:number;
  radius:number;
  blur:number;
  x:number;
  y:number;
  recentlyChanged:boolean;
};

export type LivingMapProjection = {
  atMs:number;
  participantTotal:number;
  aromaContributors:number;
  tasteContributors:number;
  items:LivingMapAggregateItem[];
};

export type LivingMapReplayEvent = Omit<LivingMapObservationEvent,"id"|"serverTime">;

export type LivingMapSnapshot = {
  session:LivingMapSession;
  projection:LivingMapProjection;
  viewerObservations:Array<Pick<LivingMapObservationEvent,"layer"|"flavorKey"|"flavorLabel"|"family"|"isCustom"|"intensity">>;
  generatedPatterns:string[];
  replay:{events:LivingMapReplayEvent[];promptMarkersMs:number[]}|null;
  groupVisible:boolean;
};

export const LIVING_MAP_PROMPTS = [
  {atMs:0,label:"Begin with the cup. What do you notice before the first sip?"},
  {atMs:90_000,label:"Take a first sip when you are ready."},
  {atMs:240_000,label:"Has anything changed as the tea settles and cools?"},
  {atMs:420_000,label:"Look at nose and palate separately. Where do they meet, and where do they separate?"},
  {atMs:600_000,label:"Keep, adjust or remove anything before the map is frozen."},
  {atMs:720_000,label:"Here is how the room’s discovery unfolded."}
] as const;

const CATEGORY_FAMILY:Record<TeaDescriptorCategory,LivingMapFamily>={
  "Basic taste":"savoury",
  "Floral":"floral",
  "Fruit":"fruit",
  "Green & vegetal":"vegetal",
  "Sweet & baked":"sweet",
  "Roasted & nutty":"roasted",
  "Spice":"spice",
  "Earth, wood & mineral":"earthy",
  "Mouthfeel":"savoury",
  "Off-notes":"earthy"
};

const UNSAFE_CUSTOM_TEXT=/\b(fuck|shit|bitch|cunt|nigger|faggot)\b/i;

export function livingMapFlavorKey(value:string){
  return value.trim().toLocaleLowerCase("en-CA").replace(/[’']/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80);
}

export function livingMapFamily(label:string):LivingMapFamily{
  const descriptor=findTeaDescriptor(label);
  if(!descriptor)return"savoury";
  if(descriptor.category==="Roasted & nutty"&&/almond|chestnut|hazelnut|sesame/i.test(descriptor.label))return"nutty";
  if(descriptor.category==="Earth, wood & mineral"&&/mineral|stone|metal/i.test(descriptor.label))return"mineral";
  if(descriptor.category==="Basic taste"&&/sweet/i.test(descriptor.label))return"sweet";
  return CATEGORY_FAMILY[descriptor.category];
}

export function customFlavorTextIssue(value:string){
  const clean=value.replace(/\s+/g," ").trim();
  if(clean.length<2)return"Add at least two characters.";
  if(clean.length>80)return"Keep your phrase to 80 characters.";
  if(UNSAFE_CUSTOM_TEXT.test(clean))return"Choose words that are generous to everyone in the room.";
  return null;
}

export function livingMapElapsedMs(session:LivingMapSession,now:number){
  if(!session.startedAt)return 0;
  const terminal=session.frozenAt?new Date(session.frozenAt).getTime():session.pausedAt?new Date(session.pausedAt).getTime():now;
  return Math.max(0,Math.min(session.durationSeconds*1000,terminal-new Date(session.startedAt).getTime()-session.accumulatedPauseMs));
}

export function livingMapGroupVisible(session:LivingMapSession,elapsedMs:number){
  if(session.visibilityMode==="shared_live")return true;
  return !(elapsedMs<30_000||(elapsedMs>=90_000&&elapsedMs<120_000));
}

export function livingMapReplayPositionMs(session:LivingMapSession,now:number){
  if(session.status!=="replaying"||!session.replayStartedAt||session.replayPausedAt)return session.replayPositionMs;
  const compression=(session.durationSeconds*1000)/(session.replayDurationSeconds*1000);
  return Math.min(session.durationSeconds*1000,session.replayPositionMs+(now-new Date(session.replayStartedAt).getTime())*compression);
}

export function projectLivingMap(events:LivingMapObservationEvent[],participantTotal:number,atMs=Number.POSITIVE_INFINITY,hiddenKeys:string[]=[]):LivingMapProjection{
  const hidden=new Set(hiddenKeys);
  const latest=new Map<string,LivingMapObservationEvent>();
  const ordered=events.filter(event=>event.elapsedMs<=atMs).sort((left,right)=>left.elapsedMs-right.elapsedMs||left.serverTime.localeCompare(right.serverTime)||left.id.localeCompare(right.id));
  for(const event of ordered){
    const identity=`${event.participantKey}:${event.layer}:${event.flavorKey}`;
    if(hidden.has(event.flavorKey)||event.action==="remove")latest.delete(identity);
    else latest.set(identity,event);
  }
  const layerContributors={aroma:new Set<string>(),taste:new Set<string>()};
  const groups=new Map<string,{label:string;family:LivingMapFamily;layer:LivingMapLayer;isCustom:boolean;participants:Set<string>;intensities:number[];latestMs:number}>();
  for(const event of latest.values()){
    layerContributors[event.layer].add(event.participantKey);
    const key=`${event.layer}:${event.flavorKey}`;
    const group=groups.get(key)??{label:event.flavorLabel,family:event.family,layer:event.layer,isCustom:event.isCustom,participants:new Set<string>(),intensities:[],latestMs:0};
    group.participants.add(event.participantKey);group.intensities.push(event.intensity);group.latestMs=Math.max(group.latestMs,event.elapsedMs);groups.set(key,group);
  }
  const effectiveAt=Number.isFinite(atMs)?atMs:ordered.at(-1)?.elapsedMs??0;
  const items=[...groups.entries()].map(([compound,group]):LivingMapAggregateItem=>{
    const key=compound.slice(compound.indexOf(":")+1);
    const participationRate=participantTotal?group.participants.size/participantTotal:0;
    const averageIntensity=Math.round(group.intensities.reduce((sum,value)=>sum+value,0)/group.intensities.length);
    const variance=group.intensities.reduce((sum,value)=>sum+(value-averageIntensity)**2,0)/group.intensities.length;
    const intensitySpread=Math.round(Math.sqrt(variance));
    const position=livingMapPosition(key,group.family);
    return{key,label:group.label,family:group.family,layer:group.layer,isCustom:group.isCustom,
      participantCount:participantTotal>=3?group.participants.size:null,participantTotal,participationRate,
      averageIntensity,intensitySpread,radius:Math.round(22+Math.sqrt(participationRate)*62),blur:Math.round(3+intensitySpread*.22),
      x:position.x,y:position.y,recentlyChanged:effectiveAt-group.latestMs<=4_000};
  }).sort((left,right)=>right.participationRate-left.participationRate||right.averageIntensity-left.averageIntensity||left.label.localeCompare(right.label,"en-CA"));
  return{atMs:effectiveAt,participantTotal,aromaContributors:layerContributors.aroma.size,tasteContributors:layerContributors.taste.size,items};
}

export function livingMapReplayProjection(events:LivingMapReplayEvent[],participantTotal:number,atMs:number):LivingMapProjection{
  return projectLivingMap(events.map((event,index)=>({...event,id:`replay-${index}`,serverTime:new Date(event.elapsedMs).toISOString()})),participantTotal,atMs);
}

export function livingMapReplayManifest(events:LivingMapObservationEvent[]){
  const aliases=new Map<string,string>();
  return events.sort((left,right)=>left.elapsedMs-right.elapsedMs).map(event=>{
    if(!aliases.has(event.participantKey))aliases.set(event.participantKey,`p${aliases.size+1}`);
    return{participantKey:aliases.get(event.participantKey)!,layer:event.layer,flavorKey:event.flavorKey,flavorLabel:event.flavorLabel,
      family:event.family,isCustom:event.isCustom,intensity:event.intensity,action:event.action,elapsedMs:event.elapsedMs};
  });
}

export function livingMapPatterns(events:LivingMapObservationEvent[],projection:LivingMapProjection){
  const patterns:string[]=[];
  const earliest=events.filter(event=>event.action!=="remove").sort((a,b)=>a.elapsedMs-b.elapsedMs)[0];
  if(earliest&&earliest.elapsedMs<=60_000)patterns.push(`${earliest.flavorLabel} appeared in the first minute.`);
  const byKey=new Map<string,LivingMapAggregateItem[]>();
  for(const item of projection.items)byKey.set(item.key,[...(byKey.get(item.key)??[]),item]);
  const bridge=[...byKey.values()].find(items=>items.some(item=>item.layer==="aroma")&&items.some(item=>item.layer==="taste"));
  if(bridge)patterns.push(`${bridge[0]!.label} was present in both aroma and taste.`);
  const late=events.filter(event=>event.action!=="remove"&&event.elapsedMs>=420_000).sort((a,b)=>a.elapsedMs-b.elapsedMs)[0];
  if(late)patterns.push(`${late.flavorLabel} emerged after minute seven as the tea continued to change.`);
  const removed=events.find(event=>event.action==="remove");
  if(removed)patterns.push(`${removed.flavorLabel} appeared, then receded during the round.`);
  if(projection.items.length>=6&&Math.max(0,...projection.items.map(item=>item.participationRate))<.5)patterns.push("The room remained widely distributed; no single note dominated.");
  return[...new Set(patterns)].slice(0,4);
}

function livingMapPosition(key:string,family:LivingMapFamily){
  const familyIndex=LIVING_MAP_FAMILIES.indexOf(family);
  let hash=2166136261;
  for(let index=0;index<key.length;index+=1){hash^=key.charCodeAt(index);hash=Math.imul(hash,16777619)}
  const jitter=((hash>>>0)%1000)/1000-.5;
  const angle=(familyIndex/LIVING_MAP_FAMILIES.length)*Math.PI*2-Math.PI/2+jitter*.34;
  const distance=27+(((hash>>>10)%1000)/1000)*9;
  return{x:50+Math.cos(angle)*distance,y:50+Math.sin(angle)*distance};
}
