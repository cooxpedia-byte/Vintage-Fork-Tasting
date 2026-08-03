import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuestRecap, type StatePayload } from "@/components/guest/GuestExperience";
import { protectGuestState } from "@/lib/guest-privacy";

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
        saved: true
      }],
      allItems: [{
        id: "tea-1",
        reveal_title: "Golden Dawn",
        tea: { origin: "Yunnan" }
      }],
      analytics: {
        average_rating: 4.2,
        tea_saves: 3,
        trivia_answers: 4,
        trivia_correct: 3
      }
    } as StatePayload;

    const html = renderToStaticMarkup(createElement(GuestRecap, { state }));

    expect(html).toContain("Your evening, Alex");
    expect(html).toContain("Golden Dawn");
    expect(html).not.toContain("Leaderboard");
    expect(html).not.toContain("The room noticed");
    expect(html).not.toContain("Another guest");
  });
});
