import type { SupabaseClient } from "@supabase/supabase-js";
import { historicalOrderPage, historicalOrderQuery, type HistoricalPage } from "./historical-orders";
import { orderFilter, parseOrderOperations, loadOrderOperations, type OrderOperation } from "./order-operations";

export type ImportedParams = {after?:string;id?:string;items?:string;attention?:string;filter?:string};
export const IMPORTED_PAGE_SIZE = 50;
export type ImportedResult = {page:HistoricalPage|null;message:string|null;operations?:Map<string,OrderOperation>};

export function importedQueryParams(params:ImportedParams) {
  const query = new URLSearchParams();
  for (const key of ["after","id","items","attention","filter"] as const) {
    if (params[key] !== undefined && params[key] !== "") {
      if (typeof params[key] !== "string") throw new Error("Invalid filter.");
      query.set(key,params[key]);
    }
  }
  return query;
}

export async function loadImportedWindow(client:SupabaseClient,params:ImportedParams):Promise<ImportedResult> {
  try {
    const parsed=importedQueryParams(params), filter=orderFilter(params.filter);parsed.delete("filter");
    const query = historicalOrderQuery("https://dashboard.invalid/?"+parsed,"owner");
    const items=query.rpc==="vf_legacy_order_history_items_v1";
    const detailControls=items?await loadOrderOperations(client,[{kind:"imported",orderId:query.args.p_order_id}]):null;
    const result=await client.rpc(items?query.rpc:"vf_admin_imported_orders_page_v1",items?query.args:{
      p_after:query.args.p_after,p_order_id:query.args.p_order_id,p_filter:filter,p_attention:query.args.p_attention,p_limit:IMPORTED_PAGE_SIZE,
    }).abortSignal(AbortSignal.timeout(15000));
    if(result.error)return {page:null,message:result.error.code==="42501"
      ? "This account does not have access to the imported order records. Ask the store owner to check your access."
      : "Imported orders could not be loaded. This does not mean there are no imported records. Please refresh."};
    const page=historicalOrderPage(result.data,50);
    if(items?(page.kind!=="items"||page.sourceOrderId!==query.args.p_order_id):page.kind!=="orders")throw Error("Wrong order view.");
    if(page.rows.some(r=>r.ordinal<=query.args.p_after))throw Error("Invalid cursor.");
    let operations:Map<string,OrderOperation>|undefined=detailControls?.orders;
    if(page.kind==="orders") {
      if(query.args.p_order_id&&page.rows.some(r=>r.data.sourceOrderId!==query.args.p_order_id))throw Error("Wrong order.");
      const refs=page.rows.map(r=>({kind:"imported" as const,orderId:r.data.sourceOrderId}));
      operations=parseOrderOperations({operational:true,orders:result.data.rows.map((r:{operation:unknown})=>r.operation)},refs);
    }
    return {page,message:detailControls?.error??null,operations};
  } catch {return {page:null,message:"Imported orders are unavailable or the order reference is invalid. Reset this view and try again."};}
}
