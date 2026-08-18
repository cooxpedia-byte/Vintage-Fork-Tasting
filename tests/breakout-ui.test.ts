import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe,expect,it} from "vitest";

const source=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
const guest=source("src/components/guest/GuestExperience.tsx");
const prompt=source("src/components/live/ConversationPromptCard.tsx");
const host=source("src/components/host/HostBreakoutPanel.tsx");
const agora=source("src/components/live/AgoraVideoRoom.tsx");
const communication=source("src/app/api/events/[eventId]/communication/route.ts");

describe("small tasting room interface",()=>{
  it("gives guests a clear transition, one post-connect prompt, a persistent tea, signals, a discovery card, and early return",()=>{
    for(const copy of ["You’re joining Tasting Table","Your private notes and tea tools stay here","Tea on the table","More time","Our Table","Return to main tasting early"])expect(guest).toContain(copy);
    for(const copy of ["Optional conversation prompt","Ask host","Another question"])expect(prompt).toContain(copy);
    expect(guest.indexOf("ConversationPromptCard")).toBeLessThan(guest.indexOf("function BreakoutRoomStage"));
    expect(guest).toContain("Stay in the main tasting");
    expect(guest).toContain("auto-return");
  });

  it("gives the host setup, table health, extension, broadcast guidance, return, and a visible privacy boundary",()=>{
    for(const copy of ["People per table","Shuffle","Remix across teas","Open tasting tables","+1 minute","+2 minutes","Bring back now","Use Broadcast","Privacy boundary"] )expect(host).toContain(copy);
    expect(host).toContain("never private notes, spoken transcripts, or table chat");
  });

  it("moves Agora channels while preserving local tracks and scopes chat and reactions",()=>{
    expect(agora).toContain("publishPreservedTracks");
    expect(agora.indexOf("const credentials=await fetchToken(targetBreakoutRoomId)")).toBeLessThan(agora.indexOf("await releaseClient();",agora.indexOf("async function transitionRoom")));
    expect(agora).toContain("Moving to your tasting table");
    expect(agora).toContain("Bringing everyone back to the main tasting");
    expect(communication).toContain("breakout_room_id");
    expect(communication).toContain("message_kind.eq.broadcast");
  });
});
