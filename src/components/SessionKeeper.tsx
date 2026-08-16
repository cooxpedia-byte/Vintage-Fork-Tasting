"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function SessionKeeper() {
  const pathname = usePathname();

  useEffect(() => {
    if (
      pathname === "/infusion-time-machine" ||
      window.location.hostname === "timemachine.vintagefork.ca"
    ) {
      return;
    }

    let active = true;
    let timer: number | null = null;
    let onVisible: (() => void) | null = null;

    void import("@/lib/supabase/browser").then(({ createClient }) => {
      if (!active) return;
      const supabase = createClient();
      const refresh = () => { void supabase.auth.getSession(); };
      refresh();
      timer = window.setInterval(refresh, 10 * 60 * 1000);
      onVisible = () => { if (!document.hidden) refresh(); };
      document.addEventListener("visibilitychange", onVisible);
    });

    return () => {
      active = false;
      if (timer !== null) window.clearInterval(timer);
      if (onVisible) document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);
  return null;
}
