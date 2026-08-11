import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const stubs = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireUser: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn()
}));

vi.mock("@/components/SiteHeader", () => ({ SiteHeader: () => null }));
vi.mock("@/components/dashboard/CustomerDashboard", () => ({ CustomerDashboard: () => null }));
vi.mock("@/lib/auth", () => ({ requireUser: stubs.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: stubs.createClient }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: stubs.loggerWarn, error: stubs.loggerError }
}));

import DashboardPage from "@/app/dashboard/page";

function dashboardProps(output: ReactElement) {
  const children = (output.props as { children: ReactElement[] }).children;
  return children[1].props as { name: string; teaLabEnabled: boolean };
}

beforeEach(() => {
  vi.clearAllMocks();
  stubs.requireUser.mockResolvedValue({ id: "owner-1", email: "owner@example.test" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function dashboardClient(
  sessionResult: { data: unknown[] | null; error: unknown } = { data: [], error: null },
  baseResults: {
    profile?: { data: { display_name: string } | null; error: unknown };
    participants?: { data: unknown[] | null; error: unknown };
    descriptors?: { data: unknown[] | null; error: unknown };
  } = {}
) {
  const profileResult = baseResults.profile ?? { data: { display_name: "Owner" }, error: null };
  const participantResult = baseResults.participants ?? { data: [], error: null };
  const profileBuilder = {
    select() { return profileBuilder; },
    eq() { return profileBuilder; },
    async single() { return profileResult; }
  };
  const participantBuilder = {
    select() { return participantBuilder; },
    eq() { return participantBuilder; },
    async order() { return participantResult; }
  };
  function queryBuilder(result = sessionResult) {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      is: vi.fn(() => builder),
      order: vi.fn(async () => result)
    };
    return builder;
  }
  const journalBuilder = queryBuilder();
  const draftBuilder = queryBuilder();
  const lookupBuilders = {
    flavor_descriptors: queryBuilder(baseResults.descriptors ?? { data: [{ id: "descriptor-1", label: "Honeyed", category: "Sweet" }], error: null }),
    teas: queryBuilder({ data: [], error: null }),
    personal_tea_records: queryBuilder({ data: [], error: null })
  };
  let sessionQueryCount = 0;
  const from = vi.fn((table: string) => {
    if (table === "profiles") return profileBuilder;
    if (table === "participants") return participantBuilder;
    if (table === "tasting_sessions") return sessionQueryCount++ === 0 ? journalBuilder : draftBuilder;
    if (table in lookupBuilders) return lookupBuilders[table as keyof typeof lookupBuilders];
    throw new Error(`Unexpected table: ${table}`);
  });

  const rpc = vi.fn(async () => ({ data: [], error: null }));

  return { client: { from, rpc }, from, journalBuilder, draftBuilder };
}

describe("Tea Lab Journal dashboard query", () => {
  it("surfaces participant history failures instead of rendering an empty account", async () => {
    vi.stubEnv("TEA_LAB_ENABLED", "false");
    const error = { code: "PGRST500", message: "private database detail" };
    const { client } = dashboardClient(undefined, { participants: { data: null, error } });
    stubs.createClient.mockResolvedValue(client);

    await expect(DashboardPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("Unable to load your dashboard.");

    expect(stubs.loggerError).toHaveBeenCalledWith(
      "customer_dashboard_participants_load_failed",
      undefined,
      { surface: "customer_dashboard", code: "PGRST500" }
    );
    expect(JSON.stringify(stubs.loggerError.mock.calls)).not.toContain("private database detail");
  });

  it("keeps the safe account-name fallback when only the profile lookup fails", async () => {
    vi.stubEnv("TEA_LAB_ENABLED", "false");
    const error = { code: "PGRST116", message: "private database detail" };
    const { client } = dashboardClient(undefined, { profile: { data: null, error } });
    stubs.createClient.mockResolvedValue(client);

    const output = await DashboardPage({ searchParams: Promise.resolve({}) });

    expect(dashboardProps(output).name).toBe("owner");
    expect(stubs.loggerWarn).toHaveBeenCalledWith(
      "customer_dashboard_profile_load_failed",
      { surface: "customer_dashboard", code: "PGRST116" }
    );
    expect(JSON.stringify(stubs.loggerWarn.mock.calls)).not.toContain("private database detail");
  });

  it("does not touch Tea Lab tables while the server flag is off", async () => {
    vi.stubEnv("TEA_LAB_ENABLED", "false");
    const { client, from, journalBuilder } = dashboardClient();
    stubs.createClient.mockResolvedValue(client);

    const output = await DashboardPage({ searchParams: Promise.resolve({ section: "journal" }) });

    expect(from).not.toHaveBeenCalledWith("tasting_sessions");
    expect(journalBuilder.select).not.toHaveBeenCalled();
    expect(dashboardProps(output).teaLabEnabled).toBe(false);
  });

  it("loads the owner's completed sessions for active Journal, archived history, and Passport derivation", async () => {
    vi.stubEnv("TEA_LAB_ENABLED", "true");
    const { client, from, journalBuilder, draftBuilder } = dashboardClient();
    stubs.createClient.mockResolvedValue(client);

    const output = await DashboardPage({ searchParams: Promise.resolve({ section: "journal" }) });

    expect(from).toHaveBeenCalledWith("tasting_sessions");
    expect(journalBuilder.eq).toHaveBeenNthCalledWith(1, "owner_user_id", "owner-1");
    expect(journalBuilder.eq).toHaveBeenNthCalledWith(2, "status", "completed");
    expect(journalBuilder.is).not.toHaveBeenCalledWith("archived_at", null);
    expect(journalBuilder.order).toHaveBeenCalledWith("completed_at", { ascending: false });
    expect(draftBuilder.eq).toHaveBeenCalledWith("owner_user_id", "owner-1");
    expect(draftBuilder.in).toHaveBeenCalledWith("status", ["draft", "in_progress"]);
    expect(dashboardProps(output).teaLabEnabled).toBe(true);
  });

  it("surfaces required Tea Lab read failures without logging private details", async () => {
    vi.stubEnv("TEA_LAB_ENABLED", "true");
    const error = { code: "PGRST500", message: "relation unavailable" };
    const { client } = dashboardClient({ data: [], error });
    stubs.createClient.mockResolvedValue(client);

    await expect(DashboardPage({ searchParams: Promise.resolve({ section: "journal" }) }))
      .rejects.toThrow("Unable to load your dashboard.");

    expect(stubs.loggerWarn).toHaveBeenCalledWith(
      "tea_lab_journal_load_failed",
      { surface: "customer_dashboard", code: "PGRST500" }
    );
    expect(stubs.loggerError).toHaveBeenCalledWith(
      "customer_dashboard_tea_lab_load_failed",
      undefined,
      {
        surface: "customer_dashboard",
        failures: [
          { source: "journal", code: "PGRST500" },
          { source: "drafts", code: "PGRST500" }
        ]
      }
    );
    expect(JSON.stringify(stubs.loggerWarn.mock.calls)).not.toContain("relation unavailable");
    expect(JSON.stringify(stubs.loggerError.mock.calls)).not.toContain("relation unavailable");
  });

  it("surfaces a missing descriptor seed instead of silently disabling Tea Lab", async () => {
    vi.stubEnv("TEA_LAB_ENABLED", "true");
    const { client } = dashboardClient(undefined, { descriptors: { data: [], error: null } });
    stubs.createClient.mockResolvedValue(client);

    await expect(DashboardPage({ searchParams: Promise.resolve({}) }))
      .rejects.toThrow("Unable to load your dashboard.");

    expect(stubs.loggerError).toHaveBeenCalledWith(
      "tea_lab_descriptor_seed_missing",
      undefined,
      { surface: "customer_dashboard" }
    );
  });
});
