import { describe, expect, it } from "vitest";
import { buildPrivateComparison, buildRevealLayer, buildRevealOverlap, type SensoryResponseInput } from "@/lib/group-reveal";

function response(participantId:string,aromaDescriptors:string[],tasteDescriptors:string[],aromaIntensity:SensoryResponseInput["aromaIntensity"]="clear",tasteIntensity:SensoryResponseInput["tasteIntensity"]="clear"):SensoryResponseInput{
  return{participantId,aromaDescriptors,aromaIntensity,tasteDescriptors,tasteIntensity};
}

describe("group discovery aggregation",()=>{
  it("uses prevalence for breadth and the median report for heat",()=>{
    const layer=buildRevealLayer([
      response("one",["Honeyed"],[],"clear"),
      response("two",["Honeyed"],[],"clear"),
      response("three",["Honeyed"],[],"clear"),
      response("four",["Honeyed","Smoke"],[],"dominant")
    ],"aroma");
    const honeyed=layer.items.find(item=>item.label==="Honeyed")!;
    const smoke=layer.items.find(item=>item.label==="Smoke")!;
    expect(honeyed.breadth).toBe(100);
    expect(honeyed.medianIntensity).toBe(65);
    expect(honeyed.averageIntensity).toBe(71);
    expect(smoke.breadth).toBe(25);
    expect(smoke.heat).toBe(90);
    expect(smoke.prominence).toBeLessThan(honeyed.prominence);
  });

  it("keeps aroma and taste independent while deriving an explicit overlap",()=>{
    const inputs=[response("one",["Orchid","Honeyed"],["Honeyed","Mineral"]),response("two",["Orchid"],["Mineral"])];
    const aroma=buildRevealLayer(inputs,"aroma");
    const taste=buildRevealLayer(inputs,"taste");
    expect(aroma.items.map(item=>item.label)).toContain("Orchid");
    expect(taste.items.map(item=>item.label)).not.toContain("Orchid");
    expect(buildRevealOverlap(aroma,taste).map(item=>item.label)).toEqual(["Honeyed"]);
  });

  it("labels single reports neutrally and suppresses small-group drill-down",()=>{
    const layer=buildRevealLayer([response("one",["Jasmine"],[]),response("two",["Cedar"],[])],"aroma");
    expect(layer.items.every(item=>item.strengthLabel==="Unique observation")).toBe(true);
    expect(layer.items.every(item=>item.detailsSuppressed)).toBe(true);
    expect(JSON.stringify(layer)).not.toMatch(/outlier|wrong|correct|missed/i);
  });

  it("compares only the participant's own card with anonymous group keys",()=>{
    const own=response("one",["Orchid","Jasmine"],["Mineral"]);
    const aroma=buildRevealLayer([own,response("two",["Orchid"],["Honeyed"])],"aroma");
    const taste=buildRevealLayer([own,response("two",["Orchid"],["Honeyed"])],"taste");
    expect(buildPrivateComparison(own,aroma,taste)).toEqual({
      aroma:{shared:["Orchid"],personal:["Jasmine"]},
      taste:{shared:[],personal:["Mineral"]}
    });
  });
});
