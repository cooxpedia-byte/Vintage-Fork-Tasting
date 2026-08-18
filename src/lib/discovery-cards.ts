export type DiscoveryCategory="shared"|"unique"|"changed"|"contrasting";
export type DiscoveryItemSource="structured"|"participant";
export type SpokespersonState="none"|"volunteered"|"invited"|"accepted"|"passed"|"shared";

export type StructuredDiscoveryObservation={
  participantId:string;
  firstImpression:string|null;
  descriptors:string[];
  intensity:string|null;
};

export type StructuredDiscoveryRevision={
  participantId:string;
  createdAt:string;
  firstImpression:string|null;
  descriptors:string[];
  intensity:string|null;
};

export type DiscoverySuggestion={
  category:DiscoveryCategory;
  text:string;
  normalizedKey:string;
  prevalenceCount:number|null;
  prevalenceTotal:number;
  attributionParticipantId:string|null;
};

export type DiscoveryCardItem={
  id:string;
  category:DiscoveryCategory;
  text:string;
  normalizedKey:string;
  source:DiscoveryItemSource;
  prevalenceCount:number|null;
  prevalenceTotal:number;
};

export type DiscoveryCard={
  id:string;
  breakoutRoomId:string;
  roomNumber:number;
  participantCount:number;
  shared:DiscoveryCardItem[];
  unique:DiscoveryCardItem[];
  changed:DiscoveryCardItem[];
  contrasting:DiscoveryCardItem[];
  curiosity:string|null;
  roomQuote:string|null;
  quoteAttributed:boolean;
  lockedAt:string|null;
  sourceVersion:number;
  hasSpokesperson:boolean;
  spokespersonState:SpokespersonState;
};

export type DiscoveryBoardState={
  session:{id:string;status:"active"|"returning"|"complete";eventFlightItemId:string;completedAt:string|null};
  cards:DiscoveryCard[];
  openCardIds:string[];
  surfacedCuriosityCardId:string|null;
  ownCardId:string|null;
  canEditOwnCard:boolean;
  isOwnSpokesperson:boolean;
  presenterCue:null|{
    cardId:string;
    roomNumber:number;
    state:"invited"|"accepted";
    talkingPoints:string[];
  };
};

export type DiscoveryPattern={
  key:string;
  label:string;
  roomNumbers:number[];
};

export type DiscoveryPatterns={
  acrossRooms:DiscoveryPattern[];
  oneTable:DiscoveryPattern[];
  contrasting:Array<{roomNumber:number;text:string}>;
  curiosities:Array<{roomNumber:number;text:string}>;
};

const JUDGMENT_WORDS=/\b(correct|wrong|outlier|missed|best)\b/i;

function cleanLabel(value:unknown,max=80){
  if(typeof value!=="string")return"";
  return value.replace(/\s+/g," ").trim().slice(0,max);
}

