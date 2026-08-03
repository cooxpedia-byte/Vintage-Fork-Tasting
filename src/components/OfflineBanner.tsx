"use client";

import { useEffect, useState } from "react";
import {
  CONNECTION_HEALTH_EVENT,
  getConnectionNotice,
  requestConnectionRetry,
  updateConnectionIssues,
  type ConnectionHealthDetail,
  type ConnectionIssues
} from "@/lib/connection-health";

export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const [issues, setIssues] = useState<ConnectionIssues>({});
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) requestConnectionRetry();
    };
    const updateHealth = (event: Event) => {
      const detail = (event as CustomEvent<ConnectionHealthDetail>).detail;
      if (detail?.source) setIssues(current => updateConnectionIssues(current, detail));
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener(CONNECTION_HEALTH_EVENT, updateHealth);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener(CONNECTION_HEALTH_EVENT, updateHealth);
    };
  }, []);
  const notice = getConnectionNotice(online, issues);
  if (!notice) return null;
  return <div className="notice error connection-banner" role="status" aria-live="polite"><span>{notice}</span><button className="btn btn-secondary" type="button" disabled={!online} onClick={requestConnectionRetry}>{online ? "Retry now" : "Waiting for connection"}</button></div>;
}
