import {describe,expect,it} from "vitest";
import {isRewardPresentationSuppressed,liveRewardStatusCopy} from "@/lib/live-rewards";

describe("Gold Leaves live reward presentation",()=>{
  it("defers celebration during critical sensory and shared-room moments",()=>{
    expect(isRewardPresentationSuppressed("aroma",false,false)).toBe(true);
    expect(isRewardPresentationSuppressed("first_sip",false,false)).toBe(true);
    expect(isRewardPresentationSuppressed("reveal",false,false)).toBe(true);
    expect(isRewardPresentationSuppressed("transition",true,false)).toBe(true);
    expect(isRewardPresentationSuppressed("transition",false,true)).toBe(true);
    expect(isRewardPresentationSuppressed("transition",false,false)).toBe(false);
  });

  it("uses quiet, non-punitive reconciliation language",()=>{
    expect(liveRewardStatusCopy("queued")).toContain("pending quietly");
    expect(liveRewardStatusCopy("retry")).toContain("pending quietly");
    expect(liveRewardStatusCopy("awarded")).toContain("Added");
    expect([liveRewardStatusCopy("queued"),liveRewardStatusCopy("retry")].join(" ")).not.toMatch(/missed|lost|failed|hurry/i);
  });
});
