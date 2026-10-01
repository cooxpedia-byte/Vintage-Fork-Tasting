import type { SupabaseClient } from "@supabase/supabase-js";
import { nativeOrderContact, type OrderContact } from "./order-contact";
import { orderFilter, parseOrderOperations, loadOrderOperations, type OrderOperation } from "./order-operations";

export type AdminOrder = { id: string; orderNumber: string; customerEmail: string; status: string; paymentStatus: string | null; totalCents: number; currency: string; placedAt: string; source: string; contact:OrderContact;operation?:OrderOperation };
export type InventoryAlert = { id: string; productName: string; variantLabel: string; sku: string; quantity: number; threshold: number };
export type CommerceOverview = {
  connected: boolean; ordersConnected: boolean; inventoryConnected: boolean;
  customersConnected: boolean; subscriptionsConnected: boolean; productsConnected: boolean;
  netSalesCents: number; currency: string; orderCount: number; fulfilmentCount: number | null;
  customerCount: number; subscriptionCount: number; productCount: number; draftProductCount: number;
  recentOrders: AdminOrder[]; inventoryAlerts: InventoryAlert[];
};
type OrderRow = { id: string; order_number: number | string; customer_email: string | null; status: string; payment_status: string | null; total_cents: number; refunded_cents: number; currency: string; placed_at: string | null; created_at: string; source: string;billing_address:unknown;shipping_address:unknown;shipping_method_snapshot:unknown };
const ORDER_COLUMNS = "id,order_number::text,customer_email,status,payment_status,total_cents,refunded_cents,currency,placed_at,created_at,source,billing_address,shipping_address,shipping_method_snapshot";
export const ORDER_PAGE_SIZE = 50;
const countedStatuses = new Set(["paid", "processing", "fulfilled", "partially_refunded", "refunded"]);
const order = (row: OrderRow): AdminOrder => ({ id: row.id, orderNumber: String(row.order_number), customerEmail: row.customer_email || "Guest customer", status: row.status, paymentStatus: row.payment_status, totalCents: Number(row.total_cents), currency: row.currency, placedAt: row.placed_at || row.created_at, source: row.source,contact:nativeOrderContact(row.billing_address,row.shipping_address,row.shipping_method_snapshot) });

export function orderCursor(value?: string) {
  if (value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^[1-9][0-9]{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) throw new Error("Invalid order reference.");
  return value;
}

export type OrderPage = { connected: boolean; orders: AdminOrder[]; nextCursor: string | null; total: number | null; error: string | null };
export async function loadOrderPage(client: SupabaseClient, options: { after?: string; fulfilment?: boolean; number?: string;filter?:string } = {}): Promise<OrderPage> {
  const after = orderCursor(options.after), number = orderCursor(options.number);
  try {
    const result=await client.rpc("vf_admin_native_orders_page_v1",{p_after:after,p_order_number:number,p_filter:options.fulfilment?"to_fulfil":orderFilter(options.filter),p_limit:ORDER_PAGE_SIZE}).abortSignal(AbortSignal.timeout(15000));
    const data=result.data;
    if(result.error||!data||!Array.isArray(data.rows)||data.rows.length>ORDER_PAGE_SIZE||!Number.isSafeInteger(data.total)||data.total<data.rows.length)throw Error("Invalid order page.");
    const rows=data.rows as (OrderRow&{operation:unknown})[];
    const refs=rows.map(r=>({kind:"native" as const,orderId:r.id}));
    const operations=parseOrderOperations({orders:rows.map(r=>r.operation),operational:true},refs);
    let prior=after;
    for(const row of rows){
      const n=orderCursor(String(row.order_number));
      if(!n||(prior&&BigInt(n)>=BigInt(prior))||(number&&n!==number)||!Number.isSafeInteger(row.total_cents)||row.total_cents<0)throw Error("Invalid order row.");
      prior=n;
    }
    const next=orderCursor(data.nextCursor??undefined);
    if(next&&(!rows.length||next!==prior))throw Error("Invalid next page.");
    return {connected:true,orders:rows.map(r=>({...order(r),operation:operations.get("native:"+r.id)})),nextCursor:next,total:data.total,error:null};
  } catch {
    return { connected: false, orders: [], nextCursor: null, total: null, error: "The order connection is temporarily unavailable. Please refresh." };
  }
}

export async function loadCommerceOverview(client: SupabaseClient): Promise<CommerceOverview> {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [orders, fulfilment, customers, subscriptions, products, variants] = await Promise.all([
    client.from("commerce_orders").select(ORDER_COLUMNS).gte("created_at", since).order("order_number", { ascending: false }).limit(1000),
    client.rpc("vf_admin_native_orders_page_v1",{p_after:null,p_order_number:null,p_filter:"to_fulfil",p_limit:1}).abortSignal(AbortSignal.timeout(15000)),
    client.from("commerce_customers").select("id", {count:"exact",head:true}),
    client.from("commerce_subscriptions").select("id", {count:"exact",head:true}).in("status",["active","trialing","past_due"]),
    client.from("commerce_products").select("id,name,status"),
    client.from("commerce_product_variants").select("id,product_id,sku,label,inventory_quantity,low_stock_threshold").eq("track_inventory",true).in("status",["active","draft"]),
  ]);
  const rows = (orders.data || []) as OrderRow[];
  const recentRows = rows.slice(0,8);
  const operations = await loadOrderOperations(client,recentRows.map(r=>({kind:"native",orderId:r.id})));
  const productRows = (products.data || []) as {id:string;name:string;status:string}[];
  const names = new Map(productRows.map(p=>[p.id,p.name]));
  const inventoryAlerts = ((variants.data || []) as {id:string;product_id:string;sku:string;label:string;inventory_quantity:number|null;low_stock_threshold:number|null}[])
    .filter(v=>v.inventory_quantity!==null && v.inventory_quantity <= (v.low_stock_threshold ?? 5))
    .map(v=>({id:v.id,productName:names.get(v.product_id)||"Product",variantLabel:v.label,sku:v.sku,quantity:v.inventory_quantity!,threshold:v.low_stock_threshold??5}))
    .sort((a,b)=>a.quantity-b.quantity).slice(0,8);
  return {
    connected:!orders.error, ordersConnected:!orders.error&&!operations.error, inventoryConnected:!variants.error&&!products.error,
    customersConnected:!customers.error,subscriptionsConnected:!subscriptions.error,productsConnected:!products.error,
    netSalesCents:rows.reduce((n,r)=>n+(countedStatuses.has(r.status)?Math.max(0,Number(r.total_cents)-Number(r.refunded_cents)):0),0),
    currency:rows[0]?.currency || "cad",orderCount:rows.filter(r=>countedStatuses.has(r.status)).length,
    fulfilmentCount:fulfilment.error||!Number.isSafeInteger(fulfilment.data?.total)||fulfilment.data.total<0?null:fulfilment.data.total,customerCount:customers.count??0,subscriptionCount:subscriptions.count??0,
    productCount:productRows.filter(p=>p.status==="active").length,draftProductCount:productRows.filter(p=>p.status==="draft").length,
    recentOrders:recentRows.map(r=>({...order(r),operation:operations.orders.get("native:"+r.id)})),inventoryAlerts,
  };
}
