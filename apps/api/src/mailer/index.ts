import nodemailer from "nodemailer";
import type { Env } from "../env";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Provider interface (FR-NOT-7): everything else in the app only sees `Mailer`. */
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

interface Logger {
  info(o: unknown, m?: string): void;
  error(o: unknown, m?: string): void;
}

class SmtpMailer implements Mailer {
  private transport;
  constructor(env: Env) {
    this.transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  from = "";
  async send(mail: Mail) {
    await this.transport.sendMail({ from: this.from, ...mail });
  }
}

class ResendMailer implements Mailer {
  constructor(private apiKey: string, private from: string) {}
  async send(mail: Mail) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html }),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}`);
  }
}

/** Dev fallback when no provider credentials are configured: logs instead of sending. */
class LogMailer implements Mailer {
  constructor(private log: Logger) {}
  async send(mail: Mail) {
    this.log.info({ to: mail.to, subject: mail.subject, text: mail.text }, "email (not sent: no provider configured)");
  }
}

/** Wraps a provider with logging and retry with exponential backoff. */
export class ReliableMailer implements Mailer {
  constructor(
    private inner: Mailer,
    private log: Logger,
    private attempts = 3,
    private baseDelayMs = 500,
  ) {}

  async send(mail: Mail) {
    for (let i = 1; ; i++) {
      try {
        await this.inner.send(mail);
        this.log.info({ to: mail.to, subject: mail.subject }, "email sent");
        return;
      } catch (err) {
        if (i >= this.attempts) {
          this.log.error({ err, to: mail.to, subject: mail.subject }, "email failed permanently");
          throw err;
        }
        await new Promise((r) => setTimeout(r, this.baseDelayMs * 2 ** (i - 1)));
      }
    }
  }
}

export function createMailer(env: Env, log: Logger): Mailer {
  const from = env.EMAIL_FROM ?? env.SMTP_USER ?? "";
  if (env.EMAIL_PROVIDER === "resend" && env.RESEND_API_KEY && from) {
    return new ReliableMailer(new ResendMailer(env.RESEND_API_KEY, from), log);
  }
  if (env.EMAIL_PROVIDER === "smtp" && env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    const smtp = new SmtpMailer(env);
    smtp.from = from;
    return new ReliableMailer(smtp, log);
  }
  return new LogMailer(log);
}

/** Test double that records mail. */
export class MemoryMailer implements Mailer {
  sent: Mail[] = [];
  async send(mail: Mail) {
    this.sent.push(mail);
  }
  last(to?: string): Mail | undefined {
    return [...this.sent].reverse().find((m) => !to || m.to === to);
  }
}
