export type BreakoutAssignmentMode="shuffle"|"remix";
export type BreakoutSessionStatus="preparing"|"active"|"returning"|"complete"|"cancelled";
export type BreakoutMemberStatus="assigned"|"joining"|"connected"|"left"|"returned"|"failed"|"stayed_main";
export type BreakoutSignal="help"|"more_time"|"ready";

export type BreakoutSession={
  id:string;event_id:string;event_flight_item_id:string;origin_stage:string;
  status:BreakoutSessionStatus;room_size:number;assignment_mode:BreakoutAssignmentMode;
  prompt:string;starts_at:string;ends_at:string;host_id:string;completed_at:string|null;
};

export type BreakoutRoom={
  id:string;session_id:string;event_id:string;room_number:number;prompt:string;
  status:"open"|"returning"|"closed";snapshot:string|null;
};

export type BreakoutMember={id:string;displayName:string;status:BreakoutMemberStatus};

export type BreakoutState={
  session:BreakoutSession;
  room:BreakoutRoom;
  members:BreakoutMember[];
  memberStatus:BreakoutMemberStatus;
  signal:BreakoutSignal|null;
};

export const BREAKOUT_PROMPTS=[
  "What was the first thing you noticed?",
  "Did aroma and taste lead you in the same direction?",
  "Has anything changed as the tea cools?",
  "Is anyone getting something completely different?",
  "Can you sense something you cannot quite name?",
  "Does this tea remind you of anything?",
  "Did hearing the others change what you noticed?"
] as const;

export function breakoutRoomSizes(participantCount:number,targetSize:number){
  const count=Math.max(0,Math.trunc(participantCount));
  if(count<2)return[];
  const target=Math.min(4,Math.max(2,Math.trunc(targetSize)||3));
  const minimumRooms=Math.ceil(count/4);
  const maximumRooms=Math.floor(count/2);
  const roomCount=Math.min(maximumRooms,Math.max(minimumRooms,Math.round(count/target)));
  const base=Math.floor(count/roomCount);
  const larger=count%roomCount;
  return Array.from({length:roomCount},(_,index)=>base+(index<larger?1:0));
}

function seededScore(value:string,seed:string){
  let hash=2166136261;
  const input=`${seed}:${value}`;
  for(let index=0;index<input.length;index+=1){hash^=input.charCodeAt(index);hash=Math.imul(hash,16777619)}
  return hash>>>0;
}

export function breakoutPairKey(left:string,right:string){return left<right?`${left}:${right}`:`${right}:${left}`}

export function breakoutPriorPairs(previousRooms:string[][]){
  const pairs:Record<string,number>={};
  for(const room of previousRooms){
    for(let left=0;left<room.length;left+=1){
      for(let right=left+1;right<room.length;right+=1){
        const key=breakoutPairKey(room[left]!,room[right]!);
        pairs[key]=(pairs[key]??0)+1;
      }
    }
  }
  return pairs;
}

export function assignBreakoutRooms({
  participantIds,targetSize=3,mode="shuffle",priorPairs={},seed
}:{
  participantIds:string[];targetSize?:number;mode?:BreakoutAssignmentMode;
  priorPairs?:Record<string,number>;seed:string;
}){
  const participants=[...new Set(participantIds)].sort((left,right)=>seededScore(left,seed)-seededScore(right,seed));
  const sizes=breakoutRoomSizes(participants.length,targetSize);
  if(!sizes.length)return[];
  if(mode==="shuffle"){
    let cursor=0;
    return sizes.map(size=>{const room=participants.slice(cursor,cursor+size);cursor+=size;return room});
  }
  const histories=new Map(participants.map(id=>[id,participants.reduce((sum,other)=>sum+(other===id?0:(priorPairs[breakoutPairKey(id,other)]??0)),0)]));
  const ordered=[...participants].sort((left,right)=>(histories.get(right)??0)-(histories.get(left)??0)||seededScore(left,seed)-seededScore(right,seed));
  const rooms=sizes.map(()=>[] as string[]);
  for(const participant of ordered){
    let best=0;let bestPenalty=Number.POSITIVE_INFINITY;
    rooms.forEach((room,index)=>{
      if(room.length>=sizes[index]!)return;
      const repeatPenalty=room.reduce((sum,member)=>sum+(priorPairs[breakoutPairKey(participant,member)]??0),0)*100;
      const fillPenalty=room.length/Math.max(1,sizes[index]!);
      const tie=seededScore(`${participant}:${index}`,seed)/0xffffffff/1000;
      const penalty=repeatPenalty+fillPenalty+tie;
      if(penalty<bestPenalty){bestPenalty=penalty;best=index}
    });
    rooms[best]!.push(participant);
  }
  return rooms;
}

export function breakoutRemainingMs(session:Pick<BreakoutSession,"ends_at"|"status">,now:number){
  if(["complete","cancelled"].includes(session.status))return 0;
  return Math.max(0,new Date(session.ends_at).getTime()-now);
}

export function breakoutMilestone(previousSeconds:number|null,seconds:number){
  if(previousSeconds===null||seconds>=previousSeconds)return"";
  if(previousSeconds>60&&seconds<=60)return"One minute remains at your small table.";
  if(previousSeconds>15&&seconds<=15)return"A final sip or final thought before the tables return.";
  if(previousSeconds>0&&seconds===0)return"Bringing the tables back together.";
  return"";
}
