"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Brand } from "@/components/Brand";
import { productEditorUrl } from "@/lib/admin/store-tools";

type AdminNavLink = {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
  adminOnly?: boolean;
  external?: boolean;
};

type AdminNavGroup = { label: string; links: AdminNavLink[] };

const clockInUrl = process.env.NEXT_PUBLIC_CLOCK_IN_URL ?? "https://vintage-fork-clockin.sarahmac024.chatgpt.site/employer";
const receiptFlowUrl = process.env.NEXT_PUBLIC_RECEIPT_FLOW_URL ?? "https://receiptflow.worldofteapodcast.ca";
const storefrontUrl = process.env.NEXT_PUBLIC_STOREFRONT_URL ?? "https://vintagefork.ca";
const teaLabUrl = process.env.NEXT_PUBLIC_TEA_LAB_URL ?? "https://tasting.vintagefork.ca/dashboard";
const liveEventsUrl = process.env.NEXT_PUBLIC_LIVE_EVENTS_URL ?? "https://tasting.vintagefork.ca/live-events";
const teaAtlasUrl = process.env.NEXT_PUBLIC_TEA_ATLAS_URL ?? "https://atlas.vintagefork.ca";

const groups: AdminNavGroup[] = [
  {
    label: "Commerce",
    links: [
      { href: "/admin", label: "Commerce overview", icon: "⌂", exact: true, adminOnly: true },
      { href: "/admin/orders", label: "Orders", icon: "▣", adminOnly: true },
      { href: "/admin/order-emails", label: "Order emails", icon: "✉", adminOnly: true },
      { href: productEditorUrl, label: "Products ↗", icon: "▦", adminOnly: true, external: true },
      { href: "/admin/product-sales", label: "Product sales", icon: "▤", adminOnly: true },
      { href: "/admin/coupons", label: "Coupons", icon: "%", adminOnly: true },
      { href: "/admin/store", label: "Store tools", icon: "▦", adminOnly: true },
      { href: `${storefrontUrl}/admin/pos/`, label: "Point of sale ↗", icon: "▤", adminOnly: true, external: true },
    ],
  },
  {
    label: "Customers",
    links: [
      { href: "/admin/accounts", label: "Customer accounts", icon: "♙", adminOnly: true },
      { href: "/admin/gold-leaves", label: "Gold Leaves", icon: "◆", adminOnly: true },
    ],
  },
  {
    label: "Tea Experiences",
    links: [
      { href: teaLabUrl, label: "Tea Lab ↗", icon: "◌", adminOnly: true, external: true },
      { href: teaAtlasUrl, label: "Tea Atlas ↗", icon: "⌖", adminOnly: true, external: true },
    ],
  },
  {
    label: "Live Events",
    links: [
      { href: liveEventsUrl, label: "Live events ↗", icon: "◉", external: true },
      { href: "/admin/events", label: "Event dashboard", icon: "◉" },
      { href: "/admin/teas", label: "Tea library", icon: "♨" },
      { href: "/admin/video-check", label: "Video diagnostics", icon: "◫" },
    ],
  },
  {
    label: "Business Apps",
    links: [
      { href: clockInUrl, label: "Clock In ↗", icon: "◷", adminOnly: true, external: true },
      { href: receiptFlowUrl, label: "Receipt Flow ↗", icon: "▧", adminOnly: true, external: true },
    ],
  },
  {
    label: "System",
    links: [
      { href: "/admin/settings", label: "Settings", icon: "⚙", adminOnly: true },
      { href: "/admin/operations", label: "Operations", icon: "◎" },
    ],
  },
];

export function AdminShell({ children, role }: { children: ReactNode; role: "customer" | "host" | "admin" | null }) {
  const pathname = usePathname();

  if (pathname === "/admin/login") return children;

  return (
    <div className="unified-admin">
      <input
        aria-controls="admin-navigation"
        aria-label="Show or hide admin navigation"
        className="admin-nav-toggle"
        id="admin-navigation-toggle"
        type="checkbox"
      />
      <a className="skip-link" href="#admin-main">Skip to admin content</a>
      <header className="admin-topbar">
        <Brand href="/admin" compact />
        <div className="admin-topbar-title">
          <strong>Vintage Fork</strong>
          <span>Commerce admin</span>
        </div>
          <span className="admin-environment"><i aria-hidden="true" /> {role === "admin" ? "Administrator" : "Host workspace"}</span>
        <Link className="admin-topbar-link" href="/dashboard">Customer view</Link>
        <Link className="admin-topbar-link" href="/logout" prefetch={false}>Sign out</Link>
      </header>

      <aside className="admin-rail" aria-label="Admin navigation" id="admin-navigation">
        <nav>
          {groups.map((group) => (
            <div className="admin-nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.links.filter((link) => !(link.adminOnly && role !== "admin")).map((link) => {
                const active = !link.external && (link.exact ? pathname === link.href : pathname.startsWith(link.href));
                const content = <><span aria-hidden="true">{link.icon}</span>{link.label}</>;
                return link.external ? (
                  <a href={link.href} key={link.href} rel="noreferrer" target="_blank">{content}</a>
                ) : (
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={active ? "is-active" : ""}
                    href={link.href}
                    key={link.href}
                    prefetch={false}
                  >
                    {content}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="admin-rail-footer">
          <span className="admin-system-dot" aria-hidden="true" />
          <div><strong>Systems ready</strong><small>Protected staff access</small></div>
        </div>
      </aside>

      <div className="admin-shell-content" id="admin-main">
        {children}
      </div>
      <label aria-label="Close navigation" className="admin-nav-backdrop" htmlFor="admin-navigation-toggle" />
    </div>
  );
}
