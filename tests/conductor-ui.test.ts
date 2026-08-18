import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path:string){return readFileSync(resolve(process.cwd(),path),"utf8")}
const host=source("src/components/host/HostConsole.tsx");
const rail=source("src/components/host/HostConductorRail.tsx");
const guest=source("src/components/guest/GuestExperience.tsx");
const stageHeader=source("src/components/guest/ConductorStageHeader.tsx");
const video=source("src/components/live/AgoraVideoRoom.tsx");
const communication=source("src/components/live/LiveCommunication.tsx");
const css=source("src/app/globals.css");

describe("conductor live interfaces", () => {
  it("gives the host a compact rail with one primary command and guarded secondary controls", () => {
    expect(host).toContain("<HostConductorRail");
    expect(rail).toContain('onCommand("advance_stage")');
    for(const control of ["Pause","Extend infusion","Go back one stage","Skip this stage","Jump to stage","End tasting…"])expect(rail).toContain(control);
    expect(rail).toContain("window.confirm");
  });

  it("always gives the host a way out without ending the tasting", () => {
    expect(host).toContain('className="live-console-exit"');
    expect(host).toContain('href={`/admin/events/${event.id}`}');
    expect(host).toContain("Exit console without ending the tasting");
    expect(css).toContain(".live-console-exit");
  });

  it("renders every participant stage through the same persistent shell", () => {
    for(const stage of ["prepare","brew","aroma","first_sip","explore","discuss","reveal","debrief","close_tea","transition"])expect(guest).toContain(`conductorStage === "${stage}"`);
    expect(guest).toContain("<ConductorStageHeader");
    expect(guest).toContain('sendStageSignal("ready")');
    expect(guest).toContain('sendStageSignal(signal)');
    expect(stageHeader).toContain('aria-live="polite"');
  });

  it("preserves notes during soft transitions and does not steal focus", () => {
    expect(guest).toContain("shouldHoldGuestTransition");
    expect(guest).toContain("draftRef.current.personalNotes");
    expect(stageHeader).not.toContain(".focus(");
    expect(stageHeader).not.toContain("autoFocus");
  });

  it("changes presentation emphasis without coupling conductor state to Agora media", () => {
    expect(video).toContain("agora-room-emphasis-");
    expect(communication).toContain("live-communication-emphasis-");
    expect(host).toContain("getConductorStage(conductorStage).video");
    expect(css).toContain("agora-room-emphasis-expanded");
    expect(css).toContain("live-communication-emphasis-prominent");
    expect(video).not.toContain("advance_stage");
  });

  it("integrates the Living Tasting Map without coupling it to Agora media state", () => {
    expect(guest).toContain("LivingMapExperience");
    expect(host).toContain("HostLivingTastingMap");
    expect(video).not.toContain("LivingTastingMap");
  });
});
