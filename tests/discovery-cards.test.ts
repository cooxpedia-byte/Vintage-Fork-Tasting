import {describe,expect,it} from "vitest";
import {buildDiscoveryPatterns,generateDiscoverySuggestions,type DiscoveryCard} from "@/lib/discovery-cards";

describe("room discovery card suggestions",()=>{
  it("preserves overlap, one-person discoveries, change, and contrast without correctness language",()=>{
    const suggestions=generateDiscoverySuggestions([
      {participantId:"a",firstImpression:"Spring garden",descriptors:["Floral","Honey"],intensity:"subtle"},
      {participantId:"b",firstImpression:"Spring garden",descriptors:["Floral"],intensity:"clear"},
      {participantId:"c",firstImpression:"Toasted rice",descriptors:["Toasted rice"],intensity:"dominant"}
    ],[
      {participantId:"a",createdAt:"2026-01-01T00:00:00Z",firstImpression:"Spring garden",descriptors:["Floral"],intensity:"subtle"},
      {participantId:"a",createdAt:"2026-01-01T00:01:00Z",firstImpression:"Spring garden",descriptors:["Floral","Honey"],intensity:"subtle"}
    ]);
    expect(suggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({category:"shared",text:"Floral",prevalenceCount:2,prevalenceTotal:3}),
      expect.objectContaining({category:"shared",text:"Spring garden",prevalenceCount:2}),
      expect.objectContaining({category:"unique",text:"Toasted rice",attributionParticipantId:"c"}),
      expect.objectContaining({category:"changed",text:"Honey appeared later"}),
      expect.objectContaining({category:"contrasting"})
    ]));
    expect(suggestions.map(item=>item.text).join(" ")).not.toMatch(/\b(correct|wrong|outlier|missed|best)\b/i);
  });

  it("filters judgmental labels and compares patterns by table, not by participant",()=>{
    expect(generateDiscoverySuggestions([{participantId:"a",firstImpression:"Best",descriptors:["Wrong","Floral"],intensity:null}]).map(item=>item.text)).toEqual(["Floral"]);
    const card=(roomNumber:number,label:string):DiscoveryCard=>({id:`card-${roomNumber}`,breakoutRoomId:`room-${roomNumber}`,roomNumber,participantCount:3,shared:[{id:`item-${roomNumber}`,category:"shared",text:label,normalizedKey:label.toLowerCase(),source:"structured",prevalenceCount:2,prevalenceTotal:3}],unique:[],changed:[],contrasting:[],curiosity:null,roomQuote:null,quoteAttributed:false,lockedAt:"2026-01-01T00:05:00Z",sourceVersion:1,hasSpokesperson:false,spokespersonState:"none"});
    const patterns=buildDiscoveryPatterns([card(1,"Floral"),card(2,"Floral"),card(3,"Cocoa")]);
    expect(patterns.acrossRooms[0]).toMatchObject({label:"Floral",roomNumbers:[1,2]});
    expect(patterns.oneTable[0]).toMatchObject({label:"Cocoa",roomNumbers:[3]});
  });
});
