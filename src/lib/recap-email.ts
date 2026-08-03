import nodemailer from "nodemailer";
import { maskEmail } from "@/lib/guest-privacy";

export { maskEmail };

export type RecapEmailTea = {
  name: string;
  origin: string | null;
  rating: number | null;
  descriptors: string[];
  intensity: string | null;
  personalNotes: string | null;
  saved: boolean;
  completed: boolean;
};

export type RecapEmailContent = {
  participantName: string;
  eventTitle: string;
  eventDate: string;
  teas: RecapEmailTea[];
  deletionUrl: string;
};

export type RecapMailSettings = {
  host: string;
  port: number;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
};

export class RecapEmailConfigurationError extends Error {
  constructor() {
    super("Recap email delivery is not configured.");
    this.name = "RecapEmailConfigurationError";
  }
}

export function getRecapMailSettings(environment: Record<string, string | undefined> = process.env): RecapMailSettings {
  const user = environment.BREVO_SMTP_USER?.trim();
  const password = environment.BREVO_SMTP_KEY?.trim();
  const fromEmail = environment.RECAP_EMAIL_FROM?.trim();
  if (!user || !password || !fromEmail) throw new RecapEmailConfigurationError();

  const parsedPort = Number(environment.BREVO_SMTP_PORT ?? "587");
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) throw new RecapEmailConfigurationError();

  return {
    host: environment.BREVO_SMTP_HOST?.trim() || "smtp-relay.brevo.com",
    port: parsedPort,
    user,
    password,
    fromEmail,
    fromName: environment.RECAP_EMAIL_FROM_NAME?.trim() || "Vintage Fork Tea Company",
    replyTo: environment.RECAP_EMAIL_REPLY_TO?.trim() || undefined
  };
}

export function buildRecapEmail(content: RecapEmailContent) {
  const teaText = content.teas.length ? content.teas.map((tea, index) => {
    const details = [
      tea.rating ? `${tea.rating}/5 stars` : null,
      tea.descriptors.length ? tea.descriptors.join(", ") : null,
      tea.intensity,
      tea.saved ? "saved to remember" : null
    ].filter(Boolean).join(" · ");
    const notes = tea.personalNotes?.trim() ? `\nYour notes: ${tea.personalNotes.trim()}` : "";
    return `${index + 1}. ${tea.name}${tea.origin ? ` — ${tea.origin}` : ""}\n${details || "No tasting response recorded."}${notes}`;
  }).join("\n\n") : "No teas were recorded for this tasting.";

  const teaHtml = content.teas.length ? content.teas.map((tea, index) => {
    const details = [
      tea.rating ? `${tea.rating}/5 stars` : null,
      tea.descriptors.length ? tea.descriptors.join(" · ") : null,
      tea.intensity,
      tea.saved ? "Saved to remember" : null
    ].filter(Boolean).map(value => escapeHtml(String(value))).join(" · ");
    const notes = tea.personalNotes?.trim()
      ? `<p style="white-space:pre-wrap"><strong>Your notes</strong><br>${escapeHtml(tea.personalNotes.trim())}</p>`
      : "";
    return `<article style="border-top:1px solid #d9cfbd;padding:18px 0"><h2 style="margin:0 0 6px;font-size:20px;color:#4b1430">${index + 1}. ${escapeHtml(tea.name)}</h2><p style="margin:0;color:#665f55">${escapeHtml(tea.origin ?? "")}</p><p>${details || "No tasting response recorded."}</p>${notes}</article>`;
  }).join("") : "<p>No teas were recorded for this tasting.</p>";

  const subject = `Your Vintage Fork recap — ${content.eventTitle}`;
  const text = `Your evening, ${content.participantName}\n${content.eventTitle} · ${content.eventDate}\n\n${teaText}\n\nDelete your tasting data:\n${content.deletionUrl}\n\nThis deletion link removes only your data from this tasting and expires after 90 days.`;
  const html = `<!doctype html><html><body style="margin:0;background:#f8f3e7;color:#2e2924;font-family:Arial,sans-serif"><main style="max-width:640px;margin:0 auto;padding:32px 20px"><p style="letter-spacing:.12em;text-transform:uppercase;color:#8c713a">Vintage Fork Tea Company</p><h1 style="font-family:Georgia,serif;color:#4b1430">Your evening, ${escapeHtml(content.participantName)}</h1><p>${escapeHtml(content.eventTitle)} · ${escapeHtml(content.eventDate)}</p>${teaHtml}<section style="margin-top:28px;padding:18px;border:1px solid #d9cfbd;border-radius:12px"><h2 style="margin-top:0;font-size:18px">Your privacy controls</h2><p>You can permanently delete your notes, ratings, answers, stamps and saved teas from this tasting.</p><p><a href="${escapeHtml(content.deletionUrl)}" style="color:#4b1430">Delete my tasting data</a></p><p style="font-size:12px;color:#665f55">This link expires after 90 days.</p></section></main></body></html>`;

  return { subject, text, html };
}

export async function sendRecapEmail({
  settings,
  recipientEmail,
  recipientName,
  content
}: {
  settings: RecapMailSettings;
  recipientEmail: string;
  recipientName: string;
  content: ReturnType<typeof buildRecapEmail>;
}) {
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.port === 465,
    requireTLS: settings.port !== 465,
    auth: { user: settings.user, pass: settings.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000
  });
  const result = await transport.sendMail({
    from: { name: settings.fromName, address: settings.fromEmail },
    to: { name: recipientName, address: recipientEmail },
    replyTo: settings.replyTo,
    subject: content.subject,
    text: content.text,
    html: content.html
  });
  return result.messageId;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character] ?? character);
}
