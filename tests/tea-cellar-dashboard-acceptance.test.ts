import { Children, isValidElement, type ComponentProps, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({ user: vi.fn(), client: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: stubs.user }));
vi.mock("@/lib/supabase/server", () => ({ createClient: stubs.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: stubs.admin }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: vi.fn(), useSearchParams: vi.fn() }));

import DashboardPage from "@/app/dashboard/page";
import { CustomerDashboard } from "@/components/dashboard/CustomerDashboard";

type Row = Record<string, unknown>;
type Filter = [string, string, unknown];

function fixtures(owner: string) {
  return {
    profiles: [{ id: owner, display_name: owner }],
    participants: [{
      id: `${owner}-participant`, user_id: owner, status: "joined",
      event: { id: `${owner}-event`, title: "Hosted tea", starts_at: "2026-09-29T12:00:00Z", timezone: "America/Edmonton", location_mode: "remote", status: "completed", invite_code: null },
      responses: [{ id: `${owner}-response`, rating: 4, first_impression: "Floral", personal_notes: `${owner} live note`, descriptors: ["honey"], intensity: "clear", saved: true, completed_at: "2026-09-29T13:00:00Z", stamp_released_at: null,
        flight: { id: "flight", reveal_title: "Hosted green", position: 1, brewing_instructions: "Steep gently", steep_seconds: 60, temperature_c: 80, leaf_grams: 4, water_ml: 120, tea: { id: "tea", name: "Hosted green", origin: "Japan" } } }]
    }],
    tasting_sessions: [{
      id: `${owner}-session`, owner_user_id: owner, kind: "solo", status: "completed", revision: 2,
      started_at: "2026-09-30T10:00:00Z", completed_at: "2026-09-30T11:00:00Z", archived_at: "2026-09-30T12:00:00Z",
      cards: [{ id: `${owner}-card`, position: 1, tea_name_snapshot: "Personal green", origin_snapshot: "Japan", rating: 5, intensity: "clear", completed_at: "2026-09-30T11:00:00Z",
        private_notes: { first_impression: "Sweet", personal_notes: `${owner} private note` }, descriptor_links: [],
        brewing: { brewing_style: "gongfu", leaf_grams: 4, water_ml: 120, water_temperature_c: 80, vessel: "Small pot", water_source: "Filtered", initial_steep_seconds: 30 },
        brew_stages: [{ stage_number: 1, label: "First infusion", duration_seconds: 30, temperature_c: 80, notes: `${owner} brewing note` }],
        photos: [
          { id: `${owner}-photo`, storage_path: `${owner}/card/ready.jpg`, upload_status: "ready", alt_text: "Tea leaves", created_at: "2026-09-30T10:30:00Z" },
          { id: `${owner}-upload`, storage_path: `${owner}/card/pending.jpg`, upload_status: "uploading", alt_text: null, created_at: "2026-09-30T10:30:00Z" }
        ] }]
    }],
    personal_tea_records: []
  };
}

