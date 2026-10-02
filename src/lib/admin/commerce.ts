import type { SupabaseClient } from "@supabase/supabase-js";
import { historicalOrderPage } from "./historical-orders";
import { nativeOrderContact, type OrderContact } from "./order-contact";
import { orderFilter, parseOrderOperations, loadOrderOperations, type OrderOperation } from "./order-operations";

export type AdminOrder = { id: string; orderNumber: string; customerEmail: string; status: string; paymentStatus: string | null; totalCents: number; currency: string; placedAt: string; source: string; contact:OrderContact;operation?:OrderOperation };
export type InventoryAlert = { id: string; productName: string; variantLabel: string; sku: string; quantity: number; threshold: number };
export type CommerceOverview = {
  connected: boolean; ordersConnected: boolean; inventoryConnected: boolean;
  customersConnected: boolean; subscriptionsConnected: boolean; productsConnected: boolean;
  netSalesCents: number; currency: string; orderCount: number; fulfilmentCount: number | null;
  salesConnected: boolean; salesSource: "native" | "native-and-imported-estimate"; salesMessage: string | null;
  customerCount: number; subscriptionCount: number; productCount: number; draftProductCount: number;
  recentOrders: AdminOrder[]; inventoryAlerts: InventoryAlert[];
};
type OrderRow = { id: string; order_number: number | string; customer_email: string | null; status: string; payment_status: string | null; total_cents: number; refunded_cents: number; currency: string; placed_at: string | null; created_at: string; source: string;billing_address:unknown;shipping_address:unknown;shipping_method_snapshot:unknown };
const ORDER_COLUMNS = "id,order_number::text,customer_email,status,payment_status,total_cents,refunded_cents,currency,placed_at,created_at,source,billing_address,shipping_address,shipping_method_snapshot";
export const ORDER_PAGE_SIZE = 50;
const countedStatuses = new Set(["paid", "processing", "fulfilled", "partially_refunded", "refunded"]);
const SALES_PAGE_SIZE = 500;
type SalesRow = { id: string; status: string; total_cents: number; refunded_cents: number; currency: string };
type SalesWindow = { start: string; end: string };
type SalesResult = { connected: boolean; totalCents: number; orderCount: number; currency: string; message: string | null };
const HISTORY_PAGE_SIZE = 50;
const order = (row: OrderRow): AdminOrder => ({ id: row.id, orderNumber: String(row.order_number), customerEmail: row.customer_email || "Guest customer", status: row.status, paymentStatus: row.payment_status, totalCents: Number(row.total_cents), currency: row.currency, placedAt: row.placed_at || row.created_at, source: row.source,contact:nativeOrderContact(row.billing_address,row.shipping_address,row.shipping_method_snapshot) });

/**
 * Read every settled order in the selected calendar window. PostgREST caps a
 * single response, so an id cursor avoids silently dropping sales after row 1000.
 */
export async function loadNativeSales(client: SupabaseClient, window: SalesWindow): Promise<SalesResult> {
  let totalCents = 0, orderCount = 0;
  try {
    for (const clock of ["placed_at", "created_at"] as const) {
      let cursor: string | null = null;
      for (;;) {
        let query = client.from("commerce_orders")
          .select("id,status,total_cents,refunded_cents,currency")
          .in("status", [...countedStatuses])
          .gte(clock, window.start).lt(clock, window.end)
          .order("id", { ascending: true }).limit(SALES_PAGE_SIZE);
        if (clock === "created_at") query = query.is("placed_at", null);
        if (cursor) query = query.gt("id", cursor);
        const result = await query.abortSignal(AbortSignal.timeout(15000));
        if (result.error || !Array.isArray(result.data)) throw Error("Sales query failed.");
        const rows = result.data as SalesRow[];
        for (const row of rows) {
          const charged = Number(row.total_cents), refunded = Number(row.refunded_cents);
          if (!row.id || !countedStatuses.has(row.status) || row.currency.toLowerCase() !== "cad"
            || !Number.isSafeInteger(charged) || charged < 0
            || !Number.isSafeInteger(refunded) || refunded < 0 || refunded > charged) {
            throw Error("Sales data is not comparable in CAD.");
          }
          totalCents += charged - refunded;
          orderCount += 1;
        }
        if (!Number.isSafeInteger(totalCents) || !Number.isSafeInteger(orderCount)) throw Error("Sales total is too large.");
        if (rows.length < SALES_PAGE_SIZE) break;
        const next = rows.at(-1)?.id;
        if (!next || next === cursor) throw Error("Sales cursor did not advance.");
        cursor = next;
      }
    }
    return { connected: true, totalCents, orderCount, currency: "cad", message: null };
  } catch {
    return { connected: false, totalCents: 0, orderCount: 0, currency: "cad",
      message: "Sales for this period could not be loaded. Please refresh." };
  }
}

function historicalTimestamp(value: string | null): number {
  if (!value || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z)?$/.test(value)) throw Error("Invalid historical date.");
  const normalized = value.replace(" ", "T") + (value.endsWith("Z") ? "" : "Z");
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) throw Error("Invalid historical date.");
  return timestamp;
}

function historicalCents(value: string | null): number {
  const parts = value?.match(/^([0-9]+)(?:\.([0-9]+))?$/);
  if (!parts) throw Error("Invalid historical amount.");
  const fraction = (parts[2] || "").padEnd(2, "0");
  if (fraction.slice(2).replaceAll("0", "") !== "") throw Error("Historical amount has fractional cents.");
  const cents = BigInt(parts[1]) * 100n + BigInt(fraction.slice(0, 2));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw Error("Historical amount is too large.");
  return Number(cents);
}

