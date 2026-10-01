import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  role: "customer",
  client: vi.fn(),
  commerce: vi.fn(),
  overview: vi.fn(),
  service: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: state.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: state.service }));
vi.mock("@/lib/supabase/commerce-server", () => ({ authorizedCommerceClient: state.commerce }));
vi.mock("@/lib/admin/commerce", () => ({ loadCommerceOverview: state.overview }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
  usePathname: () => "/admin",
}));
import AdminPage from "@/app/admin/page";
import OrdersPage from "@/app/admin/orders/page";
import AccountsPage from "@/app/admin/accounts/page";
import CouponsPage from "@/app/admin/coupons/page";
import StorePage from "@/app/admin/store/page";
import SettingsPage from "@/app/admin/settings/page";
import { AdminShell } from "@/components/admin/AdminShell";
import { CommerceAdminOverview } from "@/components/admin/CommerceAdminOverview";
import { StoreConnectionNotice } from "@/components/admin/StoreConnectionNotice";

beforeEach(() => {
  vi.resetAllMocks();
  state.user = { id: "verified-staff" };
  state.role = "admin";
  state.client.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      expect(table).toBe("profiles");
      return { select: () => ({ eq: (_column: string, userId: string) => {
        expect(userId).toBe(state.user?.id);
        return { single: async () => ({ data: { role: state.role } }) };
      } }) };
    },
  });
});

describe("recovered staff admin access", () => {
  it("keeps anonymous users at staff sign-in before any store read", async () => {
    state.user = null;
    await expect(AdminPage()).rejects.toThrow("redirect:/admin/login");
    expect(state.commerce).not.toHaveBeenCalled();
  });
  it("denies customers and redirects hosts to their current event workspace", async () => {
    state.role = "customer";
    await expect(AdminPage()).rejects.toThrow("redirect:/unauthorized");
    state.role = "host";
    await expect(AdminPage()).rejects.toThrow("redirect:/admin/events");
    expect(state.commerce).not.toHaveBeenCalled();
    expect(state.overview).not.toHaveBeenCalled();
  });
  it("asks an administrator to connect the separate store account before loading commerce", async () => {
    state.commerce.mockResolvedValue(null);
    const view = await AdminPage();
    expect(state.commerce).toHaveBeenCalledWith("verified-staff");
    expect(view.type).toBe(StoreConnectionNotice);
    expect(state.overview).not.toHaveBeenCalled();
  });
  it("renders the actual commerce component with data from the bound administrator session", async () => {
    const client = { purpose: "bound-store-admin" };
    const data = { connected: true, recentOrders: [] };
    state.commerce.mockResolvedValue(client);
    state.overview.mockResolvedValue(data);
    const view = await AdminPage();
    expect(state.overview).toHaveBeenCalledWith(client);
    expect(view.type).toBe(CommerceAdminOverview);
    expect(view.props).toEqual({ commerce: data });
  });
  it.each([
    ["orders", () => OrdersPage({ searchParams: Promise.resolve({}) })],
    ["coupons", () => CouponsPage({ searchParams: Promise.resolve({}) })],
    ["accounts", () => AccountsPage()],
    ["store", () => StorePage()],
    ["settings", () => SettingsPage()],
  ])("keeps host access out of the %s administration route", async (_name, page) => {
    state.role = "host";
    await expect(page()).rejects.toThrow("redirect:/unauthorized");
    expect(state.commerce).not.toHaveBeenCalled();
    expect(state.service).not.toHaveBeenCalled();
  });
  it("restores management navigation with current store URLs and excludes retired experiences", () => {
    const admin = renderToStaticMarkup(createElement(AdminShell, { role: "admin" } as ComponentProps<typeof AdminShell>, "Content"));
    for (const href of ["/admin/orders", "/admin/coupons", "/admin/accounts", "/admin/gold-leaves", "/admin/events", "https://vintagefork.ca/admin/products/", "https://vintagefork.ca/admin/pos/"]) expect(admin).toContain(`href="${href}"`);
    expect(admin).not.toContain("staging1.vintagefork.ca");
    expect(admin).not.toMatch(/Tea Merchant|marketplace|trivia|passport/i);
    const host = renderToStaticMarkup(createElement(AdminShell, { role: "host" } as ComponentProps<typeof AdminShell>, "Content"));
    expect(host).toContain('href="/admin/events"');
    for (const href of ["/admin/orders", "/admin/coupons", "/admin/accounts", "/admin/gold-leaves"]) expect(host).not.toContain(`href="${href}"`);
  });
});