function setup(owner = "owner-a", failure?: "photos" | "records") {
  const owners = [fixtures("owner-a"), fixtures("owner-b")];
  const tables: Record<string, Row[]> = {
    profiles: owners.flatMap(row => row.profiles), participants: owners.flatMap(row => row.participants),
    tasting_sessions: owners.flatMap(row => row.tasting_sessions), personal_tea_records: [],
    flavor_descriptors: [{ id: "descriptor", label: "Honey", category: "sweet", active: true, position: 1, aliases: [] }],
    teas: [{ id: "tea", name: "Hosted green", retired_at: null }]
  };
  const queries: Array<{ table: string; filters: Filter[] }> = [];
  const from = vi.fn((table: string) => {
    if (!(table in tables)) throw new Error(`Unexpected retired or unreviewed table: ${table}`);
    const filters: Filter[] = [];
    queries.push({ table, filters });
    const result = (single = false) => {
      const data = tables[table].filter(row => filters.every(([kind, key, value]) => kind === "in" ? (value as unknown[]).includes(row[key]) : row[key] === value));
      return failure === "records" && table === "tasting_sessions"
        ? { data: null, error: { code: "record_read_failed" } }
        : { data: structuredClone(single ? data[0] ?? null : data), error: null };
    };
    const builder = {
      select: () => builder, order: () => builder,
      eq: (key: string, value: unknown) => { filters.push(["eq", key, value]); return builder; },
      is: (key: string, value: unknown) => { filters.push(["is", key, value]); return builder; },
      in: (key: string, value: unknown[]) => { filters.push(["in", key, value]); return builder; },
      single: async () => result(true),
      then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve)
    };
    return builder;
  });
  const rpc = vi.fn(() => { throw new Error("Dashboard must not invoke marketplace or wallet mutation RPCs"); });
  const createSignedUrls = vi.fn(async (paths: string[]) => failure === "photos"
    ? { data: null, error: { code: "storage_temporarily_unavailable" } }
    : { data: paths.map(path => ({ path, signedUrl: `https://photos.example.test/${path}` })), error: null });
  stubs.user.mockResolvedValue({ id: owner, email: `${owner}@example.test` });
  stubs.client.mockResolvedValue({ from, rpc });
  stubs.admin.mockReturnValue({ storage: { from: vi.fn(() => ({ createSignedUrls })) } });
  return { queries, rpc, createSignedUrls };
}

async function props(section = "tea-merchant") {
  const page = await DashboardPage({ searchParams: Promise.resolve({ section }) });
  const dashboard = Children.toArray(page.props.children).find(child => isValidElement(child) && child.type === CustomerDashboard);
  expect(dashboard).toBeDefined();
  return (dashboard as ReactElement<ComponentProps<typeof CustomerDashboard>>).props;
}

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("TEA_LAB_ENABLED", "true"); });
afterEach(() => vi.unstubAllEnvs());

describe("combined retirement dashboard acceptance", () => {
  it.each(["owner-a", "owner-b"])("loads %s personal and hosted records without marketplace or reward calls", async owner => {
    const client = setup(owner);
    const result = await props();
    expect(result.initialTab).toBe("passport");
    expect(result.teaLabEnabled).toBe(true);
    expect(result.cellarRecords?.map(record => record.id)).toEqual([`solo:${owner}-card`, `live:${owner}-response`]);
    const [solo, live] = result.cellarRecords!;
    expect(solo.archived).toBe(true);
    expect(solo.card.personalNotes).toBe(`${owner} private note`);
    expect(solo.card.brewing?.stages[0].notes).toBe(`${owner} brewing note`);
    expect(solo.card.photos).toHaveLength(1);
    expect(solo.card.photos?.[0].url).toContain(`${owner}/card/ready.jpg`);
    expect(live.card.personalNotes).toBe(`${owner} live note`);
    expect(live.card.sealClass).toBeNull();
    expect(live.card.brewing?.instructions).toBe("Steep gently");
    expect(result.archivedJournalSessions).toHaveLength(1);
    expect(client.createSignedUrls).toHaveBeenCalledExactlyOnceWith([`${owner}/card/ready.jpg`], 3600);
    expect(client.rpc).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(owner === "owner-a" ? "owner-b" : "owner-a");
    for (const query of client.queries.filter(query => ["tasting_sessions", "personal_tea_records"].includes(query.table))) {
      expect(query.filters).toContainEqual(["eq", "owner_user_id", owner]);
    }
    expect(client.queries.find(query => query.table === "participants")?.filters).toContainEqual(["eq", "user_id", owner]);
  });

  it("keeps notes and brewing records available during a temporary private-photo signing failure", async () => {
    setup("owner-a", "photos");
    const result = await props("tea-cellar");
    expect(result.cellarRecords).toHaveLength(2);
    expect(result.cellarRecords?.[0].card.personalNotes).toBe("owner-a private note");
    expect(result.cellarRecords?.[0].card.photos).toEqual([]);
  });

  it("reports a record-load failure instead of presenting a misleading empty cellar", async () => {
    const client = setup("owner-a", "records");
    await expect(props()).rejects.toThrow("Unable to load your dashboard.");
    expect(client.createSignedUrls).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
