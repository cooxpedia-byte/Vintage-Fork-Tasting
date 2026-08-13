import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

const page = source("src/app/admin/video-check/page.tsx");
const component = source("src/components/admin/AgoraDiagnostic.tsx");
const route = source("src/app/api/admin/agora-diagnostic/route.ts");

describe("admin Agora browser diagnostic", () => {
  it("is staff-only and does not create or mutate tasting events", () => {
    expect(page).toContain("await requireStaff()");
    expect(route).toContain('["host", "admin"].includes(profile.role)');
    expect(route).not.toContain('.from("events")');
    expect(route).not.toContain("save_event_bundle");
    expect(route).not.toContain("/command");
  });

  it("generates only a short-lived diagnostic token", () => {
    expect(route).toContain("DIAGNOSTIC_TOKEN_TTL_SECONDS");
    expect(route).toContain("Math.min(10 * 60");
    expect(route).toContain("agoraChannelName(randomUUID())");
    expect(route).not.toContain("appCertificate:");
  });

  it("tests direct and encrypted proxy connections independently", () => {
    expect(component).toContain('run("direct")');
    expect(component).toContain('run("secure-proxy")');
    expect(component).toContain("client.startProxyServer(5)");
    expect(component).toContain('client.on("connection-state-change"');
    expect(component).toContain('client.on("peerconnection-state-change"');
    expect(component).toContain('AgoraRTC.on("security-policy-violation"');
  });

  it("reports bounded, sanitized diagnostics to production logs", () => {
    expect(component).toContain('action: "report"');
    expect(route).toContain('logger.info("agora_browser_diagnostic"');
    expect(route).toContain("sanitizeDiagnostic");
    expect(route).toContain("slice(0, 500)");
  });
});
