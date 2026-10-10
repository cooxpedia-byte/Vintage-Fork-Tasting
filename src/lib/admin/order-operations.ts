import type { SupabaseClient } from "@supabase/supabase-js";

export type OrderKind = "native" | "imported";
export type EditableOrderStatus = "processing" | "on_hold" | "completed";
export type OrderOperation = {
  kind: OrderKind; orderId: string; status: string; revision: number;
  sourceStatus: string | null; sourceVersion: string;
  staleOverlay?:boolean;reviewReason?:string|null;
  allowedTargets: EditableOrderStatus[];
  fulfillmentReferenceRequired?: boolean;
};
export const editableStatuses: EditableOrderStatus[] = ["processing", "on_hold", "completed"];
export const orderFilters = ["all","processing","on_hold","failed","completed","pending","cancelled","refunded","partially_refunded"] as const;
export type OrderFilter = typeof orderFilters[number];
export function orderFilter(value:unknown):OrderFilter {
  if(value===undefined||value==="")return "all";
  if(typeof value!=="string"||!orderFilters.includes(value as OrderFilter))throw Error("Invalid status filter.");
  return value as OrderFilter;
}
export const editableStatusLabels: Record<EditableOrderStatus, string> = {
  processing: "Processing", on_hold: "On hold", completed: "Completed",
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validOrderRef(kind: unknown, id: unknown): kind is OrderKind {
  return typeof id === "string" && (kind === "native" ? uuid.test(id) : kind === "imported" && /^[1-9][0-9]{0,19}$/.test(id));
}
export function parseOrderOperations(value: unknown, refs: Array<{kind:OrderKind;orderId:string}>): Map<string,OrderOperation> {
  const fail=():never=>{throw new Error("Order controls are unavailable. Refresh and try again.");};
  if (!value || typeof value!=="object") return fail();
  const envelope=value as {operational?:unknown;orders?:unknown};
  if(envelope.operational!==true||!Array.isArray(envelope.orders)||envelope.orders.length!==refs.length||refs.length>100) return fail();
  const expected=new Set(refs.map(r=>r.kind+":"+r.orderId));
  if(expected.size!==refs.length)return fail();
  const orders=new Map<string,OrderOperation>();
  for(const raw of envelope.orders) {
    if(!raw||typeof raw!=="object")return fail();
    const r=raw as Record<string,unknown>;
    const key=r.kind+":"+r.orderId;
    if(!expected.has(key)||orders.has(key)||!validOrderRef(r.kind,r.orderId)||typeof r.status!=="string"||r.status.length>100
      ||!Number.isSafeInteger(r.revision)||(r.revision as number)<0
      ||!(r.sourceStatus===null||typeof r.sourceStatus==="string"&&r.sourceStatus.length<=100)
      ||typeof r.sourceVersion!=="string"||!/^[a-f0-9]{64}$/.test(r.sourceVersion)
      ||!Array.isArray(r.allowedTargets)||r.allowedTargets.length>3||new Set(r.allowedTargets).size!==r.allowedTargets.length
      ||r.allowedTargets.some(t=>!editableStatuses.includes(t)))return fail();
    if(r.staleOverlay!==undefined&&typeof r.staleOverlay!=="boolean")return fail();
    if(r.fulfillmentReferenceRequired!==undefined&&typeof r.fulfillmentReferenceRequired!=="boolean")return fail();
    if(r.reviewReason!==undefined&&r.reviewReason!==null&&r.reviewReason!=="source_changed"&&r.reviewReason!=="not_actionable")return fail();
    if(r.staleOverlay===true&&r.allowedTargets.length)return fail();
    orders.set(key,{kind:r.kind,orderId:r.orderId as string,status:r.status,revision:r.revision as number,
      sourceStatus:r.sourceStatus as string|null,sourceVersion:r.sourceVersion,allowedTargets:r.allowedTargets as EditableOrderStatus[],fulfillmentReferenceRequired:r.fulfillmentReferenceRequired===true,staleOverlay:r.staleOverlay===true,reviewReason:r.reviewReason as string|null|undefined});
  }
  return orders;
}
export async function loadOrderOperations(client:SupabaseClient,refs:Array<{kind:OrderKind;orderId:string}>) {
  if(!refs.length)return {orders:new Map<string,OrderOperation>(),error:null};
  try {
    if(refs.length>100||refs.some(r=>!validOrderRef(r.kind,r.orderId)))throw Error("Invalid order reference.");
    const result=await client.rpc("vf_admin_order_operations_v1",{p_refs:refs}).abortSignal(AbortSignal.timeout(15000));
    if(result.error)throw Error("Order controls unavailable.");
    return {orders:parseOrderOperations(result.data,refs),error:null};
  } catch {return {orders:new Map<string,OrderOperation>(),error:"Order controls could not be loaded. Refresh before changing an order."};}
}
