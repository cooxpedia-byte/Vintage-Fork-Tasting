import { requireStaff } from "@/lib/auth";
import { productEditorUrl } from "@/lib/admin/store-tools";

const storefront = process.env.NEXT_PUBLIC_STOREFRONT_URL ?? "https://vintagefork.ca";

export default async function AdminStorePage() {
  await requireStaff(["admin"]);
  const modules = [
    { name: "Edit products", note: "Open the product catalogue to find an item and edit its saved details, images and pricing.", href: productEditorUrl, status: "Staff access", icon: "▦", action: "Edit products ↗" },
    { name: "Point of sale", note: "Open the register and its catalogue tools.", href: `${storefront}/admin/pos/`, status: "Staff access", icon: "▣", action: "Open register ↗" },
    { name: "View website", note: "Review the customer-facing shop and product pages.", href: "https://vintagefork.ca/shop/", status: "Live website", icon: "◫", action: "Open shop ↗" },
  ];
  return (
    <main className="admin-page">
      <div className="admin-page-heading"><div><p className="eyebrow">Commerce</p><h1>Store tools</h1><p>Open the product editor, register or customer website from your dashboard.</p></div></div>
      <div className="admin-module-grid">{modules.map((module) => (
        <a className="admin-module-card" href={module.href} key={module.name} rel="noreferrer" target="_blank">
          <span className="admin-module-icon">{module.icon}</span><div><h2>{module.name}</h2><p>{module.note}</p></div><span className="chip">{module.status}</span><b>{module.action}</b>
        </a>
      ))}</div>
      <section className="admin-panel"><h2>Editing a product</h2><p>Choose <strong>Edit products</strong>, find the item in the catalogue, then select <strong>Edit product</strong>. The editor opens in a new tab and uses your website staff account.</p><p>Choose a size to edit its price and availability, and select all categories for the product. Stock counts are recorded in the separate inventory panel.</p></section>
    </main>
  );
}
