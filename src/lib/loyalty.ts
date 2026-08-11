export type LoyaltySummary = {
  customerId: string;
  accountId: string;
  accountStatus: string;
  pointsBalance: number;
  pointsLabel: string;
  earningEnabled: boolean;
  redemptionEnabled: boolean;
};

export type MerchantCard = {
  cardId: string;
  teaName: string;
  teaCategory: string;
  origin: string;
  producer: string;
  cardTier: "polychrome" | "shielded";
  tastingCount: number;
  listingEligible: boolean;
  pricingSource: "catalogue" | "flat_rate";
  pricePerKiloCents: number | null;
  leafPrice: number;
  listingId: string | null;
  listingStatus: "active" | "paused" | null;
  studyCount: number;
  leavesEarned: number;
  preview: Record<string, unknown>;
};

export type MerchantListing = {
  listingId: string;
  teaName: string;
  teaCategory: string;
  origin: string;
  producer: string;
  creatorDisplayName: string;
  sourceTier: "polychrome" | "shielded";
  rarity: string;
  pricingSource: "catalogue" | "flat_rate";
  pricePerKiloCents: number | null;
  leafPrice: number;
  likeCount: number;
  studyCount: number;
  helpfulPercentage: number;
  preview: Record<string, unknown>;
  sourceTastings: number;
  teaAvailable: boolean;
  publishedAt: string;
};

type LoyaltySummaryRow = {
  customer_id: string;
  account_id: string;
  account_status: string;
  points_balance: number;
  points_label: string;
  earning_enabled: boolean;
  redemption_enabled: boolean;
};

type MerchantCardRow = {
  card_id: string;
  tea_name: string;
  tea_category: string;
  origin: string;
  producer: string;
  card_tier: "polychrome" | "shielded";
  tasting_count: number;
  listing_eligible: boolean;
  pricing_source: "catalogue" | "flat_rate";
  price_per_kilo_cents: number | null;
  leaf_price: number;
  listing_id: string | null;
  listing_status: "active" | "paused" | null;
  study_count: number;
  leaves_earned: number;
  preview: Record<string, unknown> | null;
};

type MerchantListingRow = {
  listing_id: string;
  tea_name: string;
  tea_category: string;
  origin: string;
  producer: string;
  creator_display_name: string;
  source_tier: "polychrome" | "shielded";
  rarity: string;
  pricing_source: "catalogue" | "flat_rate";
  price_per_kilo_cents: number | null;
  leaf_price: number;
  like_count: number;
  study_count: number;
  helpful_percentage: number;
  preview: Record<string, unknown> | null;
  source_tastings: number;
  tea_available: boolean;
  published_at: string;
};

export function mapLoyaltySummary(row: LoyaltySummaryRow | undefined): LoyaltySummary | null {
  return row ? {
    customerId: row.customer_id,
    accountId: row.account_id,
    accountStatus: row.account_status,
    pointsBalance: Number(row.points_balance),
    pointsLabel: row.points_label,
    earningEnabled: row.earning_enabled,
    redemptionEnabled: row.redemption_enabled
  } : null;
}

export function mapMerchantCards(rows: MerchantCardRow[] | null): MerchantCard[] {
  return (rows ?? []).map(row => ({
    cardId: row.card_id,
    teaName: row.tea_name,
    teaCategory: row.tea_category,
    origin: row.origin,
    producer: row.producer,
    cardTier: row.card_tier,
    tastingCount: Number(row.tasting_count),
    listingEligible: row.listing_eligible,
    pricingSource: row.pricing_source,
    pricePerKiloCents: row.price_per_kilo_cents,
    leafPrice: Number(row.leaf_price),
    listingId: row.listing_id,
    listingStatus: row.listing_status,
    studyCount: Number(row.study_count),
    leavesEarned: Number(row.leaves_earned),
    preview: row.preview ?? {}
  }));
}

export function mapMerchantListings(rows: MerchantListingRow[] | null): MerchantListing[] {
  return (rows ?? []).map(row => ({
    listingId: row.listing_id,
    teaName: row.tea_name,
    teaCategory: row.tea_category,
    origin: row.origin,
    producer: row.producer,
    creatorDisplayName: row.creator_display_name,
    sourceTier: row.source_tier,
    rarity: row.rarity,
    pricingSource: row.pricing_source,
    pricePerKiloCents: row.price_per_kilo_cents,
    leafPrice: Number(row.leaf_price),
    likeCount: Number(row.like_count),
    studyCount: Number(row.study_count),
    helpfulPercentage: Number(row.helpful_percentage),
    preview: row.preview ?? {},
    sourceTastings: Number(row.source_tastings),
    teaAvailable: row.tea_available,
    publishedAt: row.published_at
  }));
}
