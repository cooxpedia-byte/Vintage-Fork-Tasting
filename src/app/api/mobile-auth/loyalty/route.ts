import { type NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getMobileUser } from "@/lib/mobile-auth";
import { createAdminClient } from "@/lib/supabase/admin";

type MobileLoyaltyRow = {
  owner_user_id: string;
  wallet_id: string;
  points_balance: number;
  points_label: string;
  earning_enabled: boolean;
  redemption_enabled: boolean;
};

export async function GET(request: NextRequest) {
  const mobileUser = await getMobileUser(request.headers.get("authorization"));
  if (!mobileUser) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!mobileUser.email) return NextResponse.json({ error: "This account has no email address." }, { status: 422 });

  const admin = createAdminClient();
  let { data: summaryRows, error: summaryError } = await admin.rpc("get_mobile_loyalty_summary", {
    p_mobile_auth_user_id: mobileUser.id
  });
  if (summaryError) {
    logger.error("mobile_loyalty_lookup_failed", summaryError, { surface: "mobile_loyalty" });
    return NextResponse.json({ error: "Your Gold Leaves could not be loaded." }, { status: 503 });
  }

  let summary = ((summaryRows ?? []) as MobileLoyaltyRow[])[0];
  if (!summary) {
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: mobileUser.email,
      options: {
        data: {
          full_name: mobileUser.user_metadata?.full_name ?? mobileUser.user_metadata?.display_name ?? null,
          mobile_auth_user_id: mobileUser.id,
          vintagefork_identity_version: "1"
        }
      }
    });
    if (linkError || !linkData.user?.id) {
      logger.error("mobile_loyalty_identity_link_failed", linkError, { surface: "mobile_loyalty" });
      return NextResponse.json({ error: "Your Gold Leaves account could not be linked." }, { status: 503 });
    }

    const { error: registerError } = await admin.rpc("register_mobile_customer", {
      p_mobile_auth_user_id: mobileUser.id,
      p_owner_user_id: linkData.user.id,
      p_email: mobileUser.email
    });
    if (registerError) {
      logger.error("mobile_loyalty_registration_failed", registerError, { surface: "mobile_loyalty" });
      return NextResponse.json({ error: "Your Gold Leaves account is not ready." }, { status: 503 });
    }

    ({ data: summaryRows, error: summaryError } = await admin.rpc("get_mobile_loyalty_summary", {
      p_mobile_auth_user_id: mobileUser.id
    }));
    summary = ((summaryRows ?? []) as MobileLoyaltyRow[])[0];
    if (summaryError || !summary) {
      logger.error("mobile_loyalty_registration_load_failed", summaryError, { surface: "mobile_loyalty" });
      return NextResponse.json({ error: "Your Gold Leaves account is not ready." }, { status: 503 });
    }
  }

  const { error: refreshError } = await admin.rpc("refresh_merchant_card_progress", {
    p_owner_user_id: summary.owner_user_id
  });
  if (refreshError) {
    logger.error("mobile_loyalty_load_failed", refreshError, { surface: "mobile_loyalty" });
    return NextResponse.json({ error: "Your Gold Leaves could not be loaded." }, { status: 503 });
  }

  const { count, error: cardError } = await admin.from("merchant_card_progress")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", summary.owner_user_id)
    .eq("listing_eligible", true);
  if (cardError) {
    logger.warn("mobile_loyalty_card_count_failed", { surface: "mobile_loyalty", code: cardError.code });
  }

  return NextResponse.json({
    balance: Number(summary.points_balance),
    label: summary.points_label,
    earningEnabled: summary.earning_enabled,
    redemptionEnabled: summary.redemption_enabled,
    eligibleCardCount: count ?? 0
  }, { headers: { "Cache-Control": "private, no-store" } });
}
