import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ staff: vi.fn(), commerce: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireStaff: mocks.staff }));
vi.mock("@/lib/supabase/commerce-server", () => ({ authorizedCommerceClient: mocks.commerce }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { addPrivateOrderNote, refreshPrivateOrderNotes } from "@/app/admin/orders/private-note-actions";

const orderId = "10000000-0000-4000-8000-000000000001", operationId = "20000000-0000-4000-8000-000000000001";
const request = { kind: "native", orderId, operationId, body: "Keep this packing instruction private." };
const context = { kind: "native", orderId, orderNumber: "10008", notes: [], hasMore: false };
const receipt = { kind: "native", orderId, noteId: operationId, authorName: "Staff member", createdAt: "2026-09-13T21:00:00Z", replayed: false };
function response(data: unknown, error: unknown = null) { mocks.rpc.mockReturnValue({ abortSignal: vi.fn().mockResolvedValue({ data, error }) }); }
beforeEach(() => { vi.resetAllMocks(); mocks.staff.mockResolvedValue({ user: { id: "tasting-admin" } }); mocks.commerce.mockResolvedValue({ rpc: mocks.rpc }); });

describe("private staff note server actions", () => {
  it("reauthorizes history reads without invoking a write or email RPC", async () => {
    response(context);
    expect(await refreshPrivateOrderNotes("native", orderId)).toEqual({ context, error: null });
    expect(mocks.staff).toHaveBeenCalledWith(["admin"]);
    expect(mocks.commerce).toHaveBeenCalledWith("tasting-admin");
    expect(mocks.rpc.mock.calls).toEqual([["vf_admin_private_order_notes_v1", { p_order_kind: "native", p_order_id: orderId }]]);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("does not touch native data if staff authorization fails", async () => {
    mocks.staff.mockRejectedValue(Error("redirect"));
    await expect(refreshPrivateOrderNotes("native", orderId)).rejects.toThrow();
    await expect(addPrivateOrderNote(request)).rejects.toThrow();
    expect(mocks.commerce).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("denies an absent or mismatched native administrator connection before any RPC", async () => {
    mocks.commerce.mockResolvedValue(null);
    expect(await addPrivateOrderNote(request)).toMatchObject({ ok: false, code: "denied" });
    expect((await refreshPrivateOrderNotes("native", orderId)).context).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([{ authorName: "Forged staff" }, { recipientEmail: "customer@example.test" }, { sendEmail: true }, { orderId: "bad" }, { body: "Hi" }])("rejects invalid or forged request %# before write", async change => {
    expect(await addPrivateOrderNote({ ...request, ...change })).toMatchObject({ ok: false, code: "invalid" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("saves only into the private RPC and trusts the verified receipt for author and time", async () => {
    response(receipt);
    expect(await addPrivateOrderNote(request)).toEqual({ ok: true, receipt });
    expect(mocks.staff).toHaveBeenCalledWith(["admin"]);
    expect(mocks.rpc.mock.calls).toEqual([["vf_admin_add_private_order_note_v1", { p_order_kind: "native", p_order_id: orderId, p_operation_id: operationId, p_body: request.body }]]);
    expect(mocks.revalidate.mock.calls).toEqual([["/admin/orders"], ["/admin/orders/native/" + orderId]]);
  });
  it("normalizes before writing and retains the exact UUID/body on a retry", async () => {
    response({ ...receipt, replayed: true });
    await addPrivateOrderNote({ ...request, body: "  Staff\r\nnote  " });
    await addPrivateOrderNote({ ...request, body: "Staff\nnote" });
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
    expect(mocks.rpc.mock.calls[0][1].p_body).toBe("Staff\nnote");
  });
  it.each([["42501", "denied"], ["22023", "invalid"], ["23505", "invalid"], ["P0002", "invalid"], ["57014", "unconfirmed"]])("maps %s to %s without exposing database details", async (code, expected) => {
    response(null, { code, message: "private database detail" });
    const result = await addPrivateOrderNote(request);
    expect(result).toMatchObject({ ok: false, code: expected }); expect(JSON.stringify(result)).not.toContain("private database detail");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("treats a lost response or mismatched receipt as unconfirmed", async () => {
    mocks.rpc.mockReturnValue({ abortSignal: vi.fn().mockRejectedValue(Error("timeout")) });
    expect(await addPrivateOrderNote(request)).toMatchObject({ ok: false, code: "unconfirmed" });
    response({ ...receipt, noteId: orderId });
    expect(await addPrivateOrderNote(request)).toMatchObject({ ok: false, code: "unconfirmed" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("preserves wide imported identifiers and revalidates no customer route", async () => {
    const imported = { ...request, kind: "imported", orderId: "18446744073709551615" };
    response({ ...receipt, kind: "imported", orderId: imported.orderId });
    expect(await addPrivateOrderNote(imported)).toMatchObject({ ok: true });
    expect(mocks.rpc.mock.calls[0][1].p_order_id).toBe(imported.orderId);
    expect(mocks.revalidate.mock.calls).toEqual([["/admin/orders"]]);
  });
});
