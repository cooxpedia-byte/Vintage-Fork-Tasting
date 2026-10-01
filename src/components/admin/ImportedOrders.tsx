import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sourceAmount } from "@/lib/admin/historical-orders";
import { importedQueryParams, loadImportedWindow, type ImportedParams } from "@/lib/admin/load-imported-orders";
import { loadImportedContacts } from "@/lib/admin/imported-order-contacts";
import { OrderContact } from "./OrderContact";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { OrderStatusControl } from "./OrderStatusControl";
import { loadOrderEmailStatuses } from "@/lib/admin/order-email-status";
import { OrderEmailStatus } from "./OrderEmailStatus";
import { CustomerOrderNotes } from "./CustomerOrderNotes";
import { loadCustomerOrderNotes } from "@/lib/admin/customer-order-notes";
import { PrivateOrderNotes } from "./PrivateOrderNotes";
import { loadPrivateOrderNotes } from "@/lib/admin/private-order-notes";

const base="/admin/orders?source=imported";
const typeName=(value:string|null)=>value==="shop_order"?"Order":value==="shop_subscription"?"Subscription record":value==="shop_order_refund"?"Refund record":value||"Order record";

export async function ImportedOrders({client,params,hideSearch=false}:{client:SupabaseClient;params:ImportedParams;hideSearch?:boolean}) {
  const {page,message,operations}=await loadImportedWindow(client,params);
  const ids=page?.kind==="orders"?page.rows.map(r=>r.data.sourceOrderId):page?.kind==="items"?[page.sourceOrderId]:[];
  const details=page?await loadImportedContacts(client,ids,page.importedAt):null;
  const emailStatus=page?.kind==="items"?await loadOrderEmailStatuses(client,[{kind:"imported",orderId:page.sourceOrderId}]):null;
  const [customerNotes,privateNotes]=page?.kind==="items"?await Promise.all([
    loadCustomerOrderNotes(client,"imported",page.sourceOrderId),
    loadPrivateOrderNotes(client,"imported",page.sourceOrderId),
  ]):[null,null];
  let queryParams=new URLSearchParams();
  try {queryParams=importedQueryParams(params);} catch { /* Invalid query is reported by the loader. */ }
  const next=new URLSearchParams(queryParams);next.set("source","imported");
  const first=new URLSearchParams(next);first.delete("after");
  if(page?.nextCursor)next.set("after",String(page.nextCursor));
  const pagination=<nav className="admin-order-pagination" aria-label="Imported record pages">
    {page&&<span className="admin-order-page-count">Showing {page.rows.length} of {page.total.toLocaleString("en-CA")} {page.kind==="items"?"items":"matching records"}</span>}
    {params.after&&<Link className="btn btn-secondary" href={"/admin/orders?"+first} prefetch={false}>First page</Link>}
    {page?.nextCursor&&<Link className="btn btn-gold" href={"/admin/orders?"+next} prefetch={false}>{page.kind==="items"?"Next items":"Next 50 records →"}</Link>}
  </nav>;
  return <section className="admin-panel admin-imported-orders" id="migrated-orders">
    <div className="admin-panel-heading"><div><p className="eyebrow">Migrated from your previous store</p><h2>{page?.kind==="items"?"Imported order "+page.sourceOrderId:params.attention?"Open / needs review":"All migrated records"}</h2></div>{page&&<strong className="admin-order-total">{page.total.toLocaleString("en-CA")} {page.kind==="items"?"items":"records"}</strong>}</div>
    <p className="admin-orders-note">Orders, subscription records and refunds are labelled below. Status changes are saved in this dashboard; original migration records are preserved.</p>
    {!params.items&&<>
      {!hideSearch&&<form className="admin-order-search" action="/admin/orders"><label htmlFor="imported-id">Order number (new or migrated)</label><input id="imported-id" name="number" inputMode="numeric" pattern="[1-9][0-9]{0,19}" defaultValue={params.id||""}/><button type="submit" className="btn btn-secondary">Find order</button></form>}
      <nav className="admin-order-filters" aria-label="Imported order filters"><Link className={!params.attention?"is-active":""} href={base} prefetch={false}>All imported records</Link><Link className={params.attention?"is-active":""} href={base+"&attention=1"} prefetch={false}>Open / needs review</Link></nav>
    </>}
    {message&&<div className="admin-commerce-notice" role="alert"><strong>{message}</strong><Link href={base} prefetch={false}>Reset imported view</Link></div>}
    {details?.error&&<p className="admin-commerce-notice" role="alert">{details.error}</p>}
    {page&&pagination}
    {page?.kind==="orders"&&<div className="admin-imported-list">{page.rows.map(({ordinal,itemCount,data:o})=><article key={ordinal}>
      <div><strong>{typeName(o.type)} · {o.sourceOrderId}</strong><small>{o.createdGmt||"Date unavailable"} {o.createdGmt?"UTC":""}</small></div>
      <OrderStatusBadge source="historical" status={o.status} type={o.type} operation={operations?.get("imported:"+o.sourceOrderId)}/><strong>{sourceAmount(o.total,o.currency)}</strong>
      <Link className="btn btn-secondary" href={base+"&id="+encodeURIComponent(o.sourceOrderId)+"&items=1"} prefetch={false}>Open {o.type==="shop_order"?"order":"record"} · {itemCount} items</Link>
      <OrderContact contact={details?.contacts.get(o.sourceOrderId)}/>
      {o.type==="shop_order"&&<div className="admin-order-actions">{operations?.has("imported:"+o.sourceOrderId)&&<OrderStatusControl key={o.sourceOrderId+":"+operations.get("imported:"+o.sourceOrderId)!.revision+":"+operations.get("imported:"+o.sourceOrderId)!.sourceVersion} order={operations.get("imported:"+o.sourceOrderId)!} number={o.sourceOrderId}/>}
        </div>}
    </article>)}</div>}
    {page?.kind==="items"&&<><Link href={base} prefetch={false}>← Back to imported orders</Link>
      {operations?.get("imported:"+page.sourceOrderId)&&<div className="admin-order-actions">
        <OrderStatusBadge source="historical" status={operations.get("imported:"+page.sourceOrderId)!.sourceStatus} operation={operations.get("imported:"+page.sourceOrderId)}/>
        <OrderStatusControl key={page.sourceOrderId+":"+operations.get("imported:"+page.sourceOrderId)!.revision+":"+operations.get("imported:"+page.sourceOrderId)!.sourceVersion} order={operations.get("imported:"+page.sourceOrderId)!} number={page.sourceOrderId}/>
      </div>}
      {emailStatus&&<OrderEmailStatus notifications={emailStatus.notifications} error={emailStatus.error}/>}
      {customerNotes&&<CustomerOrderNotes key={"imported:"+page.sourceOrderId} kind="imported" orderId={page.sourceOrderId} context={customerNotes.context} error={customerNotes.error}/>}
      {privateNotes&&<PrivateOrderNotes key={"private:imported:"+page.sourceOrderId} kind="imported" orderId={page.sourceOrderId} context={privateNotes.context} error={privateNotes.error}/>}
      <OrderContact contact={details?.contacts.get(page.sourceOrderId)}/><div className="admin-imported-list">{page.rows.map(({ordinal,data:item})=><article key={ordinal}>
      <div><strong>{item.name||"Item description unavailable"}</strong><small>{item.type||"Item"} · Imported item {item.sourceItemId}</small></div>
      <span>Quantity: {item.quantity??"Unavailable"}</span><span>Saved line total: {item.total??item.shippingCost??item.discount??"Unavailable"}</span>
    </article>)}</div></>}
    {page&&!page.rows.length&&<p>No records match this view. Choose All imported records or clear the order number.</p>}
    {page&&pagination}
    {page&&<p className="admin-orders-note">Import updated: <time>{page.importedAt}</time></p>}
  </section>;
}
