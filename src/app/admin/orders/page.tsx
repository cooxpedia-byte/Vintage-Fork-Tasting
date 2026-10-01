import Link from "next/link";
import { OrderRows } from "@/components/admin/CommerceAdminOverview";
import { ImportedOrders } from "@/components/admin/ImportedOrders";
import { loadOrderPage, type OrderPage } from "@/lib/admin/commerce";
import { requireStaff } from "@/lib/auth";
import { authorizedCommerceClient } from "@/lib/supabase/commerce-server";
import { StoreConnectionNotice } from "@/components/admin/StoreConnectionNotice";

export const dynamic="force-dynamic";
type Params={status?:string;filter?:string;after?:string;number?:string;source?:string;id?:string;items?:string;attention?:string};
export default async function AdminOrdersPage({searchParams}:{searchParams:Promise<Params>}) {
  const staff=await requireStaff(["admin"]);
  const params=await searchParams;
  const client=await authorizedCommerceClient(staff.user.id);
  if(!client)return <StoreConnectionNotice orders/>;
  const imported=params.source==="imported",native=params.source==="native",fulfilment=params.status==="fulfilment";
  const input=params.number??params.id;
  const search=typeof input==="string"?input.trim().replace(/^#\s*/,""):input;
  let page:OrderPage|null=null;
  if(!imported&&!params.items) {
    try {
      // Imported identifiers can be wider than the native signed bigint sequence.
      page=typeof search==="string"&&/^[1-9][0-9]{0,19}$/.test(search)&&BigInt(search)>9223372036854775807n
        ? {connected:true,orders:[],nextCursor:null,total:0,error:null}
        : await loadOrderPage(client,{after:params.after,number:search,fulfilment,filter:params.filter});
    } catch {page={connected:false,orders:[],nextCursor:null,total:null,error:"Invalid order number. Choose All orders to reset your search."};}
  }
  const nativeNext=new URLSearchParams({source:"native"});
  if(fulfilment)nativeNext.set("status","fulfilment");
  if(search)nativeNext.set("number",search);
  if(params.filter)nativeNext.set("filter",params.filter);
  const nativeFirst=new URLSearchParams(nativeNext);
  if(page?.nextCursor)nativeNext.set("after",page.nextCursor);
  return <main className="admin-page">
    <div className="admin-page-heading"><div><p className="eyebrow">Commerce</p><h1>Orders</h1><p>New purchases appear first. Open an order to see its details or email the customer a note. Migrated records are below.</p></div></div>
    <nav className="admin-order-filters" aria-label="Order filters">
      <Link className={!imported&&!native&&!fulfilment?"is-active":""} href="/admin/orders" prefetch={false}>All orders</Link>
      <Link className={fulfilment?"is-active":""} href="/admin/orders?status=fulfilment" prefetch={false}>To fulfil</Link>
      <Link className={imported?"is-active":""} href="/admin/orders?source=imported" prefetch={false}>Migrated records</Link>
      <Link className={native?"is-active":""} href="/admin/orders?source=native" prefetch={false}>New purchases{page?.total!==null&&page?.total!==undefined?` (${page.total})`:""}</Link>
    </nav>
    {!params.items&&<nav className="admin-order-filters" aria-label="Order status filters">
      {[["all","All statuses"],["processing","Processing"],["on_hold","On hold"],["pending","Pending"],["failed","Failed"],["completed","Completed"],["refunded","Refunded"]].map(([value,label])=>{
        const query=new URLSearchParams();if(imported||native)query.set("source",params.source!);if(search)query.set("number",search);if(value!=="all")query.set("filter",value);
        return <Link key={value} className={(params.filter||"all")===value?"is-active":""} href={"/admin/orders"+(query.size?"?"+query:"")} prefetch={false}>{label}</Link>;
      })}
    </nav>}
    {!params.items&&<form action="/admin/orders" className="admin-order-search">
      <label htmlFor="order-number">Order number (new or migrated)</label><input id="order-number" name="number" inputMode="numeric" maxLength={40} defaultValue={typeof search==="string"?search:""}/>
      <button className="btn btn-gold" type="submit">Search all orders</button>{search&&<Link href="/admin/orders" prefetch={false}>Clear search</Link>}
    </form>}
    {page&&<section className="admin-panel admin-orders-panel" id="new-orders">
      <div className="admin-panel-heading"><div><p className="eyebrow">New store · all dates</p><h2>{fulfilment?"New purchases to fulfil":"New purchases"}</h2></div>{page.total!==null&&<span>{page.total} orders</span>}</div>
      {page.error?<div className="admin-commerce-notice" role="alert">{page.error}</div>:page.orders.length?<OrderRows orders={page.orders} full/>:<p>No new purchases match this view.</p>}
      <nav className="admin-order-pagination" aria-label="New purchase pages">{params.after&&<Link className="btn btn-secondary" href={"/admin/orders?"+nativeFirst} prefetch={false}>Newest purchases</Link>}{page.nextCursor&&<Link className="btn btn-secondary" href={"/admin/orders?"+nativeNext} prefetch={false}>Older purchases</Link>}</nav>
    </section>}
    {!native&&<ImportedOrders client={client} hideSearch params={{
      after:imported?params.after:undefined,id:search,items:params.items,filter:params.filter,
      attention:params.attention??(fulfilment?"1":undefined),
    }}/>}
  </main>;
}
