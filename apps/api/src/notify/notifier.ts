import { Prisma } from "@prisma/client";
import { notificationType } from "@wid/shared";
import type { Db } from "../db";
import type { Env } from "../env";
import { hashSecret } from "../lib/crypto";
import type { Mailer } from "../mailer";
import type { PushSender } from "./push";

export interface NotifyInput {
  userId: string;
  /** One of NOTIFICATION_TYPES keys. */
  type: string;
  title: string;
  body: string;
  /** In-app path to open when tapped, e.g. "/group/<id>". */
  url?: string;
  /** Same key = same notification; makes every job safe to re-run after a restart. */
  dedupeKey: string;
}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** FR-NOT-2: true when `now` falls in the user's quiet hours (the window may wrap past midnight). */
export function inQuietHours(now: Date, tz: string, start: string, end: string): boolean {
  let local: string;
  try {
    local = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  } catch {
    local = now.toISOString().slice(11, 16);
  }
  const m = toMin(local.replace("24:", "00:"));
  const s = toMin(start);
  const e = toMin(end);
  if (s === e) return false;
  return s < e ? m >= s && m < e : m >= s || m < e;
}

export class Notifier {
  constructor(private db: Db, private env: Env, private push: PushSender, private mailer: Mailer, private log: { error(o: unknown, m?: string): void } = console) {}

  unsubscribeUrl(userId: string, type: string) {
    const sig = hashSecret(`unsub|${userId}|${type}`, this.env.JWT_SECRET);
    return `${this.env.APP_BASE_URL.replace(/\/$/, "")}/unsubscribe?${new URLSearchParams({ u: userId, t: type, sig })}`;
  }
  verifyUnsubscribe(userId: string, type: string, sig: string) {
    return hashSecret(`unsub|${userId}|${type}`, this.env.JWT_SECRET) === sig;
  }

  /** Returns false when this dedupeKey was already used (nothing is sent twice). */
  async send(n: NotifyInput, now = new Date()): Promise<boolean> {
    const def = notificationType(n.type);
    if (!def) throw new Error(`unknown notification type ${n.type}`);
    const user = await this.db.user.findUnique({
      where: { id: n.userId },
      select: { email: true, deletedAt: true, timezone: true, quietStart: true, quietEnd: true, pushTokens: { select: { expoToken: true } } },
    });
    if (!user || user.deletedAt) return false;
    const pref = await this.db.notificationPref.findUnique({ where: { userId_type: { userId: n.userId, type: n.type } } });
    const wantPush = pref ? pref.push : def.defaultPush;
    const wantEmail = def.canEmail && (pref ? pref.email : def.defaultEmail);

    let row;
    try {
      row = await this.db.notification.create({
        data: { userId: n.userId, type: n.type, title: n.title, body: n.body, data: n.url ? { url: n.url } : Prisma.DbNull, dedupeKey: n.dedupeKey },
      });
    } catch (e) {
      // P2002: already sent. P2003: the user was deleted while we were working.
      if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2002" || e.code === "P2003")) return false;
      throw e;
    }

    let sentPush: Date | null = null;
    let sentEmail: Date | null = null;
    if (wantPush && user.pushTokens.length && !inQuietHours(now, user.timezone, user.quietStart, user.quietEnd)) {
      const results = await this.push.send(
        user.pushTokens.map((t) => ({ to: t.expoToken, title: n.title, body: n.body, data: { url: n.url, id: row.id } })),
      );
      if (results.some((r) => r.ok)) sentPush = new Date();
      const dead = results.filter((r) => r.invalid).map((r) => r.token);
      if (dead.length) await this.db.pushToken.deleteMany({ where: { expoToken: { in: dead } } });
    }
    if (wantEmail) {
      const link = this.unsubscribeUrl(n.userId, n.type);
      try {
        await this.mailer.send({
          to: user.email,
          subject: n.title,
          text: `${n.body}\n\n---\nStop these emails: ${link}`,
          html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px"><h2>${esc(n.title)}</h2><p>${esc(n.body)}</p><p style="color:#666;font-size:12px;margin-top:32px">Weigh-In Duel · <a href="${esc(link)}">Unsubscribe from these emails</a></p></div>`,
        });
        sentEmail = new Date();
      } catch (e) {
        this.log.error({ err: e }, "notification email failed");
      }
    }
    if (sentPush || sentEmail) {
      await this.db.notification.update({ where: { id: row.id }, data: { sentPushAt: sentPush, sentEmailAt: sentEmail } });
    }
    return true;
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
