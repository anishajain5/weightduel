import type { FastifyInstance } from "fastify";
import {
  markReadSchema, NOTIFICATION_TYPES, notificationType, prefsUpdateSchema, pushTokenSchema,
  type NotificationItem, type NotificationList, type NotificationPrefRow,
} from "@wid/shared";
import type { AppDeps } from "../app";
import { HttpError } from "../lib/errors";
import { makeAuthenticate } from "../plugins/auth";

const INBOX_TYPES = NOTIFICATION_TYPES.filter((t) => t.inbox).map((t) => t.key);
const page = (title: string, msg: string) =>
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
  `<body style="font-family:system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 16px"><h2>${title}</h2><p>${msg}</p></body>`;

export async function notificationRoutes(app: FastifyInstance, { db, env, notifier }: AppDeps) {
  const authenticate = makeAuthenticate(db, env.JWT_SECRET);

  // FR-NOT-3: multiple devices per user; a token moves to whoever registered it last.
  app.post("/push-tokens", { preHandler: authenticate }, async (req, reply) => {
    const { token, platform } = pushTokenSchema.parse(req.body);
    await db.pushToken.upsert({
      where: { expoToken: token },
      create: { userId: req.user!.id, expoToken: token, platform },
      update: { userId: req.user!.id, platform, lastSeenAt: new Date() },
    });
    return reply.code(204).send();
  });

  app.delete("/push-tokens/:token", { preHandler: authenticate }, async (req, reply) => {
    await db.pushToken.deleteMany({ where: { expoToken: decodeURIComponent((req.params as { token: string }).token), userId: req.user!.id } });
    return reply.code(204).send();
  });

  app.get("/notifications", { preHandler: authenticate }, async (req): Promise<NotificationList> => {
    const where = { userId: req.user!.id, type: { in: INBOX_TYPES } };
    const [rows, unread] = await Promise.all([
      db.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
      db.notification.count({ where: { ...where, readAt: null } }),
    ]);
    const items: NotificationItem[] = rows.map((r) => ({
      id: r.id, type: r.type, title: r.title, body: r.body, data: (r.data as { url?: string } | null) ?? null,
      read: r.readAt !== null, createdAt: r.createdAt.toISOString(),
    }));
    return { items, unread };
  });

  /** Marks the given ids (or everything, if none given) as read. */
  app.post("/notifications/read", { preHandler: authenticate }, async (req, reply) => {
    const { ids } = markReadSchema.parse(req.body ?? {});
    await db.notification.updateMany({
      where: { userId: req.user!.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    return reply.code(204).send();
  });

  app.get("/notification-prefs", { preHandler: authenticate }, async (req): Promise<{ prefs: NotificationPrefRow[] }> => {
    const rows = await db.notificationPref.findMany({ where: { userId: req.user!.id } });
    return {
      prefs: NOTIFICATION_TYPES.map((t) => {
        const r = rows.find((x) => x.type === t.key);
        return { type: t.key, push: r ? r.push : t.defaultPush, email: t.canEmail ? (r ? r.email : t.defaultEmail) : false };
      }),
    };
  });

  app.put("/notification-prefs", { preHandler: authenticate }, async (req, reply) => {
    const { prefs } = prefsUpdateSchema.parse(req.body);
    const userId = req.user!.id;
    for (const p of prefs) {
      const email = notificationType(p.type)!.canEmail ? p.email : false;
      await db.notificationPref.upsert({
        where: { userId_type: { userId, type: p.type } },
        create: { userId, type: p.type, push: p.push, email },
        update: { push: p.push, email },
      });
    }
    return reply.code(204).send();
  });

  // FR-NOT-6: one-click unsubscribe from the link in every non-account email (no login needed).
  app.get("/unsubscribe", async (req, reply) => {
    const q = req.query as { u?: string; t?: string; sig?: string };
    const def = notificationType(q.t ?? "");
    if (!def || !/^[0-9a-f-]{36}$/i.test(q.u ?? "") || !notifier.verifyUnsubscribe(q.u!, def.key, q.sig ?? "")) {
      throw new HttpError(400, "BAD_LINK", "This unsubscribe link isn't valid");
    }
    await db.notificationPref.upsert({
      where: { userId_type: { userId: q.u!, type: def.key } },
      create: { userId: q.u!, type: def.key, push: def.defaultPush, email: false },
      update: { email: false },
    });
    return reply.type("text/html").send(page("Unsubscribed", `You won't get "${def.label}" emails any more. You can change this any time in the app under Profile → Notifications.`));
  });
}
