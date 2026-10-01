import Link from "next/link";
import { requireStaff } from "@/lib/auth";

const clockInUrl = process.env.NEXT_PUBLIC_CLOCK_IN_URL ?? "https://vintage-fork-clockin.sarahmac024.chatgpt.site/employer";
const receiptFlowUrl = process.env.NEXT_PUBLIC_RECEIPT_FLOW_URL ?? "https://receiptflow.worldofteapodcast.ca";
const storefrontUrl = process.env.NEXT_PUBLIC_STOREFRONT_URL ?? "https://vintagefork.ca";
const teaLabUrl = process.env.NEXT_PUBLIC_TEA_LAB_URL ?? "https://tasting.vintagefork.ca/dashboard";
const liveEventsUrl = process.env.NEXT_PUBLIC_LIVE_EVENTS_URL ?? "https://tasting.vintagefork.ca/live-events";
const teaAtlasUrl = process.env.NEXT_PUBLIC_TEA_ATLAS_URL ?? "https://atlas.vintagefork.ca";

export default async function AdminSettingsPage() {
  await requireStaff(["admin"]);
  const workspaces = [
    { name: "Commerce & POS", detail: "Products, pricing, orders, subscriptions and in-person checkout.", href: `${storefrontUrl}/admin/products/`, icon: "▦", status: "Connected", external: true },
    { name: "Tea Lab", detail: "Open the customer tasting workspace, personal tasting notes and Tea Cellar records.", href: teaLabUrl, icon: "◌", status: "Connected", external: true },
    { name: "Live Events", detail: "Open the customer-facing schedule and live tasting rooms.", href: liveEventsUrl, icon: "◉", status: "Connected", external: true },
    { name: "Tea Atlas", detail: "Explore the connected tea origins, styles and knowledge experience.", href: teaAtlasUrl, icon: "⌖", status: "Connected", external: true },
    { name: "Live Event dashboard", detail: "Create tastings, operate live rooms, review results and diagnose video.", href: "/admin/events", icon: "◉", status: "Available", external: false },
    { name: "Customer accounts", detail: "Find customers, inspect access and manage their Gold Leaves wallets.", href: "/admin/accounts", icon: "♙", status: "Protected", external: false },
    { name: "Clock In", detail: "Employee scheduling, timecards, payroll review and employer settings.", href: clockInUrl, icon: "◷", status: "Connected", external: true },
    { name: "Receipt Flow", detail: "Receipt capture, review, expense filing and approval workflow.", href: receiptFlowUrl, icon: "▧", status: "Connected", external: true },
    { name: "System operations", detail: "Identity, privacy retention, video readiness and integration health.", href: "/admin/operations", icon: "◎", status: "Available", external: false },
  ];

  return (
    <main className="admin-page">
      <div className="admin-page-heading"><div><p className="eyebrow">Unified control</p><h1>Settings & business apps</h1><p>Every Vintage Fork operating system has one clear entry point from this admin dashboard.</p></div></div>
      <section className="admin-settings-grid" aria-label="Business apps and settings">
        {workspaces.map((workspace) => {
          const content = <><span className="admin-module-icon">{workspace.icon}</span><div><h2>{workspace.name}</h2><p>{workspace.detail}</p></div><span className="chip chip-success">{workspace.status}</span><b>Open {workspace.external ? "app ↗" : "settings →"}</b></>;
          return workspace.external
            ? <a className="admin-module-card" href={workspace.href} key={workspace.name} rel="noreferrer" target="_blank">{content}</a>
            : <Link className="admin-module-card" href={workspace.href} key={workspace.name} prefetch={false}>{content}</Link>;
        })}
      </section>
    </main>
  );
}
