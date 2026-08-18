import {describe,expect,it} from "vitest";
import {DISCOVERY_FIRST_COPY,liveAttentionOrder,sensoryLanguageIssues} from "@/lib/discovery-first";

describe("discovery-first interface doctrine",()=>{
  it("keeps the canonical sensory language together",()=>{
    expect(DISCOVERY_FIRST_COPY.firstSip).toBe("First sip. Just notice.");
    expect(DISCOVERY_FIRST_COPY.noticeWhenReady).toBe("Notice first. Name it when you're ready.");
    expect(DISCOVERY_FIRST_COPY.noExpectedFlavor).toBe("There is no flavor you are supposed to find.");
    expect(DISCOVERY_FIRST_COPY.fingerprint).toBe("This is the fingerprint of this group, this tea, and this moment.");
  });

  it("makes people primary at arrival and tea primary once tasting starts",()=>{
    expect(liveAttentionOrder("arrival")).toBe("people-first");
    for(const stage of ["prepare","brew","aroma","first_sip","explore","discuss","reveal","debrief","close_tea","transition"] as const){
      expect(liveAttentionOrder(stage)).toBe("tea-first");
    }
  });

  it("flags judgment language in sensory copy without policing factual trivia",()=>{
    expect(sensoryLanguageIssues("Submit the correct answer and see your score.")).toEqual(["correct","answer","score"]);
    expect(sensoryLanguageIssues("Add an observation and see what emerged.")).toEqual([]);
  });
});
