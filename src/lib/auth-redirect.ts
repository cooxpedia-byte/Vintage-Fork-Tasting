export function safeNextPath(value: string | null, fallback: string) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : fallback;
}

export function withNextPath(destination: string, next: string, fallback = "/dashboard") {
  const separator = destination.includes("?") ? "&" : "?";
  return `${destination}${separator}next=${encodeURIComponent(safeNextPath(next, fallback))}`;
}
