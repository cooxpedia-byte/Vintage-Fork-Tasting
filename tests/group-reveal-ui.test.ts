import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
const reveal=source("src/components/live/GroupDiscoveryReveal.tsx");
const host=source("src/components/host/HostGroupRevealPanel.tsx");
const guest=source("src/components/guest/GuestExperience.tsx");
const css=source("src/app/globals.css");

describe("group discovery reveal interface",()=>{
  it("starts quietly and collects aroma independently",()=>{
    expect(reveal).toContain("observations stay private");
    expect(reveal).toContain("still covered");
    expect(guest).toContain("aromaDescriptors");
    expect(guest).toContain("How strongly?");
    expect(guest).toContain("Add to private card");
  });

  it("uses explicit aroma/taste markers and a text equivalent",()=>{
    expect(reveal).toContain('marker="A"');
    expect(reveal).toContain('marker="T"');
    expect(reveal).toContain("A×T");
    expect(reveal).toContain("Pattern details");
    expect(css).toContain("repeating-linear-gradient");
    expect(css).toContain("group-reveal-layer-taste");
  });

  it("gives the host staged controls without touching Agora state",()=>{
    for(const command of ["reveal_group_aroma","reveal_group_taste","combine_group_reveal","show_group_timeline","freeze_group_fingerprint","return_group_discussion"])expect(host).toContain(command);
    expect(host).toContain("Chat, tea reactions, and Agora video stay available throughout.");
    expect(host).not.toContain("agora-rtc-sdk-ng");
  });

  it("integrates room cards, true-time timeline, private comparison, and separate producer context",()=>{
    expect(reveal).toContain("What the tables carried back");
    expect(reveal).toContain("dateTime={event.occurredAt}");
    expect(reveal).toContain("My Tasting / Our Tasting");
    expect(reveal).toContain("Producer / host context · separate source");
    expect(reveal).toContain("one sourced perspective for comparison");
    expect(guest).toContain("Add later observation");
    expect(guest).toContain("timestamped as post-reveal");
  });

  it("supports reduced motion and incomplete observations",()=>{
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(reveal).toContain("DISCOVERY_FIRST_COPY.emptyObservation");
    expect(reveal).toContain("Small group · detailed counts are limited.");
  });
});