export function discoveryKey(value:string){
  return cleanLabel(value).toLocaleLowerCase("en-CA").replace(/[’']/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,100);
}

function sensoryLabels(observation:Pick<StructuredDiscoveryObservation,"firstImpression"|"descriptors">){
  const labels=[cleanLabel(observation.firstImpression),...observation.descriptors.map(value=>cleanLabel(value))].filter(Boolean);
  const seen=new Set<string>();
  return labels.filter(label=>{const key=discoveryKey(label);if(!key||seen.has(key)||JUDGMENT_WORDS.test(label))return false;seen.add(key);return true});
}

export function generateDiscoverySuggestions(observations:StructuredDiscoveryObservation[],revisions:StructuredDiscoveryRevision[]=[]){
  const current=observations.filter(observation=>observation.participantId);
  const total=current.length;
  const labels=new Map<string,{label:string;participantIds:Set<string>}>();
  for(const observation of current){
    for(const label of sensoryLabels(observation)){
      const key=discoveryKey(label);
      const existing=labels.get(key)??{label,participantIds:new Set<string>()};
      existing.participantIds.add(observation.participantId);
      labels.set(key,existing);
    }
  }
  const ordered=[...labels.entries()].sort(([,left],[,right])=>right.participantIds.size-left.participantIds.size||left.label.localeCompare(right.label,"en-CA"));
  const shared=ordered.filter(([,entry])=>entry.participantIds.size>=2).slice(0,6).map(([key,entry]):DiscoverySuggestion=>({
    category:"shared",text:entry.label,normalizedKey:key,prevalenceCount:entry.participantIds.size,prevalenceTotal:total,attributionParticipantId:null
  }));
  const unique=ordered.filter(([,entry])=>entry.participantIds.size===1).slice(0,3).map(([key,entry]):DiscoverySuggestion=>({
    category:"unique",text:entry.label,normalizedKey:key,prevalenceCount:1,prevalenceTotal:total,attributionParticipantId:[...entry.participantIds][0]??null
  }));

  const changedByKey=new Map<string,{label:string;participantId:string}>();
  const revisionsByParticipant=new Map<string,StructuredDiscoveryRevision[]>();
  for(const revision of revisions){
    const list=revisionsByParticipant.get(revision.participantId)??[];
    list.push(revision);revisionsByParticipant.set(revision.participantId,list);
  }
  for(const [participantId,list] of revisionsByParticipant){
    const orderedRevisions=[...list].sort((left,right)=>new Date(left.createdAt).getTime()-new Date(right.createdAt).getTime());
    if(orderedRevisions.length<2)continue;
    const firstKeys=new Set(sensoryLabels(orderedRevisions[0]!).map(discoveryKey));
    for(const label of sensoryLabels(orderedRevisions.at(-1)!)){
      const key=discoveryKey(label);
      if(!firstKeys.has(key))changedByKey.set(key,{label,participantId});
    }
  }
  const changed=[...changedByKey.entries()].slice(0,3).map(([key,entry]):DiscoverySuggestion=>({
    category:"changed",text:`${entry.label} appeared later`,normalizedKey:`changed-${key}`,prevalenceCount:null,prevalenceTotal:total,attributionParticipantId:entry.participantId
  }));

  const intensities=new Map<string,Set<string>>();
  for(const observation of current){
    const label=cleanLabel(observation.intensity,30);
    if(!label||JUDGMENT_WORDS.test(label))continue;
    const key=discoveryKey(label);const people=intensities.get(key)??new Set<string>();people.add(observation.participantId);intensities.set(key,people);
  }
  const contrasting:DiscoverySuggestion[]=[];
  if(intensities.size>=2){
    const values=[...intensities.keys()].map(key=>key.replaceAll("-"," "));
    contrasting.push({category:"contrasting",text:`${sentenceList(values)} impressions coexisted`,normalizedKey:`intensity-${[...intensities.keys()].sort().join("-")}`,prevalenceCount:null,prevalenceTotal:total,attributionParticipantId:null});
  }
  return[...shared,...unique,...changed,...contrasting];
}

function sentenceList(values:string[]){
  if(values.length<2)return values[0]??"Different";
  if(values.length===2)return`${values[0]} and ${values[1]}`;
  return`${values.slice(0,-1).join(", ")}, and ${values.at(-1)}`;
}

export function buildDiscoveryPatterns(cards:DiscoveryCard[]):DiscoveryPatterns{
  const mentions=new Map<string,{label:string;roomNumbers:Set<number>}>();
  for(const card of cards){
    for(const item of [...card.shared,...card.unique,...card.changed]){
      const key=item.normalizedKey.replace(/^changed-/,"");
      const entry=mentions.get(key)??{label:item.text.replace(/ appeared later$/,""),roomNumbers:new Set<number>()};
      entry.roomNumbers.add(card.roomNumber);mentions.set(key,entry);
    }
  }
  const mapped=[...mentions.entries()].map(([key,entry])=>({key,label:entry.label,roomNumbers:[...entry.roomNumbers].sort((a,b)=>a-b)}));
  return{
    acrossRooms:mapped.filter(pattern=>pattern.roomNumbers.length>1).sort((left,right)=>right.roomNumbers.length-left.roomNumbers.length||left.label.localeCompare(right.label,"en-CA")),
    oneTable:mapped.filter(pattern=>pattern.roomNumbers.length===1).sort((left,right)=>left.label.localeCompare(right.label,"en-CA")),
    contrasting:cards.flatMap(card=>card.contrasting.map(item=>({roomNumber:card.roomNumber,text:item.text}))),
    curiosities:cards.flatMap(card=>card.curiosity?[{roomNumber:card.roomNumber,text:card.curiosity}]:[])
  };
}

export function discoveryCardIsUseful(card:DiscoveryCard){
  return Boolean(card.shared.length||card.unique.length||card.changed.length||card.contrasting.length||card.curiosity||card.roomQuote);
}
