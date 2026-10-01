"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { authorizedCommerceClient } from "@/lib/supabase/commerce-server";
import { CouponValidationError, couponStatuses, parseCouponDefinition, type CouponDefinition, type CouponStatus } from "@/lib/admin/coupons";

export type CouponActionResult = { ok: boolean; message: string; code?: "invalid" | "denied" | "conflict" | "unconfirmed"; couponId?: string };
const initialFailure = (message: string, code: CouponActionResult["code"] = "invalid"): CouponActionResult => ({ ok: false, message, code });
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const codePattern = /^[A-Z0-9][A-Z0-9_-]{0,63}$/;

async function adminClient() {
  const staff = await requireStaff(["admin"]);
  return authorizedCommerceClient(staff.user.id);
}
function rpcFailure(data: unknown, error: { code?: string } | null): CouponActionResult | null {
  const reason = data && typeof data === "object" && "reason" in data ? String(data.reason) : "";
  if (reason === "version_conflict" || error?.code === "40001") return initialFailure("This coupon changed since you opened it. Refresh before saving your changes.", "conflict");
  if (error?.code === "42501" || reason === "forbidden") return initialFailure("Your store account cannot manage coupons.", "denied");
  if (error || reason) return initialFailure("The coupon change could not be confirmed. Refresh and try again.", "unconfirmed");
  return null;
}

export async function saveCoupon(_previous: CouponActionResult, form: FormData): Promise<CouponActionResult> {
  const client = await adminClient();
  if (!client) return initialFailure("Reconnect your store administrator account before managing coupons.", "denied");
  const couponId = String(form.get("couponId") ?? "");
  const isEdit = couponId.length > 0;
  const version = Number(form.get("expectedVersion"));
  if (isEdit && (!idPattern.test(couponId) || !Number.isSafeInteger(version) || version < 1)) return initialFailure("Refresh this coupon before saving it.");
  let definition: CouponDefinition;
  try { definition = parseCouponDefinition(form, isEdit ? String(form.get("immutableCode") ?? "") : undefined); }
  catch (error) { return initialFailure(error instanceof CouponValidationError ? error.message : "Review the coupon fields and try again.", "invalid"); }
  try {
    const result = await (isEdit
      ? client.rpc("commerce_admin_coupon_update_v1", { p_coupon_id: couponId, p_expected_version: version, p_definition: definition, p_request_id: randomUUID() })
      : client.rpc("commerce_admin_coupon_create_v1", { p_definition: definition, p_request_id: randomUUID() }))
      .abortSignal(AbortSignal.timeout(15_000));
    const failed = rpcFailure(result.data, result.error);
    if (failed) return failed;
    const data = result.data as { ok?: boolean; couponId?: string; version?: number } | null;
    if (!data?.ok || !data.couponId || !idPattern.test(data.couponId)) return initialFailure("The saved coupon could not be confirmed. Refresh the list before retrying.", "unconfirmed");
    revalidatePath("/admin/coupons");
    return { ok: true, couponId: data.couponId, message: isEdit ? "Coupon saved." : "Coupon created." };
  } catch { return initialFailure("The coupon change could not be confirmed. Try again.", "unconfirmed"); }
}

export async function duplicateCoupon(_previous: CouponActionResult, form: FormData): Promise<CouponActionResult> {
  const client = await adminClient();
  if (!client) return initialFailure("Reconnect your store administrator account before managing coupons.", "denied");
  const couponId = String(form.get("couponId") ?? "");
  const code = String(form.get("newCode") ?? "").trim().toUpperCase();
  if (!idPattern.test(couponId) || !codePattern.test(code)) return initialFailure("Enter a new code using letters, numbers, hyphens, or underscores.");
  try {
    const result = await client.rpc("commerce_admin_coupon_duplicate_v1", { p_coupon_id: couponId, p_new_code: code, p_request_id: randomUUID() }).abortSignal(AbortSignal.timeout(15_000));
    const failed = rpcFailure(result.data, result.error); if (failed) return failed;
    const data = result.data as { ok?: boolean; couponId?: string } | null;
    if (!data?.ok || !data.couponId || !idPattern.test(data.couponId)) return initialFailure("The duplicate could not be confirmed.", "unconfirmed");
    revalidatePath("/admin/coupons");
    return { ok: true, couponId: data.couponId, message: `${code} was created as a draft.` };
  } catch { return initialFailure("The duplicate could not be confirmed. Try again.", "unconfirmed"); }
}

export async function setCouponStatus(_previous: CouponActionResult, form: FormData): Promise<CouponActionResult> {
  const client = await adminClient();
  if (!client) return initialFailure("Reconnect your store administrator account before managing coupons.", "denied");
  const couponId = String(form.get("couponId") ?? ""), target = String(form.get("targetStatus")) as CouponStatus;
  const version = Number(form.get("expectedVersion"));
  if (!idPattern.test(couponId) || !couponStatuses.includes(target) || !Number.isSafeInteger(version) || version < 1 || (target === "archived" && form.get("confirmArchive") !== "yes")) return initialFailure("Review and confirm this coupon change.");
  try {
    const result = await client.rpc("commerce_admin_coupon_set_status_v1", { p_coupon_id: couponId, p_expected_version: version, p_status: target, p_request_id: randomUUID() }).abortSignal(AbortSignal.timeout(15_000));
    const failed = rpcFailure(result.data, result.error); if (failed) return failed;
    const data = result.data as { ok?: boolean } | null;
    if (!data?.ok) return initialFailure("The status change could not be confirmed.", "unconfirmed");
    revalidatePath("/admin/coupons");
    return { ok: true, message: target === "archived" ? "Coupon archived." : `Coupon set to ${target}.` };
  } catch { return initialFailure("The status change could not be confirmed. Try again.", "unconfirmed"); }
}
