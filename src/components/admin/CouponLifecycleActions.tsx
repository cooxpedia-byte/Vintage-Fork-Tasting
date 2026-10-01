"use client";

import { useActionState } from "react";
import { duplicateCoupon, setCouponStatus, type CouponActionResult } from "@/app/admin/coupons/actions";
import type { CouponDetail, CouponStatus } from "@/lib/admin/coupons";

const empty: CouponActionResult = { ok: false, message: "" };
function StatusAction({ coupon, target, label, archive = false }: { coupon: CouponDetail; target: CouponStatus; label: string; archive?: boolean }) {
  const [state, action, pending] = useActionState(setCouponStatus, empty);
  return <form action={action} className="coupon-compact-action"><input type="hidden" name="couponId" value={coupon.couponId}/><input type="hidden" name="expectedVersion" value={coupon.version}/><input type="hidden" name="targetStatus" value={target}/>{archive && <label><input type="checkbox" name="confirmArchive" value="yes"/> I understand archived coupons cannot be restored.</label>}<button className="btn btn-secondary" disabled={pending} type="submit">{pending ? "Updating…" : label}</button>{state.message && <p role={state.ok ? "status" : "alert"}>{state.message}</p>}</form>;
}
function DuplicateAction({ coupon }: { coupon: CouponDetail }) {
  const [state, action, pending] = useActionState(duplicateCoupon, empty);
  return <form action={action} className="coupon-compact-action"><input type="hidden" name="couponId" value={coupon.couponId}/><label><span>New coupon code</span><input name="newCode" required maxLength={64} placeholder={`${coupon.code}_COPY`}/></label><button className="btn btn-secondary" disabled={pending} type="submit">{pending ? "Duplicating…" : "Duplicate as draft"}</button>{state.message && <p role={state.ok ? "status" : "alert"}>{state.message}{state.ok && state.couponId ? <> <a href={`/admin/coupons?coupon=${state.couponId}`}>Open duplicate</a></> : null}</p>}</form>;
}
export function CouponLifecycleActions({ coupon }: { coupon: CouponDetail }) {
  if (coupon.status === "archived") return <section className="admin-panel"><h2>Archived</h2><p>This coupon remains available for reporting and cannot be restored.</p></section>;
  return <section className="admin-panel coupon-lifecycle"><h2>Coupon actions</h2><div className="coupon-action-grid"><DuplicateAction coupon={coupon}/>{coupon.status === "active" || coupon.status === "scheduled" ? <StatusAction coupon={coupon} target="paused" label="Pause coupon"/> : <StatusAction coupon={coupon} target="active" label="Activate coupon"/>}<StatusAction coupon={coupon} target="archived" label="Archive coupon" archive/></div></section>;
}