/** Saved Woo history is an unverified recorded-order estimate, not settled net sales. */
export async function loadHistoricalSalesEstimate(client: SupabaseClient, window: SalesWindow): Promise<SalesResult> {
  let totalCents = 0, orderCount = 0, cursor = 0;
  const start = Date.parse(window.start), end = Date.parse(window.end);
  try {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw Error("Invalid sales window.");
    for (;;) {
      const response = await client.rpc("vf_admin_imported_orders_page_v1", {
        p_after: cursor, p_order_id: null, p_filter: "all", p_attention: false, p_limit: HISTORY_PAGE_SIZE,
      }).abortSignal(AbortSignal.timeout(15000));
      if (response.error) throw Error("Historical orders are unavailable.");
      const page = historicalOrderPage(response.data, HISTORY_PAGE_SIZE);
      if (page.kind !== "orders" || page.rows.some(row => row.ordinal <= cursor)) throw Error("Invalid historical order page.");
      for (const { data } of page.rows) {
        if (data.type !== "shop_order" || !["wc-completed", "wc-processing"].includes(data.status ?? "")) continue;
        const purchasedAt = historicalTimestamp(data.createdGmt);
        if (purchasedAt < start || purchasedAt >= end) continue;
        if (data.currency?.toLowerCase() !== "cad") throw Error("Historical orders use another currency.");
        totalCents += historicalCents(data.total);
        orderCount += 1;
      }
      if (!Number.isSafeInteger(totalCents) || !Number.isSafeInteger(orderCount)) throw Error("Historical total is too large.");
      if (page.nextCursor === null) break;
      if (page.nextCursor <= cursor) throw Error("Historical cursor did not advance.");
      cursor = page.nextCursor;
    }
    return { connected: true, totalCents, orderCount, currency: "cad", message: null };
  } catch {
    return { connected: false, totalCents: 0, orderCount: 0, currency: "cad",
      message: "The previous-store archive could not be loaded. Last year’s estimate is unavailable." };
  }
}

export function summarizeSalesPeriod(period: string, native: SalesResult, historical: SalesResult | null): Pick<CommerceOverview,
  "netSalesCents" | "currency" | "orderCount" | "salesConnected" | "salesSource" | "salesMessage"> {
  if (period !== "last_year") return {
    netSalesCents: native.totalCents, currency: "cad", orderCount: native.orderCount,
    salesConnected: native.connected, salesSource: "native", salesMessage: native.message,
  };
  const unavailable = (message: string | null) => ({
    netSalesCents: 0, currency: "cad", orderCount: 0,
    salesConnected: false, salesSource: "native" as const, salesMessage: message,
  });
  if (!native.connected) return unavailable(native.message);
  if (native.orderCount > 0) return unavailable("Last year includes new-store orders that have not yet been reconciled with the previous-store archive.");
  if (!historical?.connected) return unavailable(historical?.message ?? "The previous-store archive is unavailable.");
  if (historical.orderCount === 0) return unavailable("The saved previous-store archive has no completed or processing orders for last year. An estimate is unavailable.");
  return {
    netSalesCents: historical.totalCents, currency: "cad", orderCount: historical.orderCount,
    salesConnected: true, salesSource: "native-and-imported-estimate", salesMessage: null,
  };
}

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

export async function loadCommerceOverview(client: SupabaseClient, options: { salesPeriod: string; salesRange: SalesWindow }): Promise<CommerceOverview> {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [orders, nativeSales, historicalSales, fulfilment, customers, subscriptions, products, variants] = await Promise.all([
    client.from("commerce_orders").select(ORDER_COLUMNS).gte("created_at", since).order("order_number", { ascending: false }).limit(8),
    loadNativeSales(client, options.salesRange),
    options.salesPeriod === "last_year" ? loadHistoricalSalesEstimate(client, options.salesRange) : Promise.resolve(null),
    client.rpc("vf_admin_native_orders_page_v1",{p_after:null,p_order_number:null,p_filter:"to_fulfil",p_limit:1}).abortSignal(AbortSignal.timeout(15000)),
    client.from("commerce_customers").select("id", {count:"exact",head:true}),
    client.from("commerce_subscriptions").select("id", {count:"exact",head:true}).in("status",["active","trialing","past_due"]),
    client.from("commerce_products").select("id,name,status"),
    client.from("commerce_product_variants").select("id,product_id,sku,label,inventory_quantity,low_stock_threshold").eq("track_inventory",true).in("status",["active","draft"]),
  ]);
  const rows = (orders.data || []) as OrderRow[];
  const recentRows = rows;
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
    ...summarizeSalesPeriod(options.salesPeriod, nativeSales, historicalSales),
    fulfilmentCount:fulfilment.error||!Number.isSafeInteger(fulfilment.data?.total)||fulfilment.data.total<0?null:fulfilment.data.total,customerCount:customers.count??0,subscriptionCount:subscriptions.count??0,
    productCount:productRows.filter(p=>p.status==="active").length,draftProductCount:productRows.filter(p=>p.status==="draft").length,
    recentOrders:recentRows.map(r=>({...order(r),operation:operations.orders.get("native:"+r.id)})),inventoryAlerts,
  };
}
