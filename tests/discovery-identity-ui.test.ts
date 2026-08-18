import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe,expect,it} from "vitest";

const source=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
const profile=source("src/components/dashboard/DiscoveryProfile.tsx");
const reveal=source("src/components/live/LiveIdentityReveal.tsx");
const guest=source("src/components/guest/GuestExperience.tsx");
const command=source("src/app/api/events/[eventId]/command/route.ts");
const route=source("src/app/api/events/[eventId]/discovery-identity/route.ts");
const agora=source("src/components/live/AgoraVideoRoom.tsx");
const css=source("src/app/globals.css");

describe("tea discovery identity interface",()=>{
  it("renders a private discovery portrait with transparent evidence and tasting-card context",()=>{
    expect(profile).toContain("Private discovery profile");
    expect(profile).toContain("Account-only");
    expect(profile).toContain("Why you earned this");
    expect(profile).toContain("Contributing tasting cards");
    expect(profile).toContain("Feature up to two");
    expect(profile).toContain("Hidden identities");
  });

  it("visually and verbally separates playful identity from formal certification and loyalty",()=>{
    expect(profile).toContain("Separate formal pathway");
    expect(profile).toContain("They are not Tea Practitioner, Tea Expert, Sommelier, or accredited credentials");
    expect(profile).not.toMatch(/Gold Leaves balance|palate score:|community rank/i);
  });

  it("reveals only after event completion and defers for Agora speech or ceremony",()=>{
    expect(guest).toContain('active={state.event.status==="completed"||state.event.phase==="ended"}');
    expect(reveal).toContain("AGORA_SPEECH_ACTIVITY_EVENT");
    expect(reveal).toContain("isIdentityRevealSuppressed");
    expect(reveal).toContain("sessionStorage");
    expect(reveal).toContain("Turn off future reveals");
    expect(reveal).toContain("What this reflects");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });

  it("keeps identity reconciliation optional and participant-private",()=>{
    expect(command).toContain('logger.warn("discovery_identity_processing_deferred"');
    expect(route).toContain("participant.user_id");
    expect(route).toContain("The tasting is unaffected");
    expect(route).not.toMatch(/participants.*select.*display_name|leaderboard|rank/i);
  });

  it("does not modify Agora media authority or use speaking volume as evidence",()=>{
    expect(agora).not.toMatch(/discovery.identity|reputation|identity score/i);
    expect(reveal).toContain("AGORA_SPEECH_ACTIVITY_EVENT");
    expect(reveal).toContain("setSpeechActive");
  });
});
