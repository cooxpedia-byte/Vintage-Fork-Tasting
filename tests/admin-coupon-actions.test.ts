import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ staff: vi.fn(), commerce: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireStaff: mocks.staff }));
vi.mock("@/lib/supabase/commerce-server", () => ({ authorizedCommerceClient: mocks.commerce }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { saveCoupon, setCouponStatus } from "@/app/admin/coupons/actions";

const id = "10000000-0000-4000-8000-000000000001";
function form() { const data = new FormData(); Object.entries({ code: "SAVE10", name: "Save ten", status: "active", discountType: "fixed", fixedAmount: "10.00", minimumQuantity: "0", minimumSpend: "0", audience: "all" }).forEach(([k,v]) => data.set(k,v)); return data; }
function response(data: unknown, error: unknown = null) { mocks.rpc.mockReturnValue({ abortSignal: vi.fn().mockResolvedValue({ data, error }) }); }
beforeEach(() => { vi.resetAllMocks(); mocks.staff.mockResolvedValue({ user: { id: "staff" } }); mocks.commerce.mockResolvedValue({ rpc: mocks.rpc }); });
describe("coupon server actions", () => {
  it("requires the bound native administrator before mutation", async () => { mocks.commerce.mockResolvedValue(null); await expect(saveCoupon({ ok:false,message:"" }, form())).resolves.toMatchObject({ ok:false, code:"denied" }); expect(mocks.rpc).not.toHaveBeenCalled(); });
  it("creates through the audited RPC with private visibility by default", async () => { response({ ok:true, couponId:id, version:1 }); const result = await saveCoupon({ok:false,message:""},form()); expect(result).toMatchObject({ok:true,couponId:id}); expect(mocks.rpc.mock.calls[0][0]).toBe("commerce_admin_coupon_create_v1"); expect(mocks.rpc.mock.calls[0][1].p_definition.discount.fixedCents).toBe(1000); expect(mocks.rpc.mock.calls[0][1].p_definition.visibility).toBe("private"); expect(mocks.revalidate).toHaveBeenCalledWith("/admin/coupons"); });
  it("maps optimistic concurrency failures without database detail", async () => { const data=form(); data.set("couponId",id); data.set("expectedVersion","2"); data.set("immutableCode","SAVE10"); response({ok:false,reason:"version_conflict"},{code:"40001",message:"private"}); const result=await saveCoupon({ok:false,message:""},data); expect(result).toMatchObject({ok:false,code:"conflict"}); expect(JSON.stringify(result)).not.toContain("private"); });
  it("never returns thrown upstream error text", async () => { mocks.rpc.mockReturnValue({abortSignal:vi.fn().mockRejectedValue(Error("secret upstream connection detail"))}); const result=await saveCoupon({ok:false,message:""},form()); expect(result).toMatchObject({ok:false,code:"unconfirmed"}); expect(JSON.stringify(result)).not.toContain("secret upstream"); });
  it("requires explicit confirmation before irreversible archive", async () => { const data=new FormData(); data.set("couponId",id); data.set("expectedVersion","2"); data.set("targetStatus","archived"); await expect(setCouponStatus({ok:false,message:""},data)).resolves.toMatchObject({ok:false,code:"invalid"}); expect(mocks.rpc).not.toHaveBeenCalled(); });
});
