// Agora Web SDK 4.24.5+ uses these HTTPS and secure WebSocket domains for
// signaling and media negotiation. The SDK also probes non-default WSS ports
// (for example 4703) before falling back to TLS 443, so each source must allow
// Agora's published port range without opening connections to other hosts.
export const AGORA_CSP_CONNECT_SOURCES = [
  "https://*.agora.io:*",
  "wss://*.agora.io:*",
  "https://*.edge.agora.io:*",
  "wss://*.edge.agora.io:*",
  "https://*.sd-rtn.com:*",
  "wss://*.sd-rtn.com:*",
  "https://*.edge.sd-rtn.com:*",
  "wss://*.edge.sd-rtn.com:*",
  "https://*.rtnsvc.com:*",
  "wss://*.rtnsvc.com:*",
  "https://*.edge.rtnsvc.com:*",
  "wss://*.edge.rtnsvc.com:*",
  "https://*.rtesvc.com:*",
  "wss://*.rtesvc.com:*",
  "https://*.edge.rtesvc.com:*",
  "wss://*.edge.rtesvc.com:*"
] as const;

export const LIVE_TASTING_HEADER_ROUTES = [
  "/event/:inviteCode",
  "/admin/events/:eventId/live",
  "/admin/video-check"
] as const;

export const LIVE_TASTING_PERMISSIONS_POLICY =
  "camera=(self), microphone=(self), geolocation=()";
