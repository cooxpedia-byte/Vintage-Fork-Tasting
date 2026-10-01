export function safeNextPath(value: string | null, fallback: string) {
  if (!value
    || !value.startsWith("/")
    || value.startsWith("//")
    || /[\s\\]/.test(value)
    || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    return fallback;
  }
  try {
    const origin = "https://tasting.vintagefork.ca";
    return new URL(value, origin).origin === origin ? value : fallback;
  } catch {
    return fallback;
  }
}

export function withNextPath(destination: string, next: string, fallback = "/dashboard") {
  const separator = destination.includes("?") ? "&" : "?";
  return `${destination}${separator}next=${encodeURIComponent(safeNextPath(next, fallback))}`;
}

export function loginPathForDestination(next: string) {
  const destination = new URL(safeNextPath(next, "/dashboard"), "https://tasting.vintagefork.ca");
  const staffPath = (path: string) => path === "/admin" || path.startsWith("/admin/");
  if (staffPath(destination.pathname)) return "/admin/login";
  if (destination.pathname === "/reset-password") {
    const afterReset = safeNextPath(destination.searchParams.get("next"), "/dashboard");
    if (staffPath(new URL(afterReset, destination.origin).pathname)) return "/admin/login";
  }
  return "/login";
}
