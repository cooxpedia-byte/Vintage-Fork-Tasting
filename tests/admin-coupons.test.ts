import { describe, expect, it, vi } from "vitest";
import { loadCouponReport, loadCoupons, parseCouponDefinition } from "@/lib/admin/coupons";
import { couponLocalDateTimeOffset } from "@/lib/admin/coupon-datetime";

function form(overrides: Record<string, string | string[]> = {}) {
  const values: Record<string, string | string[]> = { code: " welcome10 ", name: "Welcome tea", status: "active", discountType: "fixed", fixedAmount: "9.50", minimumQuantity: "3", minimumSpend: "28.50", audience: "all", ...overrides };
  const data = new FormData(); Object.entries(values).forEach(([key, value]) => (Array.isArray(value) ? value : [value]).forEach((item) => data.append(key, item))); return data;
}
const chained = (result: unknown) => ({ abortSignal: vi.fn().mockResolvedValue(result) });
describe("coupon admin contract", () => {
  it("builds integer-cent fixed rules and structured pickers", () => {
    const definition = parseCouponDefinition(form({ includeCategoryKeys: ["loose_leaf"], includeProductIds: ["10000000-0000-4000-8000-000000000001"], excludeSale: "on", allowGoldLeaves: "on" }));
    expect(definition).toMatchObject({ code: "WELCOME10", visibility:"private", discount: { type: "fixed", fixedCents: 950 }, minimum: { eligibleQuantity: 3, eligibleSpendCents: 2850 }, scope: { includeCategoryKeys: ["loose_leaf"], excludeSale: true }, allowGoldLeaves: true });
  });
  it("requires an explicit valid choice to make a coupon public",()=>{
    expect(parseCouponDefinition(form({visibility:"public"})).visibility).toBe("public");
    expect(()=>parseCouponDefinition(form({visibility:"listed"}))).toThrow(/private or public/i);
  });
  it("converts percentage and cap without floating cents", () => {
    const definition = parseCouponDefinition(form({ discountType: "percent", percentage: "33.33", maxAmount: "12.34" }));
    expect(definition.discount).toEqual({ type: "percent", basisPoints: 3333, maxCents: 1234, currency: "cad" });
  });
  it("requires a start for scheduled coupons and customers for selected offers", () => {
    expect(() => parseCouponDefinition(form({ status: "scheduled" }))).toThrow(/start date/i);
    expect(() => parseCouponDefinition(form({ audience: "selected" }))).toThrow(/customer/i);
  });
  it("keeps the stored code immutable on edit", () => expect(parseCouponDefinition(form({ code: "CHANGED" }), "ORIGINAL").code).toBe("ORIGINAL"));
  it("converts browser-local schedule values with the selected date's timezone offset", () => {
    const definition=parseCouponDefinition(form({status:"scheduled",startsAt:"2026-12-15T09:30",startsAtTimezoneOffset:"420"}));
    expect(definition.startsAt).toBe("2026-12-15T16:30:00.000Z");
  });
  it("uses independent offsets when a schedule crosses spring and fall DST changes", () => {
    const spring=parseCouponDefinition(form({status:"scheduled",startsAt:"2026-03-07T09:30",endsAt:"2026-03-09T09:30",startsAtTimezoneOffset:"420",endsAtTimezoneOffset:"360"}));
    expect(spring.startsAt).toBe("2026-03-07T16:30:00.000Z");
    expect(spring.endsAt).toBe("2026-03-09T15:30:00.000Z");
    const fall=parseCouponDefinition(form({status:"scheduled",startsAt:"2026-10-31T09:30",endsAt:"2026-11-02T09:30",startsAtTimezoneOffset:"360",endsAtTimezoneOffset:"420"}));
    expect(fall.startsAt).toBe("2026-10-31T15:30:00.000Z");
    expect(fall.endsAt).toBe("2026-11-02T16:30:00.000Z");
  });
  it("derives Edmonton offsets from each chosen calendar instant", () => {
    const previous=process.env.TZ;process.env.TZ="America/Edmonton";
    try {
      expect(couponLocalDateTimeOffset("2026-01-15T09:30")).toBe(420);
      expect(couponLocalDateTimeOffset("2026-07-15T09:30")).toBe(360);
      expect(couponLocalDateTimeOffset("2026-02-31T09:30")).toBeNull();
      expect(couponLocalDateTimeOffset("2026-03-08T02:30")).toBeNull();
    } finally { if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous; }
  });
  it("rejects calendar dates normalized by Date", () => {
    expect(()=>parseCouponDefinition(form({status:"scheduled",startsAt:"2026-02-31T09:30",startsAtTimezoneOffset:"420"}))).toThrow(/start date is invalid/i);
  });
  it("passes bounded filters to the list RPC and validates rows", async () => {
    const rpc = vi.fn().mockReturnValue(chained({ data: { items: [{ coupon_id: "10000000-0000-4000-8000-000000000001", code: "SAVE10", name: "Save", status: "active", version: 2, redemptions: 4, updated_at: "2026-09-14T12:00:00Z" }] }, error: null }));
    await expect(loadCoupons({ rpc } as never, { status: "active", search: " save " })).resolves.toMatchObject([{ code: "SAVE10", redemptions: 4 }]);
    expect(rpc).toHaveBeenCalledWith("commerce_admin_coupon_list_v1", { p_status: "active", p_search: "save", p_cursor: {}, p_limit: 50 });
  });
  it("uses refund-aware reporting fields", async () => {
    const rpc = vi.fn().mockReturnValue(chained({ data: { items: [{ code: "SAVE10", name: "Save", redemptions: 2, discount_cents: 500, gross_paid_cents: 2000, refunded_cents: 600, net_revenue_cents: 1400 }] }, error: null }));
    await expect(loadCouponReport({ rpc } as never, "from", "to")).resolves.toEqual([{ code: "SAVE10", name: "Save", redemptions: 2, discountCents: 500, grossPaidCents: 2000, refundedCents: 600, netRevenueCents: 1400 }]);
    expect(rpc).toHaveBeenCalledWith("commerce_admin_coupon_report_v1",{p_from:"from",p_to:"to",p_cursor:{},p_limit:50});
  });
});
