import { describe, expect, it, vi } from "vitest";
import { publishMerchantListing } from "@/lib/tea-merchant";

describe("Tea Merchant listing interaction", () => {
  it("publishes the selected source card with the canonical RPC argument", async () => {
    const rpc = vi.fn(async () => ({ data: "listing-1", error: null }));

    await expect(publishMerchantListing(rpc, "card-1")).resolves.toBe("listing-1");
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("publish_merchant_listing", { p_card_id: "card-1" });
  });

  it("surfaces the listing failure instead of silently leaving the button unchanged", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "Card is not eligible." } }));

    await expect(publishMerchantListing(rpc, "card-2")).rejects.toThrow("Card is not eligible.");
  });
});
