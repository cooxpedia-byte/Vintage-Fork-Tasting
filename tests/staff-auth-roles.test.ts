import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({ createClient: vi.fn(), getUser: vi.fn(), role: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: stubs.createClient }));
vi.mock("next/navigation", () => ({ redirect: stubs.redirect }));

import { requireStaff } from "@/lib/auth";

beforeEach(() => {
  vi.resetAllMocks();
  stubs.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
  stubs.getUser.mockResolvedValue({ data: { user: { id: "staff-1" } } });
  stubs.createClient.mockResolvedValue({
    auth: { getUser: stubs.getUser },
    from: () => ({ select: () => ({ eq: () => ({ single: stubs.role }) }) })
  });
});

describe("staff login retains authoritative server authorization", () => {
  it("requires a valid server-authenticated user", async () => {
    stubs.getUser.mockResolvedValue({ data: { user: null } });
    await expect(requireStaff(["admin"])).rejects.toThrow("redirect:/admin/login");
    expect(stubs.role).not.toHaveBeenCalled();
  });

  it.each(["customer", "host"])("does not grant administrator access to a signed-in %s", async role => {
    stubs.role.mockResolvedValue({ data: { role } });
    await expect(requireStaff(["admin"])).rejects.toThrow("redirect:/unauthorized");
  });

  it("does not grant administrator access when the server role is unavailable", async () => {
    stubs.role.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    await expect(requireStaff(["admin"])).rejects.toThrow("redirect:/unauthorized");
  });

  it("allows the server-verified administrator", async () => {
    stubs.role.mockResolvedValue({ data: { role: "admin" } });
    await expect(requireStaff(["admin"])).resolves.toEqual({ user: { id: "staff-1" }, role: "admin" });
    expect(stubs.redirect).not.toHaveBeenCalled();
  });

  it("preserves the host's assigned staff access", async () => {
    stubs.role.mockResolvedValue({ data: { role: "host" } });
    await expect(requireStaff()).resolves.toEqual({ user: { id: "staff-1" }, role: "host" });
  });
});
