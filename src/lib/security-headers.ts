// Agora Web SDK 4.x uses these HTTPS and secure WebSocket domains for
// signaling and media negotiation. Keep this list aligned with Agora's
// published firewall requirements.
export const AGORA_CSP_CONNECT_SOURCES = [
  "https://*.agora.io",
  "wss://*.agora.io",
  "https://*.sd-rtn.com",
  "wss://*.sd-rtn.com"
] as const;

export const LIVE_TASTING_HEADER_ROUTES = [
  "/event/:inviteCode",
  "/admin/events/:eventId/live"
] as const;

export const LIVE_TASTING_PERMISSIONS_POLICY =
  "camera=(self), microphone=(self), geolocation=()";
