import {describe,expect,it} from "vitest";
import {assignBreakoutRooms,breakoutMilestone,breakoutPairKey,breakoutPriorPairs,breakoutRoomSizes} from "@/lib/breakouts";

describe("small tasting room assignment",()=>{
  it("balances every supported group into intimate tables of two to four",()=>{
    expect(breakoutRoomSizes(2,3)).toEqual([2]);
    expect(breakoutRoomSizes(6,3)).toEqual([3,3]);
    expect(breakoutRoomSizes(9,3)).toEqual([3,3,3]);
    expect(breakoutRoomSizes(20,3)).toEqual([3,3,3,3,3,3,2]);
    for(let count=2;count<=60;count+=1){
      const sizes=breakoutRoomSizes(count,3);
      expect(sizes.reduce((sum,size)=>sum+size,0)).toBe(count);
      expect(sizes.every(size=>size>=2&&size<=4)).toBe(true);
    }
  });

  it("is deterministic for a host command and Remix reduces repeated pairings",()=>{
    const participantIds=["a","b","c","d","e","f"];
    const seed="00000000-0000-4000-8000-000000000001";
    const shuffle=assignBreakoutRooms({participantIds,targetSize:3,mode:"shuffle",seed});
    expect(assignBreakoutRooms({participantIds,targetSize:3,mode:"shuffle",seed})).toEqual(shuffle);
    const priorRooms=[["a","b","c"],["d","e","f"]];
    const priorPairs=breakoutPriorPairs(priorRooms);
    const remix=assignBreakoutRooms({participantIds,targetSize:3,mode:"remix",seed,priorPairs});
    const repeatCost=(rooms:string[][])=>rooms.reduce((total,room)=>total+room.reduce((roomTotal,left,index)=>roomTotal+room.slice(index+1).reduce((sum,right)=>sum+(priorPairs[breakoutPairKey(left,right)]??0),0),0),0);
    expect(repeatCost(remix)).toBeLessThan(repeatCost(priorRooms));
  });

  it("announces only the one-minute, final-thought, and return milestones",()=>{
    expect(breakoutMilestone(61,60)).toContain("One minute");
    expect(breakoutMilestone(16,15)).toContain("final sip");
    expect(breakoutMilestone(1,0)).toContain("back together");
    expect(breakoutMilestone(40,39)).toBe("");
  });
});
