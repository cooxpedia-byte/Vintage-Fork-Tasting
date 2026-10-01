"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { saveCoupon, type CouponActionResult } from "@/app/admin/coupons/actions";
import { couponLocalDateTimeOffset } from "@/lib/admin/coupon-datetime";
import type { CouponCatalog, CouponDetail } from "@/lib/admin/coupons";

const empty: CouponActionResult = { ok: false, message: "" };
const dollars = (cents: number | null | undefined) => cents == null ? "" : (cents / 100).toFixed(2);
function DateInput({ name, label, iso }: { name: string; label: string; iso: string | null }) {
  const inputRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{ if(inputRef.current){ const d=iso?new Date(iso):null; inputRef.current.value=d?new Date(d.valueOf()-d.getTimezoneOffset()*60_000).toISOString().slice(0,16):""; } },[iso]);
  return <label><span>{label}</span><input ref={inputRef} type="datetime-local" name={name} defaultValue=""/></label>;
}
function Picker({ label, name, options, selected }: { label: string; name: string; options: { value: string; label: string }[]; selected: string[] }) {
  return <label className="coupon-picker"><span>{label}</span><select name={name} multiple size={Math.min(7, Math.max(3, options.length || 3))} defaultValue={selected}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><small>Use Command or Control to choose more than one.</small></label>;
}
export function CouponBuilder({ catalog, coupon }: { catalog: CouponCatalog; coupon?: CouponDetail }) {
  const [state, action, pending] = useActionState(saveCoupon, empty);
  const d = coupon?.definition;
  const [discountType, setDiscountType] = useState(d?.discount.type ?? "fixed");
  const [audience, setAudience] = useState(d?.audience.type ?? "all");
  const startsOffsetRef=useRef<HTMLInputElement>(null), endsOffsetRef=useRef<HTMLInputElement>(null);
  const products = catalog.products.map((p) => ({ value: p.id, label: p.name }));
  const categories = catalog.categories.map((c) => ({ value: c.key, label: c.name }));
  return <form action={action} className="coupon-builder" onSubmit={(event)=>{
    const form=event.currentTarget;
    const assignOffset=(name:string,ref:typeof startsOffsetRef)=>{
      const input=form.elements.namedItem(name) as HTMLInputElement|null;
      if(!input?.value){if(ref.current)ref.current.value="0";return true;}
      input.setCustomValidity("");
      const offset=couponLocalDateTimeOffset(input.value);
      if(offset===null){input.setCustomValidity("Choose a valid local date and time.");input.reportValidity();return false;}
      if(ref.current)ref.current.value=String(offset);
      return true;
    };
    if(!assignOffset("startsAt",startsOffsetRef)||!assignOffset("endsAt",endsOffsetRef))event.preventDefault();
  }}>
    <input ref={startsOffsetRef} type="hidden" name="startsAtTimezoneOffset" defaultValue="0"/>
    <input ref={endsOffsetRef} type="hidden" name="endsAtTimezoneOffset" defaultValue="0"/>
    {coupon && <><input type="hidden" name="couponId" value={coupon.couponId}/><input type="hidden" name="expectedVersion" value={coupon.version}/><input type="hidden" name="immutableCode" value={coupon.code}/></>}
    <fieldset><legend>Coupon details</legend><div className="coupon-form-grid">
      <label><span>Code</span><input name="code" defaultValue={d?.code ?? ""} readOnly={Boolean(coupon)} required maxLength={64} autoCapitalize="characters"/><small>{coupon ? "The code stays fixed after creation." : "Customers enter this in their cart."}</small></label>
      <label><span>Internal name</span><input name="name" defaultValue={d?.name ?? ""} required maxLength={160}/></label>
      <label><span>Status</span><select name="status" defaultValue={d?.status ?? "draft"}><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="active">Active</option><option value="paused">Paused</option>{coupon?.status === "archived" && <option value="archived">Archived</option>}</select></label>
      <label><span>Storefront visibility</span><select name="visibility" defaultValue={d?.visibility ?? coupon?.visibility ?? "private"}><option value="private">Private · only people with the code</option><option value="public">Public · eligible for storefront promotion</option></select><small>Private codes are not promoted, but anyone who receives a shareable code can pass it along. Audience rules still decide who may redeem it.</small></label>
      <DateInput name="startsAt" label="Starts (your local time)" iso={d?.startsAt ?? null}/>
      <DateInput name="endsAt" label="Ends (your local time)" iso={d?.endsAt ?? null}/>
    </div></fieldset>
    <fieldset><legend>Discount</legend><div className="coupon-form-grid">
      <label><span>Discount type</span><select name="discountType" value={discountType} onChange={(e) => setDiscountType(e.target.value as "fixed" | "percent")}><option value="fixed">Fixed amount</option><option value="percent">Percentage</option></select></label>
      {discountType === "fixed" ? <label><span>Amount (CAD)</span><input name="fixedAmount" inputMode="decimal" defaultValue={d?.discount.type === "fixed" ? dollars(d.discount.fixedCents) : ""} placeholder="9.50" required/></label> : <><label><span>Percentage</span><input name="percentage" inputMode="decimal" defaultValue={d?.discount.type === "percent" ? d.discount.basisPoints / 100 : ""} placeholder="30" required/></label><label><span>Maximum discount (CAD, optional)</span><input name="maxAmount" inputMode="decimal" defaultValue={d?.discount.type === "percent" ? dollars(d.discount.maxCents) : ""}/></label></>}
    </div><p className="coupon-hint">Current checkout requires at least 1¢ payable after the coupon and Gold Leaves. A fully free order cannot be settled yet.</p></fieldset>
    <fieldset><legend>Eligible products</legend><div className="coupon-picker-grid">
      <Picker label="Include products" name="includeProductIds" options={products} selected={d?.scope.includeProductIds ?? []}/><Picker label="Exclude products" name="excludeProductIds" options={products} selected={d?.scope.excludeProductIds ?? []}/>
      <Picker label="Include categories" name="includeCategoryKeys" options={categories} selected={d?.scope.includeCategoryKeys ?? []}/><Picker label="Exclude categories" name="excludeCategoryKeys" options={categories} selected={d?.scope.excludeCategoryKeys ?? []}/>
    </div><p className="coupon-picker-note">Search results show up to 100 products and customers. Existing selections always remain available.</p><div className="coupon-checks"><label><input type="checkbox" name="excludeSale" defaultChecked={d?.scope.excludeSale}/> Exclude sale items</label><label><input type="checkbox" name="excludeAdvent" defaultChecked={d?.scope.excludeAdvent}/> Exclude Advent products</label></div></fieldset>
    <fieldset><legend>Minimum order</legend><div className="coupon-form-grid"><label><span>Eligible item quantity</span><input name="minimumQuantity" type="number" min="0" step="1" defaultValue={d?.minimum.eligibleQuantity ?? 0}/></label><label><span>Eligible spend (CAD)</span><input name="minimumSpend" inputMode="decimal" defaultValue={dollars(d?.minimum.eligibleSpendCents ?? 0)}/></label></div></fieldset>
    <fieldset><legend>Customers and limits</legend><div className="coupon-form-grid"><label><span>Audience</span><select name="audience" value={audience} onChange={(e) => setAudience(e.target.value as "all" | "new_customer" | "no_existing_account" | "selected")}><option value="all">Everyone</option><option value="new_customer">Customers without a paid order</option><option value="no_existing_account">People without an existing account</option><option value="selected">Selected customers</option></select></label>{audience === "selected" && <Picker label="Selected customers" name="selectedCustomerKeys" options={catalog.customers.map((c) => ({ value: c.key, label: c.label }))} selected={d?.audience.selectedCustomerKeys ?? []}/>}<label><span>Global redemptions (optional)</span><input name="globalLimit" type="number" min="1" step="1" defaultValue={d?.usage.globalLimit ?? ""}/></label><label><span>Per customer (optional)</span><input name="perCustomerLimit" type="number" min="1" step="1" defaultValue={d?.usage.perCustomerLimit ?? ""}/></label></div><label className="coupon-inline-check"><input type="checkbox" name="allowGoldLeaves" defaultChecked={d?.allowGoldLeaves}/> Allow customers to use Gold Leaves on the same order</label></fieldset>
    {state.message && <p className={state.ok ? "coupon-result is-success" : "coupon-result is-error"} role={state.ok ? "status" : "alert"}>{state.message}{state.ok && state.couponId && !coupon ? <> <a href={`/admin/coupons?coupon=${state.couponId}`}>Open coupon</a></> : null}</p>}
    <button className="btn btn-gold" type="submit" disabled={pending || coupon?.status === "archived"}>{pending ? "Saving…" : coupon ? "Save coupon" : "Create coupon"}</button>
  </form>;
}
