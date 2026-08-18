import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe,expect,it} from "vitest";

const source=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
const guest=source("src/components/live/LiveGoldLeaves.tsx");
const guestExperience=source("src/components/guest/GuestExperience.tsx");
const host=source("src/components/host/HostLiveRewardsControl.tsx");
const agora=source("src/components/live/AgoraVideoRoom.tsx");
const feedback=source("src/components/InterfaceFeedback.tsx");
const css=source("src/app/globals.css");
const route=source("src/app/api/events/[eventId]/live-rewards/route.ts");

describe("Gold Leaves live interface",()=>{
  it("shows only the participant's private canonical balance and current-event confirmation",()=>{
    expect(guest).toContain("Your private Gold Leaves balance");
    expect(guest).toContain("New balance");
    expect(guest).toContain("sessionStorage");
    expect(route).toContain("userId:participant.user_id??null");
    expect(guest).not.toMatch(/leaderboard|another participant|earnings rank/i);
  });

  it("defers animation for sensory stages, Cheers, and Agora-detected speech",()=>{
    expect(guest).toContain("isRewardPresentationSuppressed");
    expect(guestExperience).toContain("cheersActive={cheersActive}");
    expect(agora).toContain("AGORA_SPEECH_ACTIVITY_EVENT");
    expect(agora).toContain("AGORA_ACTIVE_SPEAKER_LEVEL");
    expect(css).toContain("gold-leaf-settle");
  });

  it("gives hosts mode and audited completion controls without arbitrary values or rankings",()=>{
    expect(host).toContain('snapshot.enabled?"on":"off"');
    expect(host).toContain("set_reward_mode");
    expect(host).toContain("grant_reward_completion");
    expect(host).toContain("centrally configured amount");
    expect(host).not.toMatch(/type="number"|leaderboard|rank rooms/i);
  });

  it("uses text-equivalent, reduced-motion, optional leaf/paper feedback",()=>{
    expect(guest).toContain('role="status"');
    expect(guest).toContain("playGoldLeafRewardFeedback");
    expect(feedback).toContain("goldLeafRewardFeedback");
    expect(feedback).toContain("navigator.vibrate(14)");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain(".gold-leaf-settle { display: none;");
  });

  it("does not ship pickups or attach rewards to Cheers, reactions, or flavor volume in MVP",()=>{
    expect(host).toContain("No Leaves are paid for flavors, chat, reactions, speaking, breakouts, spokesperson roles, or Cheers");
    expect(guest).not.toMatch(/pickup|collect leaf|countdown/i);
  });

  it("fails closed when the canonical loyalty schema is not installed",()=>{
    expect(route).toContain("isMissingRewardSchema");
    expect(route).toContain("available:false");
    expect(route).toContain("PGRST205");
  });
});
