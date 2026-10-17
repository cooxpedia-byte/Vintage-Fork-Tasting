import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSavedPosOrderContacts, withSavedPosOrderContact } from "@/lib/admin/pos-order-contacts";
import { nativeOrderContact } from "@/lib/admin/order-contact";
import { loadOrderPage, loadCommerceOverview } from "@/lib/admin/commerce";
import { loadNativeOrderDetail } from "@/lib/admin/native-order-detail";

const id="10000000-0000-4000-8000-000000000001";
const other="20000000-0000-4000-8000-000000000002";
const saved={orderId:id,email:"saved@example.test",name:"Saved POS customer"};
const order={id,order_number:"10208",customer_email:null as string|null,status:"fulfilled",payment_status:"paid",payment_provider:"cash",
  currency:"cad",subtotal_cents:1000,discount_cents:0,shipping_cents:0,tax_cents:0,total_cents:1000,refunded_cents:0,
  placed_at:"2026-10-17T12:00:00Z",created_at:"2026-10-17T12:00:00Z",source:"pos",
  stripe_subscription_id:null,stripe_invoice_id:null,billing_address:{},shipping_address:{},shipping_method_snapshot:"In Store Purchase"};
const operation={kind:"native",orderId:id,status:"completed",sourceStatus:"fulfilled",sourceVersion:"a".repeat(64),
  revision:0,allowedTargets:[],staleOverlay:false,reviewReason:null,fulfillmentReferenceRequired:false};

function client(contactResult:unknown={contacts:[saved]}, error:unknown=null, row=order) {
  const rpc=vi.fn((name:string) => ({abortSignal:async()=> name==="vf_admin_pos_order_contacts_v1"
    ? {data:contactResult,error} : name==="vf_admin_native_orders_page_v1"
      ? {data:{rows:[{...row,operation}],total:1,nextCursor:null},error:null}
      : {data:{orders:[operation],operational:true},error:null}}));
  const reads:{table:string;columns:string}[]=[];
  const from=vi.fn((table:string) => {
    let columns="";
    const response=() => ({data:table==="commerce_orders" ? (columns.includes("migration_snapshot")?[]:[row]) : [],count:0,error:null});
    const query={select(value:string){columns=value;reads.push({table,columns});return query;},
      eq(){return query;},in(){return query;},gte(){return query;},gt(){return query;},lt(){return query;},is(){return query;},
      order(){return query;},limit(){return query;},abortSignal:async()=>response(),
      maybeSingle:async()=>({data:row,error:null}),then(resolve:(value:unknown)=>unknown){return Promise.resolve(response()).then(resolve);}};
    return query;
  });
  return {fake:{rpc,from} as unknown as SupabaseClient,rpc,reads};
}

describe("saved POS contact projection",()=>{
  it("requests only POS order identifiers through the admin-only bounded reader",async()=>{
    const c=client();
    const result=await loadSavedPosOrderContacts(c.fake,[{id,source:"pos"},{id:other,source:"web"}]);
    expect(result.error).toBeNull(); expect(result.contacts.get(id)).toEqual({email:saved.email,name:saved.name});
    expect(c.rpc).toHaveBeenCalledExactlyOnceWith("vf_admin_pos_order_contacts_v1",{p_order_ids:[id]});
    expect(c.reads).toEqual([]);
  });
  it("does not query other order sources or guess missing guest identity",async()=>{
    const c=client({contacts:[]});
    expect(await loadSavedPosOrderContacts(c.fake,[{id,source:"web"}])).toEqual({contacts:new Map(),error:null});
    expect(c.rpc).not.toHaveBeenCalled();
    const result=await loadSavedPosOrderContacts(c.fake,[{id,source:"pos"}]);
    expect(result).toEqual({contacts:new Map(),error:null});
  });
  it.each([null,{}, {contacts:[{...saved,orderId:other}]},{contacts:[saved,saved]},
    {contacts:[{...saved,email:"invalid"}]},{contacts:[{...saved,name:"bad\u0000name"}]},
    {contacts:[{...saved,birthMonth:2,birthDay:29}]},{contacts:[{...saved,contact_snapshot:{private:true}}]}])
  ("rejects malformed, mismatched or private response fields: %j",async response=>{
    const c=client(response); const result=await loadSavedPosOrderContacts(c.fake,[{id,source:"pos"}]);
    expect(result.error).toBeTruthy(); expect(result.contacts.size).toBe(0);
    expect(JSON.stringify(result)).not.toContain("birthMonth");
  });
  it("fails closed on denied access or invalid references without querying profiles",async()=>{
    const c=client(null,{code:"42501"});
    expect((await loadSavedPosOrderContacts(c.fake,[{id,source:"pos"}])).error).toBeTruthy();
    c.rpc.mockClear();
    expect((await loadSavedPosOrderContacts(c.fake,[{id:"bad",source:"pos"}])).error).toBeTruthy();
    expect(c.rpc).not.toHaveBeenCalled(); expect(c.reads).toEqual([]);
  });
  it("fills only missing order contact facts and preserves saved or ambiguous order values",()=>{
    const existing=nativeOrderContact({name:"Order name",email:"order@example.test",phone:"555"},{line1:"Saved shipping"},"Local pickup");
    expect(withSavedPosOrderContact(existing,saved)).toEqual(existing);
    const empty=nativeOrderContact({},null,"Local pickup");
    const filled=withSavedPosOrderContact(empty,saved);
    expect(filled).toMatchObject({billing:{name:saved.name,email:saved.email,line1:null,phone:null},shipping:null,pickup:true});
    expect(withSavedPosOrderContact({...empty,billingAmbiguous:true},saved)).toEqual({...empty,billingAmbiguous:true});
  });
});

