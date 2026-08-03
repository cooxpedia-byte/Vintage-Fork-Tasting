import { describe, expect, it } from "vitest";
import { evaluateLiveResponseWindow } from "@/lib/live-response";

const currentTeaId = "00000000-0000-4000-8000-000000000001";
const otherTeaId = "00000000-0000-4000-8000-000000000002";

const openTasting = {
  status: "live" as const,
  phase: "tasting" as const,
  current_flight_item_id: currentTeaId,
  tasting_opened_flight_item_id: currentTeaId
};

describe("live tasting response window", () => {
  it("accepts only the current tea after the host opens tasting", () => {
    expect(evaluateLiveResponseWindow(openTasting, currentTeaId)).toEqual({ allowed: true });
    expect(evaluateLiveResponseWindow(openTasting, otherTeaId)).toEqual({
      allowed: false,
      message: "The room has moved to another tea."
    });
  });

  it("rejects responses before the host-controlled tasting phase", () => {
    expect(evaluateLiveResponseWindow({ ...openTasting, phase: "brewing" }, currentTeaId)).toEqual({
      allowed: false,
      message: "The host has not opened tasting responses."
    });
    expect(evaluateLiveResponseWindow({ ...openTasting, status: "completed" }, currentTeaId)).toEqual({
      allowed: false,
      message: "The host has not opened tasting responses."
    });
  });

  it("rejects a tea until its tasting-open marker is authoritative", () => {
    expect(evaluateLiveResponseWindow({
      ...openTasting,
      tasting_opened_flight_item_id: otherTeaId
    }, currentTeaId)).toEqual({
      allowed: false,
      message: "The host has not opened this tea for responses."
    });
  });

  it("allows an event tea during the live recap window", () => {
    expect(evaluateLiveResponseWindow({
      ...openTasting,
      phase: "recap",
      tasting_opened_flight_item_id: otherTeaId
    }, otherTeaId)).toEqual({ allowed: true });
  });

  it("fails closed when no authoritative event was loaded", () => {
    expect(evaluateLiveResponseWindow(null, currentTeaId)).toEqual({
      allowed: false,
      message: "The host has not opened tasting responses."
    });
  });
});
