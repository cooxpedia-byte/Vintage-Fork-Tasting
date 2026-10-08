import Link from "next/link";
import { loadProductSales, type ProductSalesReport } from "@/lib/admin/product-sales";
import { parseProductSalesPeriod, productSalesPeriodRange, PRODUCT_SALES_PERIODS } from "@/lib/admin/product-sales-periods";
import { requireStaff } from "@/lib/auth";
import { authorizedCommerceClient } from "@/lib/supabase/commerce-server";
import { StoreConnectionNotice } from "@/components/admin/StoreConnectionNotice";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string | string[]; period?: string | string[] };

function displayUnits(units: number | null): string {
  return units === null ? "—" : units.toLocaleString("en-CA");
}

export default async function ProductSalesPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const staff = await requireStaff(["admin"]);
  const client = await authorizedCommerceClient(staff.user.id);
  if (!client) return <StoreConnectionNotice />;

  const params = await searchParams;
  const query = (typeof params?.q === "string" ? params.q : "").trim().slice(0, 100);
  const period = parseProductSalesPeriod(params?.period);
  const selectedPeriod = PRODUCT_SALES_PERIODS.find(option => option.value === period)?.label ?? "Month to date";
  let report: ProductSalesReport | null = null;
  if (query) report = await loadProductSales(client, { query, range: productSalesPeriodRange(period) });

  return <main className="admin-page admin-product-sales-page">
    <div className="admin-page-heading">
      <div><p className="eyebrow">Commerce</p><h1>Product units sold</h1><p>Find a product to see how many units sold in each variation.</p></div>
      <Link className="btn btn-secondary" href="/admin" prefetch={false}>Commerce overview</Link>
    </div>

    <section className="admin-panel">
      <form action="/admin/product-sales" method="get" className="admin-product-sales-search" role="search">
        <label htmlFor="product-sales-query">Search product
          <input id="product-sales-query" name="q" type="search" maxLength={100} placeholder="For example, Advent Calendar" defaultValue={query} required />
        </label>
        <label htmlFor="product-sales-period">Period
          <select id="product-sales-period" name="period" defaultValue={period}>
            {PRODUCT_SALES_PERIODS.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}
          </select>
        </label>
        <button className="btn btn-gold" type="submit">Show units sold</button>
        {query && <Link href="/admin/product-sales" prefetch={false}>Clear</Link>}
      </form>
      <p className="admin-product-sales-definition"><strong>Combined units are an estimate.</strong> New-store units are from paid orders, excluding fully refunded orders and cancelled or returned items; partial refunds cannot be allocated to individual items. Previous-store archive units are from recorded completed, processing, or delivered orders, with payments and refunds unverified. Dates use Edmonton time.</p>
    </section>

    {!query ? <section className="admin-panel admin-product-sales-message"><h2>Search for a product</h2><p>Enter a product name and choose a period to see totals by variation.</p></section> :
      !report?.connected ? <section className="admin-panel admin-product-sales-message" role="alert"><h2>Product sales are unavailable</h2><p>{report?.message ?? "The report could not be loaded. Please try again."}</p></section> :
      <section className="admin-panel admin-product-sales-results" aria-label="Product sales results">
        <div className="admin-panel-heading"><div><p className="eyebrow">{selectedPeriod}</p><h2>Results for “{query}”</h2></div><span>{report.products.length} {report.products.length === 1 ? "product" : "products"}</span></div>
        {report.historyIncluded && <p className="admin-product-sales-note" role="status">Previous-store archive checked for this period.</p>}
        {report.message && <p className="admin-product-sales-note" role="status">{report.message}</p>}
        {report.more && <p className="admin-product-sales-note" role="status">Showing the first matching products. Narrow the product name to find a specific item.</p>}
        {report.products.length ? <div className="admin-product-sales-list">{report.products.map(product =>
          <article className="admin-product-sales-product" key={product.id}>
            <div className="admin-product-sales-product-heading"><h3>{product.name}</h3><div className="admin-product-sales-totals"><strong>{product.units === null ? "Combined estimate unavailable" : `${displayUnits(product.units)} combined estimated ${product.units === 1 ? "unit" : "units"}`}</strong><small>{displayUnits(product.nativeUnits)} new-store · {product.historicalUnits === null ? "previous-store archive estimate unavailable" : `${displayUnits(product.historicalUnits)} previous-store archive estimate`}</small></div></div>
            {!product.historyMapped && <p className="admin-product-sales-note">No previous-store product mapping is available for this item.</p>}
            {product.variations.length ? <div className="admin-product-sales-table-wrap"><table>
              <caption className="sr-only">{product.name} units sold by variation</caption>
              <thead><tr><th scope="col">Variation</th><th scope="col">SKU</th><th scope="col">New-store units</th><th scope="col">Previous-store estimate</th><th scope="col">Combined estimate</th></tr></thead>
              <tbody>{product.variations.map(variation => <tr key={variation.key}><th scope="row">{variation.label}</th><td>{variation.sku || "—"}</td><td>{displayUnits(variation.nativeUnits)}</td><td>{displayUnits(variation.historicalUnits)}</td><td>{displayUnits(variation.units)}</td></tr>)}</tbody>
            </table></div> : <p className="admin-product-sales-note">No variation details are available for this product.</p>}
          </article>)}</div> : <p className="admin-product-sales-note">No products match “{query}”. Try a broader product name.</p>}
      </section>}
  </main>;
}
