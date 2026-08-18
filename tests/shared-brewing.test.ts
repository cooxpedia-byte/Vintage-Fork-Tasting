import { describe,expect,it } from "vitest";
import {
  sharedBrewCountdownMs,
  sharedBrewMilestone,
  sharedBrewPhase,
  sharedBrewRemainingMs,
  sharedBrewStatusCopy,
  type SharedBrew
} from "@/lib/shared-brewing";

const start=Date.parse("2026-08-18T00:00:03.000Z");
const brew:SharedBrew={
  id:"brew",event_id:"event",event_flight_item_id:"tea",infusion_number:1,
  started_at:new Date(start).toISOString(),duration_ms:180_000,status:"running",
  paused_at:null,accumulated_pause_ms:0,host_id:"host",completed_at:null
};

describe("shared brewing clock",()=>{
  it("derives countdown and remaining time from one authoritative timestamp",()=>{
    expect(sharedBrewCountdownMs(brew,start-3_000)).toBe(3_000);
    expect(sharedBrewPhase(brew,start-3_000)).toBe("countdown");
    expect(sharedBrewRemainingMs(brew,start)).toBe(180_000);
    expect(sharedBrewPhase(brew,start)).toBe("running");
    expect(sharedBrewRemainingMs(brew,start+180_000)).toBe(0);
    expect(sharedBrewPhase(brew,start+180_000)).toBe("complete");
  });

  it("freezes a paused brew and accounts for accumulated pause time",()=>{
    const paused={...brew,status:"paused" as const,paused_at:new Date(start+60_000).toISOString(),accumulated_pause_ms:12_000};
    expect(sharedBrewRemainingMs(paused,start+120_000)).toBe(132_000);
    expect(sharedBrewPhase(paused,start+120_000)).toBe("paused");
  });

  it("announces restrained milestones and uses tasting language",()=>{
    expect(sharedBrewMilestone(31,30)).toBe("30 seconds remaining. Prepare to pour.");
    expect(sharedBrewMilestone(11,10)).toBe("10 seconds remaining.");
    expect(sharedBrewMilestone(4,3)).toBe("3 seconds remaining.");
    expect(sharedBrewMilestone(1,0)).toBe("Infusion complete. Pour now.");
    expect(sharedBrewMilestone(9,8)).toBe("");
    expect(sharedBrewStatusCopy("complete")).toBe("Infusion complete · Pour now");
  });
});
