import { describe,expect,it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
type Query = { select(columns:string,options?:unknown):Query; eq(column:string,value:string):Query; maybeSingle():Promise<unknown>; order(...args:unknown[]):Query; then(resolve:(value:unknown)=>unknown,reject:(reason:unknown)=>unknown):Promise<unknown> };
import { loadNativeOrderDetail,NATIVE_ORDER_DETAIL_COLUMNS,NATIVE_ORDER_ITEM_COLUMNS } from "../src/lib/admin/native-order-detail";

const ID="10000000-0000-4000-8000-000000000001";
const row={id:ID,order_number:"9223372036854775807",customer_email:"buyer@example.test",
  status:"paid",payment_status:"paid",payment_provider:"paypal",currency:"cad",
  subtotal_cents:1001,discount_cents:2,shipping_cents:303,tax_cents:44,total_cents:1346,
  refunded_cents:0,placed_at:null,created_at:"2026-09-11T12:00:00Z",source:"web",
  stripe_subscription_id:null,stripe_invoice_id:null,
  billing_address:{name:"Buyer",line1:"1 Main St"},shipping_address:{name:"Receiver",line1:"2 Side St"},
  shipping_method_snapshot:"Local pickup"};
const item={id:"20000000-0000-4000-8000-000000000001",name_snapshot:"Tea tin",
  sku_snapshot:"TIN-1",variant_snapshot:"Large",quantity:3,unit_amount_cents:333,
  subtotal_cents:999,discount_cents:2,tax_cents:44,total_cents:1041,
  fulfillment_status:"unfulfilled",created_at:"2026-09-11T12:00:01Z"};

function client(orderResult:unknown,itemResult:unknown) {
  const calls:{table:string;select?:string;selectOptions?:unknown;eq?:unknown[];orders?:unknown[][]}[]=[];
  const fake={from(table:string){const call: {table:string;select?:string;selectOptions?:unknown;eq?:unknown[];orders:unknown[][]}={table,orders:[]};calls.push(call);
    const result=table==="commerce_orders"?orderResult:itemResult;
    const builder:Query={select(columns:string,options?:unknown){call.select=columns;call.selectOptions=options;return builder;},
      eq(column:string,value:string){call.eq=[column,value];return builder;},
      maybeSingle(){return Promise.resolve(result);},
      order(...args:unknown[]){call.orders!.push(args);return builder;},
      then(resolve:(value:unknown)=>unknown,reject:(reason:unknown)=>unknown){return Promise.resolve(result).then(resolve,reject);}};
    return builder;}};
  return {fake:fake as unknown as SupabaseClient,calls};
}

describe("loadNativeOrderDetail",()=>{
  it("rejects a malformed UUID before querying",async()=>{
    const c=client({data:row,error:null},{data:[item],count:1,error:null});
    await expect(loadNativeOrderDetail(c.fake,"123")).rejects.toThrow("Invalid order reference.");
    expect(c.calls).toEqual([]);
  });

  it("loads only the saved order and item tables with the exact UUID",async()=>{
    const c=client({data:row,error:null},{data:[item],count:1,error:null});
    const result=await loadNativeOrderDetail(c.fake,ID.toUpperCase());
    expect(c.calls).toEqual([
      {table:"commerce_orders",select:NATIVE_ORDER_DETAIL_COLUMNS,selectOptions:undefined,eq:["id",ID],orders:[]},
      {table:"commerce_order_items",select:NATIVE_ORDER_ITEM_COLUMNS,selectOptions:{count:"exact"},eq:["order_id",ID],orders:[
        ["created_at",{ascending:true}],["id",{ascending:true}]]},
    ]);
    expect(result).toMatchObject({state:"ready",order:{id:ID,orderNumber:"9223372036854775807",
      subtotalCents:1001,shippingCents:303,taxCents:44,totalCents:1346,placedAt:row.created_at,
      shippingMethod:"Local pickup",contact:{pickup:true},items:[{name:"Tea tin",quantity:3,
        unitAmountCents:333,subtotalCents:999,discountCents:2,taxCents:44,totalCents:1041}]}});
    expect(c.calls.map(x=>x.table)).not.toContain("commerce_order_payments");
  });

  it("distinguishes no visible order from a query failure",async()=>{
    const absent=client({data:null,error:null},{data:[item],count:1,error:null});
    await expect(loadNativeOrderDetail(absent.fake,ID)).resolves.toEqual({state:"not_found"});
    expect(absent.calls).toHaveLength(1);
    const denied=client({data:null,error:{code:"42501"}},{data:[item],count:1,error:null});
    await expect(loadNativeOrderDetail(denied.fake,ID)).resolves.toMatchObject({state:"error"});
  });

  it("does not return a partial order when item access fails",async()=>{
    const c=client({data:row,error:null},{data:null,error:{code:"42501"}});
    await expect(loadNativeOrderDetail(c.fake,ID)).resolves.toMatchObject({state:"error"});
  });

  it("rejects a mismatched returned order identity",async()=>{
    const c=client({data:{...row,id:"10000000-0000-4000-8000-000000000002"},error:null},
      {data:[item],count:1,error:null});
    await expect(loadNativeOrderDetail(c.fake,ID)).resolves.toMatchObject({state:"error"});
  });

  it("accepts complete subscription renewals and rejects legacy-source rows",async()=>{
    const renewal={...row,source:"subscription_renewal",stripe_subscription_id:"sub_1",stripe_invoice_id:"in_1"};
    await expect(loadNativeOrderDetail(client({data:renewal,error:null},{data:[item],count:1,error:null}).fake,ID))
      .resolves.toMatchObject({state:"ready",order:{source:"subscription_renewal",stripeInvoiceId:"in_1"}});
    await expect(loadNativeOrderDetail(client({data:{...row,source:"legacy"},error:null},{data:[item],count:1,error:null}).fake,ID))
      .resolves.toEqual({state:"not_found"});
    await expect(loadNativeOrderDetail(client({data:{...renewal,stripe_invoice_id:null},error:null},{data:[item],count:1,error:null}).fake,ID))
      .resolves.toMatchObject({state:"error"});
  });

  it.each(["paid","fulfilled","partially_refunded","refunded"])
  ("loads a saved Matcha invoice order with %s status",async(status)=>{
    const matcha={...row,source:"matcha_subscription",payment_provider:"stripe",status,
      stripe_subscription_id:"sub_matcha",stripe_invoice_id:"in_matcha",subtotal_cents:2400,
      discount_cents:0,shipping_cents:500,tax_cents:0,total_cents:2900,
      refunded_cents:status==="refunded"?2900:status==="partially_refunded"?100:0};
    const line={...item,name_snapshot:"Matcha Subscribe & Save",sku_snapshot:"MATCHA-SUB-50G",
      variant_snapshot:"50 g monthly",quantity:1,unit_amount_cents:2400,subtotal_cents:2400,
      discount_cents:0,tax_cents:0,total_cents:2400,
      fulfillment_status:status==="fulfilled"?"fulfilled":"unfulfilled"};
    const c=client({data:matcha,error:null},{data:[line],count:1,error:null});
    await expect(loadNativeOrderDetail(c.fake,ID)).resolves.toMatchObject({state:"ready",order:{
      source:"matcha_subscription",status,paymentProvider:"stripe",stripeSubscriptionId:"sub_matcha",
      stripeInvoiceId:"in_matcha",totalCents:2900,refundedCents:matcha.refunded_cents,
      items:[{name:"Matcha Subscribe & Save",sku:"MATCHA-SUB-50G",variant:"50 g monthly",quantity:1}],
    }});
    expect(c.calls.map(call=>call.table)).toEqual(["commerce_orders","commerce_order_items"]);
  });

  it.each(["subscription_renewal","matcha_subscription"])
  ("rejects incomplete %s invoice linkage before loading items",async(source)=>{
    for(const field of ["stripe_subscription_id","stripe_invoice_id"]){
      for(const value of [null,""," ",123]){
        const c=client({data:{...row,source,stripe_subscription_id:"sub_1",stripe_invoice_id:"in_1",
          [field]:value},error:null},{data:[item],count:1,error:null});
        await expect(loadNativeOrderDetail(c.fake,ID)).resolves.toMatchObject({state:"error"});
        expect(c.calls).toHaveLength(1);
      }
    }
  });

  it("detects server-capped and duplicate item responses",async()=>{
    await expect(loadNativeOrderDetail(client({data:row,error:null},{data:[item],count:2,error:null}).fake,ID))
      .resolves.toMatchObject({state:"error"});
    await expect(loadNativeOrderDetail(client({data:row,error:null},{data:[item,item],count:2,error:null}).fake,ID))
      .resolves.toMatchObject({state:"error"});
  });

  it("preserves exact integer cents and quantities from numeric strings",async()=>{
    const c=client({data:{...row,total_cents:"1346"},error:null},
      {data:[{...item,quantity:"3",unit_amount_cents:"333"}],count:1,error:null});
    const result=await loadNativeOrderDetail(c.fake,ID);
    expect(result.state).toBe("ready");
    if(result.state==="ready") {
      expect(result.order.totalCents).toBe(1346);
      expect(result.order.items[0].quantity).toBe(3);
      expect(result.order.items[0].unitAmountCents).toBe(333);
    }
  });

  it.each([
    [{...row,total_cents:12.5}],
    [{...row,total_cents:-1}],
    [{...row,order_number:null}],
    [{...row,currency:"CAD"}],
    [{...row,created_at:"not-a-date"}],
    [{...row,placed_at:"2026-99-99T00:00:00Z"}],
  ])("fails closed on malformed core order data",async(bad)=>{
    const c=client({data:bad,error:null},{data:[item],count:1,error:null});
    await expect(loadNativeOrderDetail(c.fake,ID)).resolves.toMatchObject({state:"error"});
  });

  it.each([{...item,quantity:0},{...item,quantity:1001},{...item,total_cents:"12.5"}])
  ("fails closed on malformed line amounts or quantities",async(bad)=>{
    const c=client({data:row,error:null},{data:[bad],count:1,error:null});
    await expect(loadNativeOrderDetail(c.fake,ID)).resolves.toMatchObject({state:"error"});
  });

  it("classifies thrown connection failures separately",async()=>{
    const fake={from(){throw new Error("offline");}} as unknown as SupabaseClient;
    await expect(loadNativeOrderDetail(fake,ID)).resolves.toEqual({state:"error",
      message:"The order connection is temporarily unavailable. Please refresh."});
  });
});
