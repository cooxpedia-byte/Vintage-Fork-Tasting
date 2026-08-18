import {describe,expect,it} from "vitest";
import {
  customFlavorTextIssue,livingMapElapsedMs,livingMapGroupVisible,livingMapPatterns,livingMapReplayManifest,
  livingMapReplayPositionMs,livingMapReplayProjection,projectLivingMap,type LivingMapObservationEvent,type LivingMapSession
} from "@/lib/living-tasting-map";

function observation(overrides:Partial<LivingMapObservationEvent>={}):LivingMapObservationEvent{return{
  id:"event-1",participantKey:"participant-private-id",layer:"aroma",flavorKey:"orchid",flavorLabel:"Orchid",family:"floral",
  isCustom:false,intensity:60,action:"add",elapsedMs:1_000,serverTime:"2026-08-18T18:00:01.000Z",...overrides
};}

function session(overrides:Partial<LivingMapSession>={}):LivingMapSession{return{
  id:"map-1",eventId:"event-1",eventFlightItemId:"tea-1",status:"live",durationSeconds:720,visibilityMode:"quiet_start",
  customNotesEnabled:true,startedAt:"2026-08-18T18:00:00.000Z",pausedAt:null,accumulatedPauseMs:0,frozenAt:null,
  replayStartedAt:null,replayPausedAt:null,replayPositionMs:0,replayDurationSeconds:40,version:1,...overrides
};}

describe("Living Tasting Map projector",()=>{
  it("derives size, brightness inputs, softness, and deterministic aroma/taste overlap",()=>{
    const events=[
      observation(),
      observation({id:"event-2",participantKey:"participant-2",intensity:100,elapsedMs:2_000,serverTime:"2026-08-18T18:00:02.000Z"}),
      observation({id:"event-3",participantKey:"participant-3",layer:"taste",intensity:40,elapsedMs:3_000,serverTime:"2026-08-18T18:00:03.000Z"})
    ];
    const projection=projectLivingMap(events,4,10_000);
    const aroma=projection.items.find(item=>item.layer==="aroma")!;
    const taste=projection.items.find(item=>item.layer==="taste")!;
    expect(aroma.participationRate).toBe(.5);
    expect(aroma.averageIntensity).toBe(80);
    expect(aroma.intensitySpread).toBe(20);
    expect(aroma.radius).toBeGreaterThan(taste.radius);
    expect({x:aroma.x,y:aroma.y}).toEqual({x:taste.x,y:taste.y});
  });

  it("reconstructs any moment from immutable add, update, and remove events",()=>{
    const manifest=livingMapReplayManifest([
      observation(),
      observation({id:"event-2",action:"update",intensity:85,elapsedMs:120_000,serverTime:"2026-08-18T18:02:00.000Z"}),
      observation({id:"event-3",action:"remove",elapsedMs:300_000,serverTime:"2026-08-18T18:05:00.000Z"})
    ]);
    expect(livingMapReplayProjection(manifest,3,200_000).items[0]?.averageIntensity).toBe(85);
    expect(livingMapReplayProjection(manifest,3,400_000).items).toHaveLength(0);
    expect(JSON.stringify(manifest)).not.toContain("participant-private-id");
    expect(manifest.every(event=>event.participantKey==="p1")).toBe(true);
  });

  it("honours quiet-start windows and pause-safe synchronized time",()=>{
    expect(livingMapGroupVisible(session(),15_000)).toBe(false);
    expect(livingMapGroupVisible(session(),60_000)).toBe(true);
    expect(livingMapGroupVisible(session(),100_000)).toBe(false);
    expect(livingMapGroupVisible(session({visibilityMode:"shared_live"}),1_000)).toBe(true);
    expect(livingMapElapsedMs(session({pausedAt:"2026-08-18T18:03:00.000Z"}),Date.parse("2026-08-18T18:10:00.000Z"))).toBe(180_000);
    expect(livingMapReplayPositionMs(session({status:"replaying",replayStartedAt:"2026-08-18T18:10:00.000Z",replayPositionMs:180_000}),Date.parse("2026-08-18T18:10:10.000Z"))).toBe(360_000);
  });

  it("generates neutral pattern statements without grading participants",()=>{
    const events=[observation(),observation({id:"event-2",layer:"taste",elapsedMs:450_000,flavorKey:"mineral",flavorLabel:"Mineral",family:"mineral",serverTime:"2026-08-18T18:07:30.000Z"})];
    const patterns=livingMapPatterns(events,projectLivingMap(events,4,720_000));
    expect(patterns.join(" ")).toContain("first minute");
    expect(patterns.join(" ")).toContain("after minute seven");
    expect(patterns.join(" ")).not.toMatch(/correct|wrong|score|outlier/i);
    expect(customFlavorTextIssue("Rain on stone")).toBeNull();
  });
});
