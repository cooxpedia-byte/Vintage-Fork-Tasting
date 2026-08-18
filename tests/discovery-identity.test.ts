import {describe,expect,it} from "vitest";
import {EMPTY_DISCOVERY_METRICS,formatIdentityEarnedDate,isIdentityRevealSuppressed} from "@/lib/discovery-identity";

describe("tea discovery identity presentation rules",()=>{
  it("suppresses post-tasting identity presentation during critical tea and conversation moments",()=>{
    expect(isIdentityRevealSuppressed("first_sip",false,false)).toBe(true);
    expect(isIdentityRevealSuppressed("reveal",false,false)).toBe(true);
    expect(isIdentityRevealSuppressed("debrief",true,false)).toBe(true);
    expect(isIdentityRevealSuppressed("debrief",false,true)).toBe(true);
    expect(isIdentityRevealSuppressed("debrief",false,false)).toBe(false);
  });

  it("starts a private discovery portrait at zero without inventing status",()=>{
    expect(EMPTY_DISCOVERY_METRICS).toEqual({
      teasExplored:0,teaTypeCount:0,originCount:0,liveTastingsCompleted:0,
      teaTypeDistribution:{},origins:[],descriptorFamilyDistribution:{},sourceMetricsVersion:"discovery-v1"
    });
  });

  it("formats an earned date as human-readable history",()=>{
    expect(formatIdentityEarnedDate("2026-08-18T12:00:00.000Z")).toContain("2026");
  });
});
