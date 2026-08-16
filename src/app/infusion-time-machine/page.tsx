import type { Metadata, Viewport } from "next";
import { InfusionTimeMachineApp } from "@/components/tea-lab/InfusionTimeMachineApp";

export const metadata: Metadata = {
  title: "Infusion Time Machine",
  description: "Set the perfect infusion with Vintage Fork's free mechanical tea timer.",
  alternates: { canonical: "https://timemachine.vintagefork.ca/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "https://timemachine.vintagefork.ca/",
    siteName: "Vintage Fork Tea Company",
    title: "Infusion Time Machine",
    description: "Set the perfect infusion with Vintage Fork's free mechanical tea timer.",
    images: [
      {
        url: "/brand/vintage-fork-timer-mark.png",
        width: 384,
        height: 384,
        alt: "Vintage Fork Infusion Time Machine"
      }
    ]
  },
  manifest: "/infusion-time-machine.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Tea Time Machine"
  },
  icons: {
    icon: "/brand/vintage-fork-timer-mark.png",
    apple: "/brand/vintage-fork-timer-mark.png"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#100c09"
};

export default function InfusionTimeMachinePage() {
  return <InfusionTimeMachineApp />;
}
