import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactNode, type ReactElement } from "react";
const mock = vi.hoisted(() => ({ staff: vi.fn(), commerce: vi.fn(), detail: vi.fn(), notes: vi.fn(), imported: vi.fn(), contacts: vi.fn(), emails: vi.fn(), controls: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireStaff: mock.staff }));
vi.mock("@/lib/supabase/commerce-server", () => ({ authorizedCommerceClient: mock.commerce }));
vi.mock("@/lib/admin/native-order-detail", () => ({ loadNativeOrderDetail: mock.detail }));
vi.mock("@/lib/admin/customer-order-notes", () => ({ loadCustomerOrderNotes: mock.notes }));
vi.mock("@/lib/admin/load-imported-orders", () => ({ loadImportedWindow: mock.imported, importedQueryParams: () => new URLSearchParams() }));
vi.mock("@/lib/admin/imported-order-contacts", () => ({ loadImportedContacts: mock.contacts }));
vi.mock("@/lib/admin/order-email-status", () => ({ loadOrderEmailStatuses: mock.emails }));
vi.mock("@/lib/admin/order-operations", () => ({ loadOrderOperations: mock.controls, validOrderRef: (_kind: unknown, id: unknown) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) }));
vi.mock("@/components/admin/CustomerOrderNotes", () => ({ CustomerOrderNotes: () => null }));
vi.mock("next/navigation", () => ({ notFound: () => { throw Error("not-found"); } }));
import NativeOrderPage from "@/app/admin/orders/native/[id]/page";
import { ImportedOrders } from "@/components/admin/ImportedOrders";
import { CustomerOrderNotes } from "@/components/admin/CustomerOrderNotes";

function notePanel(node: ReactNode): ReactElement | undefined {
  if (Array.isArray(node)) return node.map(notePanel).find(Boolean);
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  if (node.type === CustomerOrderNotes) return node;
  return notePanel(node.props.children);
}

const id = "10000000-0000-4000-8000-000000000001";
const client = { marker: "native-user-client" };
beforeEach(() => {
  vi.resetAllMocks();
  mock.staff.mockResolvedValue({ user: { id: "tasting-owner" } });
  mock.commerce.mockResolvedValue(client);
  mock.notes.mockResolvedValue({ context: null, error: "Notes temporarily unavailable." });
  mock.controls.mockResolvedValue({ orders: new Map(), error: null });
  mock.emails.mockResolvedValue({ notifications: [], error: null });
  mock.contacts.mockResolvedValue({ contacts: new Map(), error: null });
  mock.detail.mockResolvedValue({ state: "ready", order: { id, orderNumber: "10008", placedAt: "2026-09-13T20:00:00Z", currency: "cad", items: [], status: "fulfilled", subtotalCents: 100, totalCents: 105, shippingCents: 0, taxCents: 5, discountCents: 0, refundedCents: 0 } });
});

describe("customer note detail integration", () => {
  it("loads notes for a native completed order even with no status transitions", async () => {
    const view = await NativeOrderPage({ params: Promise.resolve({ id }) });
    expect(mock.staff).toHaveBeenCalledWith(["admin"]);
    expect(mock.commerce).toHaveBeenCalledWith("tasting-owner");
    expect(mock.notes).toHaveBeenCalledWith(client, "native", id);
    expect(notePanel(view)?.key).toBe("native:" + id);
  });
  it("does not load notes if the native administrator connection is absent", async () => {
    mock.commerce.mockResolvedValue(null);
    await NativeOrderPage({ params: Promise.resolve({ id }) });
    expect(mock.notes).not.toHaveBeenCalled(); expect(mock.detail).not.toHaveBeenCalled();
  });
  it("does not load notes for an unavailable order", async () => {
    mock.detail.mockResolvedValue({ state: "not_found" });
    await expect(NativeOrderPage({ params: Promise.resolve({ id }) })).rejects.toThrow("not-found");
    expect(mock.notes).not.toHaveBeenCalled();
  });
  it("loads one expanded imported record with its exact string ID", async () => {
    const importedId = "18446744073709551615";
    mock.imported.mockResolvedValue({ page: { kind: "items", sourceOrderId: importedId, rows: [], total: 0, importedAt: "2026-09-13T20:00:00Z", nextCursor: null }, message: null, operations: new Map() });
    const view = await ImportedOrders({ client: client as never, params: { id: importedId, items: "1" } });
    expect(mock.notes).toHaveBeenCalledWith(client, "imported", importedId);
    expect(notePanel(view)?.key).toBe("imported:" + importedId);
    mock.imported.mockResolvedValue({ page: { kind: "items", sourceOrderId: "123", rows: [], total: 0, importedAt: "2026-09-13T20:00:00Z", nextCursor: null }, message: null, operations: new Map() });
    const another = await ImportedOrders({ client: client as never, params: { id: "123", items: "1" } });
    // Changing only the query-selected order must remount the draft/recipient state.
    expect(notePanel(another)?.key).toBe("imported:123");
    expect(notePanel(another)?.key).not.toBe(notePanel(view)?.key);
  });
  it("does not load per-order customer notes for an imported list", async () => {
    mock.imported.mockResolvedValue({ page: { kind: "orders", rows: [], total: 0, importedAt: "2026-09-13T20:00:00Z", nextCursor: null }, message: null, operations: new Map() });
    await ImportedOrders({ client: client as never, params: {} });
    expect(mock.notes).not.toHaveBeenCalled();
  });
});
