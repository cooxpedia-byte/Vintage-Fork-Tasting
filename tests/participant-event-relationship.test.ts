import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

describe("participant event queries", () => {
  it("use the canonical foreign key instead of an ambiguous inferred relationship", () => {
    const dashboard = source("src/app/dashboard/page.tsx");
    const liveEvents = source("src/app/live-events/page.tsx");
    const relationship = "event:events!participants_event_id_fkey!inner";

    expect(dashboard).toContain(relationship);
    expect(liveEvents).toContain(relationship);
    expect(dashboard).not.toContain("event:events!inner");
    expect(liveEvents).not.toContain("event:events!inner");
  });
});
