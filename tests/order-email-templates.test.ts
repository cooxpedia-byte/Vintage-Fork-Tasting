import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultOrderEmailTemplates,
  orderEmailEvents,
  parseSavedOrderEmailTemplates,
  previewOrderEmailCopy,
  type OrderEmailTemplate,
} from "@/lib/admin/order-email-templates";

const mocks = vi.hoisted(() => ({ staff: vi.fn(), commerce: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireStaff: mocks.staff }));
vi.mock("@/lib/supabase/commerce-server", () => ({ authorizedCommerceClient: mocks.commerce }));
import { GET, POST } from "@/app/api/admin/order-emails/route";
import { saveOrderEmailSchema } from "@/lib/admin/order-email-validation";

const savedRow: OrderEmailTemplate = {
  eventType: "merchant_new_order", enabled: false, subjectOverride: "New tea order #{{orderNumber}}",
  titleOverride: null, introOverride: null, closingOverride: null, revision: 1,
  updatedAt: "2026-10-03T19:00:00Z",
};

function post(value: unknown) {
  return POST(new Request("https://tasting.vintagefork.ca/api/admin/order-emails", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.staff.mockResolvedValue({ user: { id: "tasting-admin" } });
  mocks.commerce.mockResolvedValue({ rpc: mocks.rpc });
});

describe("order email settings contract", () => {
  it("keeps all eleven existing messages enabled and unedited by default", () => {
    const rows = defaultOrderEmailTemplates(parseSavedOrderEmailTemplates({ templates: [] }));
    expect(rows).toHaveLength(11);
    expect(rows.map((row) => row.eventType)).toEqual(orderEmailEvents.map((event) => event.eventType));
    expect(rows.every((row) => row.enabled && row.revision === 0 && row.subjectOverride === null)).toBe(true);
    expect(previewOrderEmailCopy(rows[1]).subject).toBe("New online order #10482");
    expect(previewOrderEmailCopy(rows[2]).intro).toBe("It will be on the way soon.");
  });

  it("previews only the edited fields and replaces the order number placeholder", () => {
    const row = { ...savedRow, titleOverride: "Please review #{{orderNumber}}" };
    expect(previewOrderEmailCopy(row, "21005")).toEqual({
      subject: "New tea order #21005",
      title: "Please review #21005",
      intro: "A verified payment was recorded and this order is ready for fulfilment review.",
      closing: "Questions? Reply to this email or contact info@vintagefork.ca.",
    });
    expect(() => parseSavedOrderEmailTemplates({ templates: [savedRow, savedRow] })).toThrow();
    expect(() => parseSavedOrderEmailTemplates({ templates: [{ ...savedRow, eventType: "unknown" }] })).toThrow();
  });

  it("accepts plain text and rejects unsupported tokens, markup, and extra fields", () => {
    const input = {
      eventType: "merchant_new_order", enabled: true, subjectOverride: "Order #{{orderNumber}}",
      titleOverride: null, introOverride: null, closingOverride: null, revision: 0,
    };
    expect(saveOrderEmailSchema.safeParse(input).success).toBe(true);
    expect(saveOrderEmailSchema.safeParse({ ...input, subjectOverride: "Order #{{customerEmail}}" }).success).toBe(false);
    expect(saveOrderEmailSchema.safeParse({ ...input, introOverride: "<b>hello</b>" }).success).toBe(false);
    expect(saveOrderEmailSchema.safeParse({ ...input, subjectOverride: "Header\nBcc: person@example.test" }).success).toBe(false);
    expect(saveOrderEmailSchema.safeParse({ ...input, extra: "surprise" }).success).toBe(false);
  });
});

describe("order email settings API", () => {
  it("requires both administrator identity and a bound commerce session for reads", async () => {
    mocks.commerce.mockResolvedValueOnce(null);
    const disconnected = await GET();
    expect(disconnected.status).toBe(403);
    expect(mocks.staff).toHaveBeenCalledWith(["admin"]);
    expect(mocks.commerce).toHaveBeenCalledWith("tasting-admin");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("loads saved rows through the owner RPC and merges untouched defaults", async () => {
    mocks.rpc.mockReturnValueOnce({ abortSignal: vi.fn().mockResolvedValue({ data: { templates: [savedRow] }, error: null }) });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.rpc).toHaveBeenCalledWith("vf_admin_order_email_templates_v1");
    const body = await response.json();
    expect(body.templates).toHaveLength(11);
    expect(body.templates.find((row: OrderEmailTemplate) => row.eventType === "merchant_new_order")).toEqual(savedRow);
    expect(body.templates.find((row: OrderEmailTemplate) => row.eventType === "customer_order_completed").enabled).toBe(true);
  });

  it("saves exactly one event with its expected revision", async () => {
    mocks.rpc.mockReturnValueOnce({ abortSignal: vi.fn().mockResolvedValue({ data: savedRow, error: null }) });
    const response = await post({
      eventType: "merchant_new_order", enabled: false, subjectOverride: " New tea order #{{orderNumber}} ",
      titleOverride: "", introOverride: null, closingOverride: null, revision: 0,
    });
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("vf_admin_save_order_email_template_v1", {
      p_event_type: "merchant_new_order", p_enabled: false,
      p_subject_override: "New tea order #{{orderNumber}}", p_title_override: null,
      p_intro_override: null, p_closing_override: null, p_revision: 0,
    });
    expect((await response.json()).template).toEqual(savedRow);
  });

  it("rejects invalid input before database access and reports revision conflicts", async () => {
    const invalid = await post({ eventType: "merchant_new_order", enabled: false });
    expect(invalid.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockReturnValueOnce({ abortSignal: vi.fn().mockResolvedValue({ data: null, error: { code: "40001" } }) });
    const conflict = await post({
      eventType: "merchant_new_order", enabled: false, subjectOverride: null,
      titleOverride: null, introOverride: null, closingOverride: null, revision: 1,
    });
    expect(conflict.status).toBe(409);
  });
});
