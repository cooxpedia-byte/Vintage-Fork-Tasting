import {describe,expect,it} from "vitest";
import {cheersBeat,cheersInvitation,cheersProgress,cheersRichness,cheersSteamCount,defaultCheersContext,type ParticipantCheersSnapshot} from "@/lib/cheers";

const snapshot:ParticipantCheersSnapshot={
  id:"cheers",context:"first_sip",invitation:"Raise your cup.",openedAt:"2026-08-18T00:00:00.000Z",
  closesAt:"2026-08-18T00:00:08.000Z",resolveAt:"2026-08-18T00:00:08.650Z",status:"open",joined:false,richness:"gathering",soundEnabled:true
};

describe("virtual tea Cheers choreography",()=>{
  it("uses ritual-specific invitations without reward language",()=>{
    expect(cheersInvitation("first_sip")).toBe("Raise your cup.");
    expect(cheersInvitation("welcome_back")).toContain("Welcome back");
    expect(cheersInvitation("final")).toContain("discovered together");
    expect(Object.values(["first_sip","welcome_back","final","spontaneous"].map(value=>cheersInvitation(value as Parameters<typeof cheersInvitation>[0]))).join(" ")).not.toMatch(/point|score|reward|streak/i);
  });

  it("derives anonymous room richness rather than exposing a pressure count",()=>{
    expect(cheersRichness(2,10)).toBe("intimate");
    expect(cheersRichness(5,10)).toBe("gathering");
    expect(cheersRichness(7,10)).toBe("full");
    expect(cheersSteamCount("intimate")).toBeLessThan(cheersSteamCount("full"));
  });

  it("moves every device through the same authoritative close and resolve timestamps",()=>{
    expect(cheersBeat(snapshot,Date.parse("2026-08-18T00:00:07.999Z"))).toBe("invitation");
    expect(cheersBeat(snapshot,Date.parse("2026-08-18T00:00:08.100Z"))).toBe("gathering");
    expect(cheersBeat(snapshot,Date.parse("2026-08-18T00:00:08.650Z"))).toBe("clink");
    expect(cheersBeat(snapshot,Date.parse("2026-08-18T00:00:10.301Z"))).toBe("resolved");
    expect(cheersProgress(snapshot,Date.parse("2026-08-18T00:00:04.000Z"))).toBe(.5);
  });

  it("suggests sparse presets from the existing conductor without creating a stage",()=>{
    expect(defaultCheersContext("brew")).toBe("first_sip");
    expect(defaultCheersContext("aroma")).toBe("first_sip");
    expect(defaultCheersContext("discuss")).toBe("welcome_back");
    expect(defaultCheersContext("close_tea")).toBe("final");
  });
});
