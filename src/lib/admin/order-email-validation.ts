import { z } from "zod";
import { orderEmailEventNames, type OrderEmailEvent } from "@/lib/admin/order-email-templates";

const printable = (value: string) => !/[\u0000-\u0008\u000b-\u001f\u007f<>]/.test(value);
const knownPlaceholders = (value: string) => {
  const withoutOrderNumber = value.replaceAll("{{orderNumber}}", "");
  return !withoutOrderNumber.includes("{{") && !withoutOrderNumber.includes("}}");
};
const singleLine = (limit: number) => z.union([z.string().max(limit), z.null()])
  .refine((value) => value === null || (!/[\r\n]/.test(value) && printable(value) && knownPlaceholders(value)), "Use plain text and only the {{orderNumber}} placeholder.")
  .transform((value) => typeof value === "string" ? value.trim() || null : null);
const paragraph = z.union([z.string().max(1000), z.null()])
  .refine((value) => value === null || (printable(value) && knownPlaceholders(value)), "Use plain text and only the {{orderNumber}} placeholder.")
  .transform((value) => typeof value === "string" ? value.trim() || null : null);

export const saveOrderEmailSchema = z.object({
  eventType: z.string().refine((value): value is OrderEmailEvent => orderEmailEventNames.has(value)),
  enabled: z.boolean(),
  subjectOverride: singleLine(180),
  titleOverride: singleLine(160),
  introOverride: paragraph,
  closingOverride: paragraph,
  revision: z.number().int().min(0).max(1_000_000_000),
}).strict();
