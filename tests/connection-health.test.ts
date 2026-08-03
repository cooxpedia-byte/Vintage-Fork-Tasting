import { describe, expect, it } from "vitest";
import { getConnectionNotice, updateConnectionIssues } from "@/lib/connection-health";

describe("connection health", () => {
  it("tracks failing sources independently", () => {
    const withApiFailure = updateConnectionIssues({}, { source: "guest:event:state", healthy: false });
    const withBothFailures = updateConnectionIssues(withApiFailure, { source: "guest:event:realtime", healthy: false });
    const apiRecovered = updateConnectionIssues(withBothFailures, { source: "guest:event:state", healthy: true });

    expect(withBothFailures).toEqual({ "guest:event:state": true, "guest:event:realtime": true });
    expect(apiRecovered).toEqual({ "guest:event:realtime": true });
  });

  it("distinguishes device offline from service degradation", () => {
    expect(getConnectionNotice(false, {})).toContain("You’re offline");
    expect(getConnectionNotice(true, { "guest:event:state": true })).toContain("tasting service");
    expect(getConnectionNotice(true, {})).toBeNull();
  });
});
