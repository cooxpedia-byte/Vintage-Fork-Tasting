import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe,expect,it} from "vitest";

const source=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
const map=source("src/components/live/LivingTastingMap.tsx");
const experience=source("src/components/live/LivingMapExperience.tsx");
const hostMap=source("src/components/host/HostLivingTastingMap.tsx");
const guest=source("src/components/guest/GuestExperience.tsx");
const host=source("src/components/host/HostConsole.tsx");
const css=source("src/app/globals.css");

describe("Living Tasting Map interfaces",()=>{
  it("makes the map the primary tasting surface while leaving Agora as its existing video layer",()=>{
    expect(guest).toContain("<LivingMapExperience");
    expect(host).toContain("<HostLivingTastingMap");
    expect(guest).toContain("{stageHeader}{mapLayer}{discoveryLayer}{promptLayer}{content}");
    expect(guest).toContain("{content}{!peopleFirst&&videoRoom}");
    expect(map).not.toContain("agora-rtc-sdk-ng");
    expect(experience).not.toContain("agora-rtc-sdk-ng");
  });

  it("exposes separate Aroma and Taste layers plus patterned overlap and a text equivalent",()=>{
    expect(map).toContain('aria-label="Map layers"');
    expect(map).toContain("◎</span> Aroma");
    expect(map).toContain("●</span> Taste");
    expect(map).toContain("living-map-overlap-pattern");
    expect(map).toContain("living-map-overlap");
    expect(map).toContain('className="sr-only"');
    expect(css).toContain("fill:url(#living-map-overlap-pattern)");
  });

  it("supports vocabulary, personal phrases, add/update/remove, and accessible intensity controls",()=>{
    expect(experience).toContain("TEA_DESCRIPTOR_PALETTE");
    expect(experience).toContain("Add my own words");
    expect(experience).toContain("Update observation");
    expect(experience).toContain("Remove observation");
    expect(experience).toContain('type="range" min={0} max={100}');
    expect(experience).toContain('aria-label="Intensity from 0 to 100 degrees"');
    expect(experience).toContain("Increase intensity by five");
  });

  it("gives the host the complete conduct, replay, moderation, and fingerprint workflow",()=>{
    for(const command of ["configure_living_map","start_living_map","pause_living_map","resume_living_map","freeze_living_map","start_living_map_replay","pause_living_map_replay","resume_living_map_replay","seek_living_map_replay","commit_living_map_fingerprint","reopen_living_map"])expect(hostMap).toContain(command);
    expect(hostMap).toContain("Hide from map");
    expect(hostMap).toContain("Neutral pattern statements");
  });

  it("ships quiet-start, mobile bottom-sheet, keyboard, and reduced-motion affordances",()=>{
    expect(map).toContain("Notice privately for a moment.");
    expect(map).toContain('tabIndex={0}');
    expect(map).toContain('event.key==="Enter"||event.key===" "');
    expect(css).toContain(".living-map-input{position:sticky;bottom:0");
    expect(css).toContain("@media(prefers-reduced-motion:reduce)");
  });
});
