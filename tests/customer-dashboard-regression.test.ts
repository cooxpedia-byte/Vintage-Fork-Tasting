import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CustomerDashboard } from "@/components/dashboard/CustomerDashboard";
import { LiveEventsHub } from "@/components/live-events/LiveEventsHub";
import { buildJournalSessions } from "@/lib/tea-lab/journal";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams()
}));

type DashboardProps = Parameters<typeof CustomerDashboard>[0];

const event: DashboardProps["events"][number] = {
  id: "event-1",
  title: "Shipped evening",
  starts_at: "2026-08-02T18:00:00.000Z",
  location_mode: "in_person",
  participant_id: "participant-1",
  responses: [
    {
      id: "complete-saved",
      rating: 5,
      first_impression: "Bright and warm",
      personal_notes: "Keep this private",
      descriptors: ["honeyed"],
      intensity: "dominant",
      saved: true,
      completed_at: "2026-08-02T18:05:00.000Z",
      stamp_released_at: "2026-08-02T18:10:00.000Z",
      flight: { id: "flight-1", reveal_title: "Golden Dawn", position: 1, tea: { name: "Golden Dawn", origin: "Yunnan" } }
    },
    {
      id: "incomplete-unsaved",
      rating: null,
      first_impression: null,
      personal_notes: null,
      descriptors: [],
      intensity: null,
      saved: false,
      completed_at: null,
      stamp_released_at: null,
      flight: { id: "flight-2", reveal_title: "Cloud Mist", position: 2, tea: { name: "Cloud Mist", origin: "Zhejiang" } }
    }
  ]
};

function render(initialTab: DashboardProps["initialTab"], overrides: Partial<DashboardProps> = {}) {
  return renderToStaticMarkup(createElement(CustomerDashboard, {
    name: "Alex",
    events: [event],
    initialTab,
    ...overrides
  }));
}

describe("shipped customer dashboard presentation", () => {
  it("renders upcoming events in the dedicated Live Events hub timezone", () => {
    const events = [{
      id: "upcoming-1",
      title: "Mountain tea table",
      startsAt: "2026-08-02T18:00:00.000Z",
      timezone: "America/Edmonton",
      locationMode: "in_person",
      status: "scheduled",
      inviteCode: "MOUNTAIN",
      venueName: "Vintage Fork"
    }];

    const liveEventsHtml = renderToStaticMarkup(createElement(LiveEventsHub, { events }));
    const teaLabHtml = render("home", { events: [], teaLabEnabled: true, ownerUserId: "owner-1" });

    expect(liveEventsHtml).toContain("12:00 p.m.");
    expect(liveEventsHtml).not.toContain("6:00 p.m.");
    expect(liveEventsHtml).toContain("/event/MOUNTAIN");
    expect(teaLabHtml).not.toContain("Mountain tea table");
    expect(teaLabHtml).not.toContain("Next at the table");
  });

  it("integrates the digital card into existing live-event Journal history", () => {
    const html = render("journal");

    expect(html).toContain("Your Tasting Journal");
    expect(html).toContain("Shipped evening");
    expect(html).toContain("Golden Dawn");
    expect(html).toContain("Cloud Mist");
    expect(html).toContain("Bright and warm");
    expect(html).toContain("Keep this private");
    expect(html).toContain("Live Event Verified");
    expect(html).toContain("<th>Seal</th>");
    expect(html).toContain("View card");
    expect(html).toContain("View tasting card for Golden Dawn");
  });

  it("retains the full Tea Lab navigation when Tea Lab is enabled", () => {
    const journalSessions = buildJournalSessions([event], []);
    const html = render("journal", { teaLabEnabled: true, journalSessions });

    expect(html).toContain("Shipped evening");
    expect(html).toContain("Golden Dawn");
    expect(html).toContain("Cloud Mist");
    expect(html).toContain("Live tasting");
    expect(html).toContain("Live Event Verified");
    expect(html).toContain("<th>Seal</th>");
    expect(html).toContain("</span> Lab</button>");
    expect(html).toContain("</span> Journal</button>");
    expect(html).toContain("</span> Library</button>");
  });

  it("shows a Passport stamp only for the completed response", () => {
    const html = render("passport");

    expect(html).toContain("Golden Dawn");
    expect(html).not.toContain("Cloud Mist");
    expect(html).toContain("Tap to view card");
    expect(html).toContain("Open tasting card for Golden Dawn");
  });

  it("shows only explicitly saved responses in Saved Teas", () => {
    const html = render("saved");

    expect(html).toContain("Golden Dawn");
    expect(html).toContain("Saved");
    expect(html).not.toContain("Cloud Mist");
  });
});
