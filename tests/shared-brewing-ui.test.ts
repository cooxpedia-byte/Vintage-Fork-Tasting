import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe,expect,it } from "vitest";

const source=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
const timer=source("src/components/live/SharedBrewingTimer.tsx");
const guest=source("src/components/guest/GuestExperience.tsx");
const rail=source("src/components/host/HostConductorRail.tsx");
const css=source("src/app/globals.css");

describe("shared brewing experience",()=>{
  it("uses the existing mechanical timer with a shared countdown and restrained feedback",()=>{
    expect(timer).toContain("<SplitFlapTimer");
    expect(timer).toContain('phase === "countdown"');
    expect(timer).toContain('playVintageTimerEvent("startMechanical"');
    expect(timer).toContain('playVintageTimerEvent("timerCompletePrimary"');
    expect(timer).toContain('role="status" aria-live="polite"');
    expect(timer).toContain('wakeLock?.request("screen")');
    expect(css).toContain("shared-brew-steam");
    expect(css).toContain(".shared-brew-machine { position: relative; isolation: isolate; width: 100%");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });

  it("keeps tea guidance, video-adjacent status, and infusion notes on the participant stage",()=>{
    for(const copy of ["Shared brew","Infusion","I’m pouring","Decanted / ready","These signals help the host feel the room"]){
      expect(guest).toContain(copy);
    }
    expect(guest).toContain("<InfusionNote");
    expect(guest).toContain("/brew-note");
  });

  it("gives the host one dominant start and guarded recovery controls",()=>{
    expect(rail).toContain('onCommand("start_brew"');
    expect(rail).toContain("3–2–1 countdown");
    expect(rail).toContain("[15,30,60]");
    expect(rail).toContain("+{seconds}s");
    for(const control of ["End brew early…","Restart infusion…","Start next infusion","Open Aroma"]){
      expect(rail).toContain(control);
    }
    expect(rail).toContain("window.confirm");
  });
});
