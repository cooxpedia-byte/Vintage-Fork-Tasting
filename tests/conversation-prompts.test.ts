import {describe,expect,it} from "vitest";
import {chooseRoomPrompt,isPromptEligible,promptSuggestions,promptWordCount,type ConversationPrompt} from "@/lib/conversation-prompts";

function prompt(overrides:Partial<ConversationPrompt>={}):ConversationPrompt{return{
  id:"prompt-1",text:"What changed as the cup cooled?",category:"change",allowedStages:["explore"],audience:"all",
  difficulty:"basic",requiresReveal:false,teaContextTags:["universal"],locale:"en-CA",version:1,...overrides
}}

describe("conversation prompt curation",()=>{
  it("permits only the neutral first-sip exception",()=>{
    expect(isPromptEligible(prompt({text:"Notice first. Name it when you're ready.",allowedStages:["first_sip"]}),{stage:"first_sip",audience:"breakout",revealVisible:false})).toBe(true);
    expect(isPromptEligible(prompt({text:"What flavor appeared first?",allowedStages:["first_sip"]}),{stage:"first_sip",audience:"breakout",revealVisible:false})).toBe(false);
  });

  it("keeps reveal-dependent prompts out of pre-reveal stages and advanced prompts out of V1",()=>{
    expect(isPromptEligible(prompt({allowedStages:["reveal"],requiresReveal:true}),{stage:"reveal",audience:"host",revealVisible:false})).toBe(false);
    expect(isPromptEligible(prompt({allowedStages:["reveal"],requiresReveal:true}),{stage:"reveal",audience:"host",revealVisible:true})).toBe(true);
    expect(isPromptEligible(prompt({difficulty:"advanced"}),{stage:"explore",audience:"host",revealVisible:false})).toBe(false);
  });

  it("offers no more than three host ideas and one at First Sip",()=>{
    const prompts=[1,2,3,4].map(index=>prompt({id:`prompt-${index}`}));
    expect(promptSuggestions(prompts,"explore")).toHaveLength(3);
    expect(promptSuggestions(prompts,"first_sip")).toHaveLength(1);
  });

  it("rotates manually without repeating until the room pool is exhausted",()=>{
    const prompts=[1,2,3].map(index=>prompt({id:`prompt-${index}`}));
    expect(chooseRoomPrompt(prompts,"table",["prompt-1","prompt-2"])?.id).toBe("prompt-3");
    expect(promptWordCount("Notice first. Name it when you're ready.")).toBe(7);
  });
});
