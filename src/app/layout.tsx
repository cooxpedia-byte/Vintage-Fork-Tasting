import type { Metadata, Viewport } from "next";
import "./globals.css";
import { OfflineBanner } from "@/components/OfflineBanner";
import { SessionKeeper } from "@/components/SessionKeeper";
import { InterfaceFeedback } from "@/components/InterfaceFeedback";
import { BRAND_ASSETS } from "@/lib/brand";

export const metadata: Metadata = {
  title: { default: "Vintage Fork Tasting", template: "%s · Vintage Fork" },
  description: "Live guided tea tastings, tasting history and host administration.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  icons: { icon: BRAND_ASSETS.logo.src },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#4B1638" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to main content</a><OfflineBanner /><SessionKeeper /><InterfaceFeedback />{children}</body></html>;
}
