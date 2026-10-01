import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ cookies: vi.fn(), create: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: mock.cookies }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mock.create }));
import { authorizedCommerceClient, clearCommerceCookies } from "@/lib/supabase/commerce-server";
const cookie = new Map<string, string>();
const getUser = vi.fn();
const single = vi.fn();
const from = vi.fn();
const client = { auth: { getUser }, from };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("COMMERCE_SUPABASE_URL", "https://fugvpupuwgbnojkyptym.supabase.co");
  vi.stubEnv("COMMERCE_SUPABASE_PUBLISHABLE_KEY", "test-publishable");
  cookie.clear(); cookie.set("vf-store-admin-for", "tasting-admin");
  mock.cookies.mockResolvedValue({
    get: (name: string) => cookie.has(name) ? { name, value: cookie.get(name) } : undefined,
    getAll: () => [...cookie].map(([name, value]) => ({ name, value })),
    delete: (name: string) => cookie.delete(name),
    set: (name: string, value: string) => cookie.set(name, value),
  });
  mock.create.mockReturnValue(client);
  getUser.mockResolvedValue({ data: { user: { id: "store-admin" } }, error: null });
  single.mockResolvedValue({ data: { role: "admin" }, error: null });
  from.mockImplementation((table: string) => {
    expect(table).toBe("profiles");
    return { select: (column: string) => {
      expect(column).toBe("role");
      return { eq: (column: string, id: string) => {
        expect([column, id]).toEqual(["id", "store-admin"]);
        return { single };
      } };
    } };
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("separate commerce administrator session", () => {
  it("refuses missing or mismatched tasting-account binding before reading the native session", async () => {
    expect(await authorizedCommerceClient("another-tasting-user")).toBeNull();
    cookie.delete("vf-store-admin-for");
    expect(await authorizedCommerceClient("tasting-admin")).toBeNull();
    expect(mock.create).not.toHaveBeenCalled();
  });
  it("refuses an expired native session before querying a profile", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { code: "expired" } });
    expect(await authorizedCommerceClient("tasting-admin")).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
  it.each(["customer", "host"])("refuses native %s roles even with a valid tasting binding", async role => {
    single.mockResolvedValue({ data: { role }, error: null });
    expect(await authorizedCommerceClient("tasting-admin")).toBeNull();
  });
  it("returns only a verified administrator from the pinned commerce project", async () => {
    expect(await authorizedCommerceClient("tasting-admin")).toBe(client);
    expect(mock.create).toHaveBeenCalledWith("https://fugvpupuwgbnojkyptym.supabase.co", "test-publishable", expect.objectContaining({ cookieOptions: expect.objectContaining({ name: "vf-store-admin", httpOnly: true }) }));
    vi.stubEnv("COMMERCE_SUPABASE_URL", "https://another-project.supabase.co");
    expect(await authorizedCommerceClient("tasting-admin")).toBeNull();
    expect(mock.create).toHaveBeenCalledTimes(1);
  });
  it("clears only the separate commerce cookies, preserving the tasting session", async () => {
    cookie.set("vf-store-admin.0", "chunk");
    cookie.set("sb-tasting-auth-token", "tasting");
    cookie.set("preference", "other");
    await clearCommerceCookies();
    expect([...cookie]).toEqual([["sb-tasting-auth-token", "tasting"], ["preference", "other"]]);
  });
});
