import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EventEditor } from "@/components/admin/EventEditor";
import { getHostPrimaryAction } from "@/components/host/HostConsole";
import { StatusChip } from "@/components/StatusChip";
import { GuestTastingContent } from "@/components/guest/GuestExperience";
import { evaluateLiveResponseWindow } from "@/lib/live-response";

const flight = [
  { id: "tea-1", reveal_title: "Golden Dawn", steep_seconds: 120, trivia: [{ question: "An old unanswered question" }] },
  { id: "tea-2", reveal_title: "Cloud Mist", steep_seconds: 180, trivia: [] }
];
const tasting = { phase: "tasting" as const, current_flight_item_id: "tea-1", tasting_opened_flight_item_id: "tea-1" };

describe("live tasting without games", () => {
  it("allows a complete flight to be scheduled without trivia questions", () => {
    const html = renderToStaticMarkup(createElement(EventEditor, {
      teas: [],
      staff: [
        { id: "host-1", display_name: "Host", role: "host" },
        { id: "host-2", display_name: "Backup", role: "host" }
      ],
      existing: {
        id: "event-1", title: "Evening tasting", slug: "evening-tasting", invite_code: "EVENING", status: "draft",
        location_mode: "remote", starts_at: "2026-10-15T18:00:00.000Z", timezone: "America/Edmonton", capacity: 12,
        venue_name: null, venue_address: null, host_user_id: "host-1", backup_host_user_id: "host-2",
        flight_items: [{
          tea_id: "tea-1", position: 1, reveal_title: "Golden Dawn", reveal_description: "A fragrant black tea.",
          brewing_instructions: "Steep for two minutes.", steep_seconds: 120, temperature_c: 95, leaf_grams: 4, water_ml: 250
        }]
      }
    }));

    const scheduleButton = html.match(/<button[^>]*>Save as scheduled<\/button>/)?.[0];
    expect(scheduleButton).toBeDefined();
    expect(scheduleButton).not.toContain("disabled");
    expect(html).toContain("Brewing instructions");
    expect(html).not.toMatch(/trivia|answer window|correct answer/i);
  });

  it("continues to the next tea and recap even when old questions are unanswered", () => {
    expect(getHostPrimaryAction(tasting, flight[0], flight, true)).toEqual({ label: "Next tea — Cloud Mist", command: "next_tea" });
    expect(getHostPrimaryAction({ ...tasting, current_flight_item_id: "tea-2", tasting_opened_flight_item_id: "tea-2" }, flight[1], flight, true))
      .toEqual({ label: "Start the recap", command: "start_recap" });
  });

  it("provides a recovery action for an old session paused in trivia", () => {
    expect(getHostPrimaryAction({ ...tasting, phase: "trivia" }, flight[0], flight, true))
      .toEqual({ label: "Resume the tasting", command: "return_to_tasting" });
    expect(renderToStaticMarkup(createElement(StatusChip, { value: "trivia" }))).toContain("tasting paused");
  });

  it("keeps the normal tasting editor available during a legacy trivia phase", () => {
    const props: Parameters<typeof GuestTastingContent>[0] = {
      phase: "trivia",
      item: { id: "tea-1", position: 1, reveal_title: "Golden Dawn", reveal_description: "A black tea.", brewing_instructions: "Steep for two minutes.", steep_seconds: 120, temperature_c: 95, leaf_grams: 4, water_ml: 250, tea: null },
      draft: { firstImpression: "Honey and apricot", descriptors: [], intensity: null, rating: 4, personalNotes: "Keep my note", saved: false, completed: false },
      step: 1, busy: false, error: "", setDraft: () => {}, setStep: () => {}, submit: () => {}, toggleSaved: () => {}
    };
    const firstStep = renderToStaticMarkup(createElement(GuestTastingContent, props));
    const finalStep = renderToStaticMarkup(createElement(GuestTastingContent, { ...props, step: 4 }));
    expect(firstStep).toContain("Honey and apricot");
    expect(firstStep).toContain('aria-label="First impression"');
    expect(finalStep).toContain("Submit My Notes");
    expect(firstStep).not.toMatch(/answer locked|correct answer|trivia · question/i);
    expect(evaluateLiveResponseWindow({ ...tasting, status: "live", phase: "trivia" }, "tea-1")).toEqual({ allowed: true });
  });

  it("preserves reveal synchronization and brewing timer controls", () => {
    expect(getHostPrimaryAction({ ...tasting, phase: "reveal" }, flight[0], flight, false))
      .toEqual({ label: "Reveal in progress", command: "start_timer", disabled: true });
    expect(getHostPrimaryAction({ ...tasting, phase: "reveal" }, flight[0], flight, true))
      .toEqual({ label: "Start timer · 2:00", command: "start_timer" });
    expect(getHostPrimaryAction({ ...tasting, phase: "brewing" }, flight[0], flight, true))
      .toEqual({ label: "Open the tasting", command: "open_tasting" });
  });
});
