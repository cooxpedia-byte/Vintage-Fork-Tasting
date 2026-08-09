"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { mobileHomeLiveEventsUrl } from "@/lib/live-events-routes";

type MobileContext = {
  source?: string;
  returnUrl?: string;
};

declare global {
  interface Window {
    VintageForkMobile?: {
      postMessage(message: string): void;
    };
  }
}

export function MobileHomeBridge() {
  const [embedded, setEmbedded] = useState(false);

  useEffect(() => {
    const bridgeCheck = window.setTimeout(() => {
      if (window.VintageForkMobile) setEmbedded(true);
    }, 0);
    const onContext = (event: Event) => {
      const detail = (event as CustomEvent<MobileContext>).detail;
      if (detail?.source === "vintage-fork-mobile") setEmbedded(true);
    };
    window.addEventListener("vintagefork:mobile-context", onContext);
    return () => {
      window.clearTimeout(bridgeCheck);
      window.removeEventListener("vintagefork:mobile-context", onContext);
    };
  }, []);

  if (!embedded) {
    return <Link className="btn btn-secondary" href="/dashboard">Back to Tea Lab</Link>;
  }

  return <button
    className="btn btn-secondary"
    type="button"
    onClick={() => {
      if (window.VintageForkMobile) {
        window.VintageForkMobile.postMessage(JSON.stringify({ type: "backToHome" }));
        return;
      }
      window.location.assign(mobileHomeLiveEventsUrl());
    }}
  >Back to Mobile Home</button>;
}
