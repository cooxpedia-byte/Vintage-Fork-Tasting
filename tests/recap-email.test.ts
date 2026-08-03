import { describe, expect, it } from "vitest";
import {
  buildRecapEmail,
  getRecapMailSettings,
  maskEmail,
  RecapEmailConfigurationError
} from "@/lib/recap-email";

describe("guest recap email", () => {
  it("masks the recipient without exposing the complete local part", () => {
    expect(maskEmail("daniel@example.com")).toBe("da••••@example.com");
    expect(maskEmail("invalid-address")).toBe("your email");
  });

  it("contains only the participant recap and a private deletion link", () => {
    const content = buildRecapEmail({
      participantName: "Alex",
      eventTitle: "Summer tasting",
      eventDate: "August 2, 2026",
      teas: [{
        name: "Golden Dawn",
        origin: "Yunnan",
        rating: 4,
        descriptors: ["honeyed"],
        intensity: "clear",
        personalNotes: "Soft finish",
        saved: true,
        completed: true
      }],
      deletionUrl: "https://tasting.vintagefork.ca/privacy/delete#event=e1&token=private"
    });

    expect(content.subject).toContain("Summer tasting");
    expect(content.text).toContain("Golden Dawn");
    expect(content.text).toContain("Soft finish");
    expect(content.text).toContain("Delete your tasting data");
    expect(content.html).toContain("privacy/delete#event=e1&amp;token=private");
    expect(content.html).not.toContain("Another guest");
  });

  it("escapes guest-controlled values in the HTML message", () => {
    const content = buildRecapEmail({
      participantName: "<img src=x onerror=alert(1)>",
      eventTitle: "<script>alert(1)</script>",
      eventDate: "August 2, 2026",
      teas: [{
        name: "<b>Tea</b>", origin: null, rating: null, descriptors: [], intensity: null,
        personalNotes: "<script>notes</script>", saved: false, completed: false
      }],
      deletionUrl: "https://example.com/#token=<secret>"
    });

    expect(content.html).not.toContain("<script>");
    expect(content.html).not.toContain("<img src=x");
    expect(content.html).toContain("&lt;script&gt;notes&lt;/script&gt;");
    expect(content.html).toContain("token=&lt;secret&gt;");
  });

  it("requires private SMTP credentials and a verified sender", () => {
    expect(() => getRecapMailSettings({})).toThrow(RecapEmailConfigurationError);
    expect(getRecapMailSettings({
      BREVO_SMTP_USER: "smtp-user",
      BREVO_SMTP_KEY: "smtp-key",
      RECAP_EMAIL_FROM: "recaps@example.com"
    })).toMatchObject({
      host: "smtp-relay.brevo.com",
      port: 587,
      fromEmail: "recaps@example.com"
    });
  });
});
