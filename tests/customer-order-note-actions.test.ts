import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ staff: vi.fn(), commerce: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireStaff: mocks.staff }));
vi.mock("@/lib/supabase/commerce-server", () => ({ authorizedCommerceClient: mocks.commerce }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { previewCustomerOrderNote, refreshCustomerOrderNotes, sendCustomerOrderNote } from "@/app/admin/orders/customer-note-actions";

const orderId = "10000000-0000-4000-8000-000000000001", operationId = "20000000-0000-4000-8000-000000000001";
const request = { kind: "native", orderId, operationId, sourceVersion: "a".repeat(64), body: "Your tea is ready." };
const context = { kind: "native", orderId, orderNumber: "10008", recipientEmail: "buyer@example.test", sourceVersion: request.sourceVersion, canSend: true, unavailableReason: null, notes: [], hasMore: false };
const receipt = { kind: "native", orderId, noteId: operationId, status: "pending", createdAt: "2026-09-13T20:00:00Z", replayed: false };
function response(data: unknown, error: unknown = null) { mocks.rpc.mockReturnValue({ abortSignal: vi.fn().mockResolvedValue({ data, error }) }); }
beforeEach(() => { vi.resetAllMocks(); mocks.staff.mockResolvedValue({ user: { id: "tasting-admin" } }); mocks.commerce.mockResolvedValue({ rpc: mocks.rpc }); });

describe("customer note server actions", () => {
  it("reauthorizes preview and reads without queueing or sending", async () => {
    response(context);
    expect(await previewCustomerOrderNote("native", orderId, "  Hello\r\nthere  ")).toEqual({ ok: true, context, body: "Hello\nthere" });
    expect(mocks.staff).toHaveBeenCalledWith(["admin"]);
    expect(mocks.commerce).toHaveBeenCalledWith("tasting-admin");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("vf_admin_customer_order_notes_v1", { p_order_kind: "native", p_order_id: orderId });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("does not access native data when staff authentication fails", async () => {
    mocks.staff.mockRejectedValue(Error("redirect"));
    await expect(previewCustomerOrderNote("native", orderId, request.body)).rejects.toThrow();
    await expect(sendCustomerOrderNote(request)).rejects.toThrow();
    await expect(refreshCustomerOrderNotes("native", orderId)).rejects.toThrow();
    expect(mocks.commerce).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("denies a missing or mismatched native administrator binding before RPC", async () => {
    mocks.commerce.mockResolvedValue(null);
    expect(await sendCustomerOrderNote(request)).toMatchObject({ ok: false, code: "denied" });
    expect((await refreshCustomerOrderNotes("native", orderId)).context).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects missing recipient and invalid body during preview", async () => {
    response({ ...context, canSend: false, recipientEmail: null, unavailableReason: "recipient_ambiguous" });
    expect(await previewCustomerOrderNote("native", orderId, request.body)).toMatchObject({ ok: false });
    response(context);
    expect(await previewCustomerOrderNote("native", orderId, "Hi")).toMatchObject({ ok: false });
  });
  it("rejects invalid references or arbitrary recipient injection before sending", async () => {
    expect(await sendCustomerOrderNote({ ...request, recipientEmail: "other@example.test" })).toMatchObject({ ok: false, code: "invalid" });
    expect(await sendCustomerOrderNote({ ...request, orderId: "bad" })).toMatchObject({ ok: false, code: "invalid" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("sends exact preview input, reauthorizes and returns only a verified durable receipt", async () => {
    response(receipt);
    expect(await sendCustomerOrderNote(request)).toEqual({ ok: true, receipt });
    expect(mocks.staff).toHaveBeenCalledWith(["admin"]);
    expect(mocks.rpc).toHaveBeenCalledWith("vf_admin_send_customer_order_note_v1", { p_order_kind: "native", p_order_id: orderId, p_operation_id: operationId, p_expected_source_version: request.sourceVersion, p_body: request.body });
    expect(mocks.revalidate.mock.calls).toEqual([["/admin/orders"], ["/admin/orders/native/" + orderId]]);
  });
  it("preserves the same operation when the same request is retried", async () => {
    response({ ...receipt, replayed: true });
    await sendCustomerOrderNote(request); await sendCustomerOrderNote(request);
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
  });
  it.each([["40001", "stale"], ["42501", "denied"], ["22023", "invalid"], ["23505", "invalid"], ["55000", "invalid"], ["P0002", "invalid"], ["57014", "unconfirmed"]])("maps %s safely to %s", async (sqlCode, expected) => {
    response(null, { code: sqlCode, message: "private database detail" });
    const result = await sendCustomerOrderNote(request);
    expect(result).toMatchObject({ ok: false, code: expected });
    expect(JSON.stringify(result)).not.toContain("private database detail");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("keeps transport loss or a mismatched receipt unconfirmed", async () => {
    mocks.rpc.mockReturnValue({ abortSignal: vi.fn().mockRejectedValue(Error("timeout with private body")) });
    expect(await sendCustomerOrderNote(request)).toMatchObject({ ok: false, code: "unconfirmed" });
    response({ ...receipt, noteId: orderId });
    expect(await sendCustomerOrderNote(request)).toMatchObject({ ok: false, code: "unconfirmed" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("does not coerce a wide imported ID or revalidate a native route for it", async () => {
    const imported = { ...request, kind: "imported", orderId: "18446744073709551615" };
    response({ ...receipt, kind: "imported", orderId: imported.orderId });
    expect(await sendCustomerOrderNote(imported)).toMatchObject({ ok: true });
    expect(mocks.rpc.mock.calls[0][1].p_order_id).toBe(imported.orderId);
    expect(mocks.revalidate.mock.calls).toEqual([["/admin/orders"]]);
  });
});
