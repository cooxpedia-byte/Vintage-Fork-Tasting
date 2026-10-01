import { readFileSync } from "node:fs";
import postcss from "postcss";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/app/admin/coupons/actions",()=>({saveCoupon:vi.fn()}));
import { CouponBuilder } from "@/components/admin/CouponBuilder";
import type { CouponCatalog, CouponDetail } from "@/lib/admin/coupons";

const catalog:CouponCatalog={products:[{id:"10000000-0000-4000-8000-000000000001",name:"Earl Grey Cream"}],categories:[{key:"loose_leaf",name:"Loose-leaf tea"}],customers:[{key:"email:tea@example.test",label:"tea@example.test"}]};
const coupon:CouponDetail={couponId:"20000000-0000-4000-8000-000000000001",revisionId:"30000000-0000-4000-8000-000000000001",code:"TEA25",name:"Tea 25",status:"active",visibility:"private",version:4,updatedAt:"2026-09-14T12:00:00Z",createdAt:"2026-09-13T12:00:00Z",redemptions:2,needsReview:1,definition:{code:"TEA25",name:"Tea 25",status:"active",visibility:"private",discount:{type:"percent",basisPoints:2500,maxCents:3000,currency:"cad"},scope:{includeProductIds:[catalog.products[0].id],excludeProductIds:[],includeCategoryKeys:["loose_leaf"],excludeCategoryKeys:[],excludeSale:true,excludeAdvent:true},minimum:{eligibleQuantity:1,eligibleSpendCents:0},audience:{type:"selected",selectedCustomerKeys:[catalog.customers[0].key]},usage:{globalLimit:100,perCustomerLimit:1},startsAt:"2026-09-20T15:00:00Z",endsAt:null,allowGoldLeaves:true}};
describe("coupon admin markup",()=>{
  it("renders the guided editor without JSON entry and preserves the current version",()=>{const html=renderToStaticMarkup(createElement(CouponBuilder,{catalog,coupon}));for(const text of ["Eligible products","Loose-leaf tea","Selected customers","Maximum discount","fully free order cannot be settled","Private · only people with the code","shareable code can pass it along"])expect(html).toContain(text);expect(html).toContain('name="expectedVersion" value="4"');expect(html).toContain('name="startsAtTimezoneOffset"');expect(html).toContain('name="endsAtTimezoneOffset"');expect(html).not.toContain("<textarea");expect(html).not.toContain("JSON");const createHtml=renderToStaticMarkup(createElement(CouponBuilder,{catalog}));expect(createHtml).toContain("Customers enter this in their cart");expect(createHtml).toContain('value="private" selected=""');
  });
  it("keeps the mobile editor and result table within the scoped staff shell", () => {
    const css = postcss.parse(readFileSync(new URL("../src/app/admin/admin.css", import.meta.url), "utf8"));
    const mobileGrids: string[] = [];
    let scrollableTable = false;
    css.walkRules(rule => {
      expect(rule.selectors.every(selector => selector.startsWith(".unified-admin"))).toBe(true);
      rule.walkDecls(declaration => {
        if (declaration.prop === "overflow-x" && declaration.value === "auto" && rule.selectors.includes(".unified-admin .coupon-table-wrap")) scrollableTable = true;
        if (declaration.prop === "grid-template-columns" && declaration.value === "1fr" && rule.parent?.type === "atrule" && /max-width:\s*760px/.test(rule.parent.params)) mobileGrids.push(...rule.selectors);
      });
    });
    expect(scrollableTable).toBe(true);
    expect(mobileGrids).toEqual(expect.arrayContaining([".unified-admin .coupon-form-grid", ".unified-admin .coupon-picker-grid", ".unified-admin .coupon-action-grid"]));
  });
});
