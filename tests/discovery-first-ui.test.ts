import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe,expect,it} from "vitest";

const source=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
const guest=source("src/components/guest/GuestExperience.tsx");
const host=source("src/components/host/HostConsole.tsx");
const reveal=source("src/components/live/GroupDiscoveryReveal.tsx");
const communication=source("src/components/live/LiveCommunication.tsx");
const roomCard=source("src/components/live/RoomDiscoveryCard.tsx");

describe("discovery-first live interface",()=>{
  it("keeps First Sip private, quiet, and free of expected descriptors",()=>{
    expect(guest).toContain("DISCOVERY_FIRST_COPY.firstSip");
    expect(guest).toContain("DISCOVERY_FIRST_COPY.noExpectedFlavor");
    expect(guest).toContain("Add observation");
    expect(guest).not.toContain("there are no wrong answers");
  });

  it("places the tea experience before Agora after arrival",()=>{
    expect(guest).toContain('{peopleFirst&&videoRoom}{content}{!peopleFirst&&videoRoom}{supportingLayers}');
    expect(host.indexOf("{peopleFirst&&hostVideo}")).toBeLessThan(host.indexOf("{!peopleFirst&&hostVideo}"));
    expect(host).toContain('liveAttentionOrder(conductorStage)==="people-first"');
  });

  it("uses discovery language for reveal, silence, and varied table portraits",()=>{
    expect(reveal).toContain("Patterns without grading");
    expect(reveal).toContain("one sourced perspective for comparison");
    expect(reveal).not.toContain("results stay private");
    expect(reveal).not.toContain("answer key");
    expect(communication).toContain("The room is quiet for now.");
    expect(roomCard).toContain("This group experienced the tea in many different ways.");
  });
});
