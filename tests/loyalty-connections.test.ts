import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

describe("Gold Leaves connections", () => {
  it("loads the canonical wallet, stall, and market for the customer dashboard", () => {
    const page = source("src/app/dashboard/page.tsx");
    expect(page).toContain('supabase.rpc("get_my_loyalty_summary")');
    expect(page).toContain('supabase.rpc("get_my_merchant_cards")');
    expect(page).toContain('supabase.rpc("get_merchant_market")');
    expect(page).toContain("loyaltySummary={loyaltySummary}");
    expect(page).toContain("merchantCards={merchantCards}");
    expect(page).toContain("merchantListings={merchantListings}");
  });

  it("uses real Tea Merchant mutations instead of demo market days", () => {
    const merchant = source("src/components/tea-lab/TeaMerchant.tsx");
    const listing = source("src/lib/tea-merchant.ts");
    expect(merchant).toContain("publishMerchantListing");
    expect(merchant).toContain('listingStatus: "active"');
    expect(listing).toContain('rpc("publish_merchant_listing"');
    expect(merchant).toContain('rpc("set_merchant_listing_status"');
    expect(merchant).toContain('rpc("purchase_study_copy"');
    expect(merchant).toContain("List selected card");
    expect(merchant).toContain("Select for market");
    expect(merchant).toContain("flippedCards");
    expect(merchant).toContain("Double-tap its shield");
    expect(merchant).not.toContain("<TastingCardDialog");
    expect(merchant).not.toContain("Deshield card");
    expect(merchant).not.toContain("Open card");
    expect(merchant).not.toContain("My Stall");
    expect(merchant).not.toContain("Run market day");
    expect(merchant).not.toContain("Demo leaves");
    expect(merchant).not.toContain("1240");
  });

  it("shows the same wallet and listable-card count in Tea Cellar", () => {
    const cellar = source("src/components/tea-lab/TeaPassport.tsx");
    expect(cellar).toContain("loyaltySummary.pointsBalance");
    expect(cellar).toContain("eligibleMerchantCards");
    expect(cellar).not.toContain("private demo market day");
  });

  it("bridges the authenticated mobile identity to the production wallet", () => {
    const route = source("src/app/api/mobile-auth/loyalty/route.ts");
    expect(route).toContain("getMobileUser");
    expect(route).toContain("admin.auth.admin.generateLink");
    expect(route).toContain('admin.rpc("register_mobile_customer"');
    expect(route).toContain('admin.rpc("get_mobile_loyalty_summary"');
    expect(route).toContain('"Cache-Control": "private, no-store"');
  });
});
