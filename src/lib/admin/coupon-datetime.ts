const localDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Return the browser offset for the selected wall-clock instant, including DST. */
export function couponLocalDateTimeOffset(value: string): number | null {
  if (!localDateTimePattern.test(value)) return null;
  const instant = new Date(value);
  if (!Number.isFinite(instant.valueOf())) return null;
  const normalized = `${instant.getFullYear().toString().padStart(4,"0")}-${(instant.getMonth()+1).toString().padStart(2,"0")}-${instant.getDate().toString().padStart(2,"0")}T${instant.getHours().toString().padStart(2,"0")}:${instant.getMinutes().toString().padStart(2,"0")}`;
  return normalized === value ? instant.getTimezoneOffset() : null;
}