describe("POS contact in authenticated admin order surfaces",()=>{
  it("shows frozen linked contact on order lists and preserves its operational controls",async()=>{
    const c=client(); const page=await loadOrderPage(c.fake);
    expect(page.connected).toBe(true);
    expect(page.orders[0]).toMatchObject({customerEmail:saved.email,contact:{billing:{name:saved.name,email:saved.email}},operation:{status:"completed"}});
  });
  it("shows the same frozen contact in overview without reading current profile or raw attempt fields",async()=>{
    const c=client(); const range={start:"2026-10-17T00:00:00Z",end:"2026-10-18T00:00:00Z"};
    const overview=await loadCommerceOverview(c.fake,{salesPeriod:"day",salesRange:range,todayRange:range});
    expect(overview.ordersConnected).toBe(true);
    expect(overview.recentOrders[0]).toMatchObject({customerEmail:saved.email,contact:{billing:{name:saved.name,email:saved.email}}});
    expect(c.reads.some(read=>read.table==="profiles"||read.table==="commerce_checkout_attempts")).toBe(false);
    expect(c.reads.some(read=>/contact_snapshot|birth_month|birth_day/.test(read.columns))).toBe(false);
  });
  it("fills native detail only from the verified frozen projection, leaving guests unnamed",async()=>{
    const linked=client();
    expect(await loadNativeOrderDetail(linked.fake,id)).toMatchObject({state:"ready",order:{customerEmail:saved.email,
      contact:{billing:{name:saved.name,email:saved.email}},items:[]}});
    const guest=client({contacts:[]});
    expect(await loadNativeOrderDetail(guest.fake,id)).toMatchObject({state:"ready",order:{customerEmail:null,contact:{billing:null}}});
    expect((await loadOrderPage(guest.fake)).orders[0].customerEmail).toBe("Guest customer");
  });
  it("keeps existing order contact and email over the fallback and allows a saved null name",async()=>{
    const c=client({contacts:[{...saved,name:null}]});
    expect((await loadOrderPage(c.fake)).orders[0]).toMatchObject({customerEmail:saved.email,contact:{billing:{name:null}}});
    const original={...order,customer_email:"order@example.test",billing_address:{name:"Frozen order name",email:"order@example.test"}};
    const preserved=client(undefined,null,original);
    expect(await loadNativeOrderDetail(preserved.fake,id)).toMatchObject({state:"ready",order:{customerEmail:"order@example.test",contact:{billing:{name:"Frozen order name",email:"order@example.test"}}}});
  });
  it("does not label an unavailable identity read as a guest on any surface",async()=>{
    const c=client(null,{code:"42501"}); const range={start:"2026-10-17T00:00:00Z",end:"2026-10-18T00:00:00Z"};
    expect(await loadOrderPage(c.fake)).toMatchObject({connected:false,orders:[]});
    expect(await loadNativeOrderDetail(c.fake,id)).toMatchObject({state:"error"});
    expect((await loadCommerceOverview(c.fake,{salesPeriod:"day",salesRange:range,todayRange:range})).ordersConnected).toBe(false);
  });
});
