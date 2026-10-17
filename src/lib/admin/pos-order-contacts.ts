import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderContact } from "./order-contact";

export type SavedPosOrderContact = { email: string; name: string | null };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const message = "Saved POS customer details could not be loaded. Please refresh.";

/** The admin-only RPC binds the saved attempt to this order's customer/profile.
 * Only email and name cross this boundary; never return the raw contact snapshot.
 */
export async function loadSavedPosOrderContacts(client: SupabaseClient, orders: Array<{ id: string; source: unknown }>) {
  const ids = orders.filter(order => order.source === "pos").map(order => order.id);
  const contacts = new Map<string, SavedPosOrderContact>();
  if (!ids.length) return { contacts, error: null };
  try {
    if (ids.length > 50 || ids.some(id => !uuid.test(id)) || new Set(ids).size !== ids.length) throw Error("Invalid references");
    const result = await client.rpc("vf_admin_pos_order_contacts_v1", { p_order_ids: ids }).abortSignal(AbortSignal.timeout(12000));
    if (result.error || !result.data || !Array.isArray(result.data.contacts) || result.data.contacts.length > ids.length)
      throw Error("Invalid contact response");
    for (const raw of result.data.contacts) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("Invalid contact");
      const row = raw as Record<string, unknown>;
      if (Object.keys(row).some(key => !["orderId","email","name"].includes(key)) ||
        typeof row.orderId !== "string" || !ids.includes(row.orderId) || contacts.has(row.orderId) ||
        typeof row.email !== "string" || row.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email) ||
        /[\u0000-\u001f\u007f]/.test(row.email) ||
        (row.name !== null && (typeof row.name !== "string" || !row.name.trim() || row.name.length > 200 || /[\u0000-\u001f\u007f]/.test(row.name))))
        throw Error("Invalid contact fields");
      contacts.set(row.orderId, { email: row.email, name: row.name as string | null });
    }
    return { contacts, error: null };
  } catch { return { contacts: new Map<string, SavedPosOrderContact>(), error: message }; }
}

/** Fill gaps in the saved order contact without replacing saved order facts. */
export function withSavedPosOrderContact(contact: OrderContact, saved?: SavedPosOrderContact): OrderContact {
  if (!saved || contact.billingAmbiguous) return contact;
  const billing = contact.billing ?? {name:null,company:null,line1:null,line2:null,city:null,region:null,postalCode:null,country:null,email:null,phone:null};
  return { ...contact, billing: { ...billing, name: billing.name ?? saved.name, email: billing.email ?? saved.email } };
}
