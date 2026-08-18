import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe,expect,it} from "vitest";

const source=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
const guest=source("src/components/guest/GuestExperience.tsx");
const overlay=source("src/components/live/VirtualTeaCheers.tsx");
const host=source("src/components/host/HostCheersControl.tsx");
const feedback=source("src/components/InterfaceFeedback.tsx");
const css=source("src/app/globals.css");
const helpers=source("src/lib/cheers.ts");

describe("Virtual Tea Cheers interface",()=>{
  it("gives the host one primary button with optional sparse presets",()=>{
    expect(host).toContain(">Cheers</button>");
    expect(host).toContain("Cheers settings");
    expect(host).toContain("[5,8,10]");
    expect(helpers).toContain('first_sip:"First Sip"');
    expect(helpers).toContain('welcome_back:"Welcome Back"');
    expect(helpers).toContain('final:"Final Cheers"');
    expect(host).toContain("aggregate only");
    expect(host).not.toMatch(/did not|nonparticipant|threshold|leaderboard/i);
  });

  it("raises the personal cup optimistically before waiting for the network",()=>{
    const optimistic=overlay.indexOf("setSnapshot(current=>");
    const request=overlay.indexOf("void fetch(`/api/events/${eventId}/cheers`");
    expect(optimistic).toBeGreaterThan(0);
    expect(request).toBeGreaterThan(optimistic);
    expect(overlay).toContain("Your cup is raised.");
    expect(overlay).not.toMatch(/try again|failed|error/i);
  });

  it("resolves from shared timestamps with accessible text and reduced-motion support",()=>{
    expect(overlay).toContain("cheersBeat(snapshot,now)");
    expect(overlay).toContain('role="status"');
    expect(overlay).toContain("The room raises its cups together. Clink.");
    expect(overlay).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain(".virtual-tea-cheers");
    expect(css).toContain(".virtual-tea-cheers,.virtual-tea-cheers * { animation: none");
  });

  it("keeps Agora visible and softens tea chat without taking media authority",()=>{
    expect(guest).toContain('emphasis={cheersActive?"quiet":conductorDefinition.communication}');
    expect(guest).toContain("(!['recap','ended'].includes(state.event.phase)||cheersActive)");
    expect(overlay).not.toContain("agora-rtc-sdk-ng");
    expect(host).toContain("Agora stays live");
    expect(guest).toContain("VirtualTeaCheers");
  });

  it("honors global sound choice and uses optional mobile or web haptics",()=>{
    expect(guest).toContain("feedbackEnabled={sound}");
    expect(feedback).toContain("playTeaCheersFeedback");
    expect(feedback).toContain("VintageForkMobile");
    expect(feedback).toContain("navigator.vibrate");
    expect(feedback).toContain('kind==="personal"?8:18');
  });
});
