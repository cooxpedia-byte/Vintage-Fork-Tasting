import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe,expect,it} from "vitest";

const source=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
const guest=source("src/components/live/ConversationPromptCard.tsx");
const host=source("src/components/host/HostConversationPrompts.tsx");
const guestExperience=source("src/components/guest/GuestExperience.tsx");
const breakouts=source("src/components/host/HostBreakoutPanel.tsx");

describe("conversation prompt surfaces",()=>{
  it("keeps one dismissible prompt secondary to the participant experience",()=>{
    for(const label of ["Another question","Keep this","Save curiosity","Ask host","No answer is collected"]){expect(guest).toContain(label)}
    expect(guest).not.toContain("input");
    expect(guest).not.toContain("textarea");
  });

  it("shows prompts only after a breakout media room exists",()=>{
    expect(guestExperience).toContain("active={!breakoutMemberActive||Boolean(breakoutMediaRoomId)}");
    expect(breakouts).toContain("A stage-aware optional prompt appears only after Agora connects");
  });

  it("keeps host ideas private until a deliberate send",()=>{
    expect(host).toContain("Private host view");
    expect(host).toContain("Send to main room");
    expect(host).toContain("Send to small tables");
    expect(host).not.toContain("AgoraVideoRoom");
    expect(guest).not.toContain("AGORA_SPEECH_ACTIVITY_EVENT");
  });
});
