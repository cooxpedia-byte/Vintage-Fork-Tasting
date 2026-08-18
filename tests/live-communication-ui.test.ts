import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const communication = source("src/components/live/LiveCommunication.tsx");
const guest = source("src/components/guest/GuestExperience.tsx");
const host = source("src/components/host/HostConsole.tsx");
const css = source("src/app/globals.css");
const route = source("src/app/api/events/[eventId]/communication/route.ts");

describe("tea-native chat and reactions UI", () => {
  it("integrates the same communication layer into guest and host live experiences", () => {
    expect(guest).toContain('<LiveCommunication eventId={state.event.id} presentation="guest"');
    expect(host).toContain('<LiveCommunication eventId={event.id} presentation="host"');
    expect(communication).not.toContain("agora-rtc-sdk-ng");
  });

  it("ships the curated tray, optimistic local response and room grouping", () => {
    expect(communication).toContain("TEA_REACTIONS.map");
    expect(communication.indexOf("displayReaction(reactionType)")).toBeLessThan(communication.indexOf('action: "send_reaction"'));
    expect(communication).toContain("burst.count + 1");
    expect(communication).toContain("burst.count >= 5");
  });

  it("keeps chat in-place with unread state, replies, Ask Host and native emoji", () => {
    expect(communication).toContain("live-chat-drawer");
    expect(communication).toContain("New messages");
    expect(communication).toContain("Replying to");
    expect(communication).toContain("Ask Host");
    expect(communication).toContain("CHAT_EMOJI");
  });

  it("provides host curation and emergency controls without tasting commands", () => {
    for (const control of ["Mark answered", "Pin", "Spotlight with name", "Spotlight anonymously", "Broadcast", "Chat paused", "Reactions paused", "Remove message", "Remove participant"]) {
      expect(communication).toContain(control);
    }
    expect(route).toContain('writeModerationLog(context, action.operation');
    expect(route).toContain('body: "Message removed"');
    expect(route).not.toContain('/command');
  });

  it("gives guests a report path without exposing moderator-only participant ids", () => {
    expect(communication).toContain(">Report</button>");
    expect(communication).toContain('action: "report_message"');
    expect(route).toContain("participantId: viewerCanModerate ? row.participant_id : null");
  });

  it("has mobile bottom-sheet and reduced-motion equivalents", () => {
    expect(css).toContain("height: min(78dvh,720px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(communication).toContain('aria-live="polite"');
    expect(communication).toContain('aria-label={`${reaction.label}: ${reaction.meaning}`}');
  });
});
