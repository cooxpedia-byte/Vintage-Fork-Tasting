import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactNode, type ReactElement } from "react";
const mock = vi.hoisted(() => ({ staff: vi.fn(), commerce: vi.fn(), detail: vi.fn(), privateNotes: vi.fn(), customerNotes: vi.fn(), imported: vi.fn(), contacts: vi.fn(), emails: vi.fn(), controls: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireStaff: mock.staff }));
vi.mock("@/lib/supabase/commerce-server", () => ({ authorizedCommerceClient: mock.commerce }));
vi.mock("@/lib/admin/native-order-detail", () => ({ loadNativeOrderDetail: mock.detail }));
vi.mock("@/lib/admin/private-order-notes", () => ({ loadPrivateOrderNotes: mock.privateNotes }));
vi.mock("@/lib/admin/customer-order-notes", () => ({ loadCustomerOrderNotes: mock.customerNotes }));
vi.mock("@/lib/admin/load-imported-orders", () => ({ loadImportedWindow: mock.imported, importedQueryParams: () => new URLSearchParams() }));
vi.mock("@/lib/admin/imported-order-contacts", () => ({ loadImportedContacts: mock.contacts }));
vi.mock("@/lib/admin/order-email-status", () => ({ loadOrderEmailStatuses: mock.emails }));
vi.mock("@/lib/admin/order-operations", () => ({ loadOrderOperations: mock.controls, validOrderRef: (_kind: unknown, id: unknown) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) }));
vi.mock("@/components/admin/CustomerOrderNotes", () => ({ CustomerOrderNotes: () => null }));
vi.mock("@/components/admin/PrivateOrderNotes", () => ({ PrivateOrderNotes: () => null }));
vi.mock("next/navigation", () => ({ notFound: () => { throw Error("not-found"); } }));
import NativeOrderPage from "@/app/admin/orders/native/[id]/page";
import { ImportedOrders } from "@/components/admin/ImportedOrders";
import { PrivateOrderNotes } from "@/components/admin/PrivateOrderNotes";
import { CustomerOrderNotes } from "@/components/admin/CustomerOrderNotes";

function panel(node: ReactNode, type: unknown): ReactElement | undefined {
  if (Array.isArray(node)) return node.map(child => panel(child, type)).find(Boolean);
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  return node.type === type ? node : panel(node.props.children, type);
}
const id = "10000000-0000-4000-8000-000000000001", client = { marker: "native-user-client" };
beforeEach(() => {
  vi.resetAllMocks();
  mock.staff.mockResolvedValue({ user: { id: "tasting-owner" } }); mock.commerce.mockResolvedValue(client);
  mock.privateNotes.mockResolvedValue({ context: { kind: "native", orderId: id, orderNumber: "10008", notes: [], hasMore: false }, error: null });
  mock.customerNotes.mockResolvedValue({ context: null, error: "No available customer email." });
  mock.controls.mockResolvedValue({ orders: new Map(), error: null });
  mock.emails.mockResolvedValue({ notifications: [], error: null }); mock.contacts.mockResolvedValue({ contacts: new Map(), error: null });
  mock.detail.mockResolvedValue({ state: "ready", order: { id, orderNumber: "10008", placedAt: "2026-09-13T21:00:00Z", currency: "cad", customerEmail: null, items: [], status: "fulfilled", subtotalCents: 100, totalCents: 105, shippingCents: 0, taxCents: 5, discountCents: 0, refundedCents: 0 } });
});

describe("private note order integrations", () => {
  it("loads private notes for a completed order with no email and no available status changes", async () => {
    const view = await NativeOrderPage({ params: Promise.resolve({ id }) });
    expect(mock.staff).toHaveBeenCalledWith(["admin"]); expect(mock.commerce).toHaveBeenCalledWith("tasting-owner");
    expect(mock.privateNotes).toHaveBeenCalledWith(client, "native", id);
    expect(panel(view, PrivateOrderNotes)?.key).toBe("private:native:" + id);
    expect(panel(view, CustomerOrderNotes)?.key).toBe("native:" + id);
  });
  it("does not load private notes without the native administrator connection", async () => {
    mock.commerce.mockResolvedValue(null);
    await NativeOrderPage({ params: Promise.resolve({ id }) });
    expect(mock.privateNotes).not.toHaveBeenCalled(); expect(mock.detail).not.toHaveBeenCalled();
  });
  it("does not load private notes for an unavailable order", async () => {
    mock.detail.mockResolvedValue({ state: "not_found" });
    await expect(NativeOrderPage({ params: Promise.resolve({ id }) })).rejects.toThrow("not-found");
    expect(mock.privateNotes).not.toHaveBeenCalled();
  });
  it("keys imported private drafts by query-selected order independently of the customer panel", async () => {
    for (const importedId of ["18446744073709551615", "123"]) {
      mock.imported.mockResolvedValue({ page: { kind: "items", sourceOrderId: importedId, rows: [], total: 0, importedAt: "2026-09-13T21:00:00Z", nextCursor: null }, message: null, operations: new Map() });
      const view = await ImportedOrders({ client: client as never, params: { id: importedId, items: "1" } });
      expect(mock.privateNotes).toHaveBeenCalledWith(client, "imported", importedId);
      expect(panel(view, PrivateOrderNotes)?.key).toBe("private:imported:" + importedId);
      expect(panel(view, CustomerOrderNotes)?.key).toBe("imported:" + importedId);
    }
  });
  it("does not load per-order private history on the imported list", async () => {
    mock.imported.mockResolvedValue({ page: { kind: "orders", rows: [], total: 0, importedAt: "2026-09-13T21:00:00Z", nextCursor: null }, message: null, operations: new Map() });
    await ImportedOrders({ client: client as never, params: {} });
    expect(mock.privateNotes).not.toHaveBeenCalled();
  });
});
