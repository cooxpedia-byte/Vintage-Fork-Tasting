import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { authorizedCommerceClient } from "@/lib/supabase/commerce-server";
import {
  orderEmailEventNames,
  parseSavedOrderEmailTemplates,
  defaultOrderEmailTemplates,
  type OrderEmailEvent,
  type OrderEmailTemplate,
} from "@/lib/admin/order-email-templates";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
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

async function commerceAccess() {
  const staff = await requireStaff(["admin"]);
  return authorizedCommerceClient(staff.user.id);
}

export async function GET() {
  const client = await commerceAccess();
  if (!client) return json({ error: "Reconnect your store administrator account to manage order emails." }, 403);
  try {
    const result = await client.rpc("vf_admin_order_email_templates_v1").abortSignal(AbortSignal.timeout(12_000));
    if (result.error) throw result.error;
    return json({ templates: defaultOrderEmailTemplates(parseSavedOrderEmailTemplates(result.data)) });
  } catch {
    return json({ error: "Order email settings could not be loaded. Try again shortly." }, 503);
  }
}

export async function POST(request: Request) {
  const client = await commerceAccess();
  if (!client) return json({ error: "Reconnect your store administrator account to manage order emails." }, 403);
  const parsed = saveOrderEmailSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Review the email settings and try again. Use plain text and only {{orderNumber}} as a placeholder." }, 400);
  const input = parsed.data;
  try {
    const result = await client.rpc("vf_admin_save_order_email_template_v1", {
      p_event_type: input.eventType,
      p_enabled: input.enabled,
      p_subject_override: input.subjectOverride,
      p_title_override: input.titleOverride,
      p_intro_override: input.introOverride,
      p_closing_override: input.closingOverride,
      p_revision: input.revision,
    }).abortSignal(AbortSignal.timeout(12_000));
    if (result.error?.code === "40001") return json({ error: "This email changed since you opened it. Reload and review the latest version." }, 409);
    if (result.error) throw result.error;
    const saved = parseSavedOrderEmailTemplates({ templates: [result.data] })[0] as OrderEmailTemplate;
    if (saved.eventType !== input.eventType || saved.revision !== input.revision + 1) throw new Error("Unconfirmed email settings save.");
    return json({ template: saved });
  } catch {
    return json({ error: "The email settings could not be confirmed. Reload before retrying." }, 503);
  }
}
