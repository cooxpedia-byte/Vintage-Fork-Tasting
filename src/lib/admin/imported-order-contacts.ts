import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderAddress, OrderContact } from "./order-contact";

const fields=["name","company","line1","line2","city","region","postalCode","country","email","phone"] as const;
function object(value:unknown):Record<string,unknown> {
  if(!value||typeof value!=="object"||Array.isArray(value))throw Error("Invalid contact response.");
  return value as Record<string,unknown>;
}
function address(value:unknown):OrderAddress|null {
  if(value===null)return null;
  const row=object(value);
  const result={} as OrderAddress;
  for(const field of fields) {
    const text=row[field];
    if(text!==null&&(typeof text!=="string"||text.length>4096))throw Error("Invalid address field.");
    result[field]=typeof text==="string"?text.trim()||null:null;
  }
  return result;
}
export function importedContacts(value:unknown,ids:string[],importedAt:string) {
  const data=object(value),result=new Map<string,OrderContact>();
  if(data.operational!==false||data.importedAt!==importedAt||!Array.isArray(data.contacts)||data.contacts.length>50)throw Error("Import contact mismatch.");
  for(const entry of data.contacts) {
    const row=object(entry);
    if(typeof row.orderId!=="string"||!ids.includes(row.orderId)||result.has(row.orderId)||typeof row.billingAmbiguous!=="boolean"||typeof row.shippingAmbiguous!=="boolean"||row.pickup!==false)throw Error("Order contact mismatch.");
    if((row.billingAmbiguous&&row.billing!==null)||(row.shippingAmbiguous&&row.shipping!==null))throw Error("Ambiguous address.");
    result.set(row.orderId,{billing:address(row.billing),shipping:address(row.shipping),billingAmbiguous:row.billingAmbiguous,shippingAmbiguous:row.shippingAmbiguous,pickup:false});
  }
  if(result.size!==ids.length)throw Error("Missing order contacts.");
  return result;
}
export async function loadImportedContacts(client:SupabaseClient,ids:string[],importedAt:string) {
  if(!ids.length)return {contacts:new Map<string,OrderContact>(),error:null};
  try {
    const result=await client.rpc("vf_admin_order_contacts_v1",{p_order_ids:ids}).abortSignal(AbortSignal.timeout(12000));
    if(result.error)throw Error("Unavailable");
    return {contacts:importedContacts(result.data,ids,importedAt),error:null};
  } catch { return {contacts:new Map<string,OrderContact>(),error:"Customer names and addresses could not be loaded. Refresh this page before preparing an order."}; }
}
