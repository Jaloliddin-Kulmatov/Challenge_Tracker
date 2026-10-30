import "server-only";

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}
export type Mailer = (email: Email) => Promise<void>;

/** Email is sent through Resend's HTTP API (works from serverless; no SMTP). */
export const emailConfigured = (env: Record<string, string | undefined> = process.env) => Boolean(env.RESEND_API_KEY?.trim());

export const sendEmail: Mailer = async (email) => {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw new Error("Email isn't configured (RESEND_API_KEY is not set).");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM?.trim() || "Challenge Tracker <onboarding@resend.dev>",
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  });
  if (!res.ok) {
    // Never include the key; the provider's message is useful ("domain not verified", "can only send to your own address"…)
    const detail = await res.text().catch(() => "");
    throw new Error(`Email provider answered ${res.status}: ${detail.slice(0, 300)}`);
  }
};
