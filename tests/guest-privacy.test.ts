import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuestRecap, type StatePayload } from "@/components/guest/GuestExperience";
import { clearGuestDeviceData, protectGuestState } from "@/lib/guest-privacy";

describe("guest state privacy boundary", () => {
  it("removes cross-guest rankings and descriptor frequencies", () => {
    const payload = protectGuestState({
      event: { id: "event-1" },
      responses: [{ event_flight_item_id: "tea-1", personal_notes: "Mine" }],
      leaderboard: [{ name: "Another guest", score: 4 }],
      descriptorLeaders: [{ label: "honeyed", count: 8 }]
    });

    expect(payload).toEqual({
      event: { id: "event-1" },
      responses: [{ event_flight_item_id: "tea-1", personal_notes: "Mine" }]
    });
    expect(payload).not.toHaveProperty("leaderboard");
    expect(payload).not.toHaveProperty("descriptorLeaders");
  });

  it("renders a participant-only recap without ranking or frequency sections", () => {
    const state = {
      event: { id: "event-1", title: "Summer tasting" },
      participant: { displayName: "Alex", linkedToAccount: false },
      responses: [{
        event_flight_item_id: "tea-1",
        rating: 4,
        descriptors: ["honeyed"],
        saved: true,
        completed_at: "2026-08-02T18:00:00.000Z"
      }],
      allItems: [
        { id: "tea-1", reveal_title: "Golden Dawn", tea: { origin: "Yunnan" } },
        { id: "tea-2", reveal_title: "Cloud Mist", tea: { origin: "Zhejiang" } }
      ],
      analytics: { average_rating: 4.2 },
      participantTrivia: { answered: 2, correct: 1, total: 4 }
    } as StatePayload;

    const html = renderToStaticMarkup(createElement(GuestRecap, { state }));

    expect(html).toContain("Your evening, Alex");
    expect(html).toContain("Golden Dawn");
    expect(html).toContain("Cloud Mist");
    expect(html).toContain("correct · answered 2 of 4");
    expect(html).toContain("Remove from saved teas");
    expect(html).toContain("Save this tea");
    expect(html).toContain("Not tasted");
    expect(html).not.toContain("Not rated");
    expect(html).not.toContain("75%");
    expect(html).not.toContain("Leaderboard");
    expect(html).not.toContain("The room noticed");
    expect(html).not.toContain("Another guest");
    expect(html).toContain("Email me my recap");
    expect(html).toContain("Delete my tasting data");
  });

  it("clears only this participant's device drafts and pending trivia", () => {
    const values = new Map([
      ["vf:draft:event-1:participant-1:tea-1", "mine"],
      ["vf:draft:event-1:participant-2:tea-1", "someone else"],
      ["vf:interface-sound", "on"]
    ]);
    const localStore = {
      get length() { return values.size; },
      key(index: number) { return [...values.keys()][index] ?? null; },
      removeItem(key: string) { values.delete(key); }
    };
    const removedFromSession: string[] = [];

    clearGuestDeviceData(localStore, { removeItem: key => removedFromSession.push(key) }, "event-1", "participant-1");

    expect(values.has("vf:draft:event-1:participant-1:tea-1")).toBe(false);
    expect(values.has("vf:draft:event-1:participant-2:tea-1")).toBe(true);
    expect(values.has("vf:interface-sound")).toBe(true);
    expect(removedFromSession).toEqual(["pending_trivia_answer"]);
  });
});
