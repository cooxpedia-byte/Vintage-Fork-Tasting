import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe,expect,it} from "vitest";

const source=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
const guest=source("src/components/guest/GuestExperience.tsx");
const host=source("src/components/host/HostDiscoveryPanel.tsx");
const card=source("src/components/live/RoomDiscoveryCard.tsx");

describe("room discovery card interface",()=>{
  it("offers a final-minute one-screen editor with non-judgmental groups, autosave, and voluntary sharing",()=>{
    for(const copy of ["Our Table","Final minute","Shared","Unique","Changed","Contrasting","Curious","Auto-saved suggestions","I’ll share for us","Withdraw","The card works without a speaker"])expect(guest).toContain(copy);
    expect(guest).toContain("window.setTimeout");
    expect(card).toContain("This group experienced the tea in many different ways.");
  });

  it("gives the host collapsed cards, open/compare, curiosity, private invitations, and cross-room language",()=>{
    for(const copy of ["Room discoveries","Compare","Surface curiosity","Invite privately","Next table","Close cards","Appeared across rooms","Found at one table","Presentation boundary"])expect(host).toContain(copy);
    expect(host).not.toMatch(/\bCorrect\b|\bWrong\b|\bOutlier\b/);
  });

  it("gives invited presenters an accessible accept/pass cue and keeps tea-native communication outside the card",()=>{
    for(const copy of ["Private cue","I’m ready","Pass","talking points, not a script","Pass / Cancel"])expect(guest).toContain(copy);
    expect(guest).toContain("LiveCommunication");
  });
});
