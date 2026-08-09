"use client";

import { useState } from "react";
import { guestEventPath } from "@/lib/live-events-routes";

export function CopyEventInviteButton({ inviteCode, eventTitle, compact = false }: {
  inviteCode: string;
  eventTitle: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copyInvite() {
    const value = `${window.location.origin}${guestEventPath(inviteCode)}`;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      const input = document.createElement("textarea");
      input.value = value;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      const success = document.execCommand("copy");
      input.remove();
      setCopied(success);
      if (success) window.setTimeout(() => setCopied(false), 2400);
    }
  }

  return <button
    className={`btn ${compact ? "btn-gold" : "btn-secondary"}`}
    type="button"
    aria-label={`Copy guest invitation for ${eventTitle}`}
    onClick={copyInvite}
  >{copied ? "Copied" : "Copy guest link"}</button>;
}
