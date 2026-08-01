"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/browser";

export function SessionKeeper() {
  useEffect(() => {
    const supabase = createClient();
    const refresh = () => { void supabase.auth.getSession(); };
    refresh();
    const timer = window.setInterval(refresh, 10 * 60 * 1000);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
  return null;
}
