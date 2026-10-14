import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import type { AppDeps } from "../app";
import { badRequest, conflict, forbidden, HttpError } from "../lib/errors";
import { DbStorage, MAX_PHOTO_BYTES, PHOTO_KEY_RE, sniffImage } from "../storage";

/** Endpoints behind DbStorage's signed URLs. Not registered meaningfully when R2 is in use (signatures never validate). */
export async function photoRoutes(app: FastifyInstance, { db, storage }: AppDeps) {
  if (!(storage instanceof DbStorage)) return;
  const store = storage;

  app.addContentTypeParser(["image/jpeg", "image/png", "image/webp"], { parseAs: "buffer", bodyLimit: MAX_PHOTO_BYTES }, (_req, body, done) => done(null, body));

  app.put("/photos/upload", async (req, reply) => {
    const q = req.query as { key?: string; ct?: string; exp?: string; sig?: string };
    const key = q.key ?? "";
    const ct = q.ct ?? "";
    const m = PHOTO_KEY_RE.exec(key);
    if (!m || !store.verify(["put", key, ct, q.exp ?? ""], q.sig ?? "", Number(q.exp))) throw forbidden("BAD_SIGNATURE", "This upload link is invalid or expired");
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) throw badRequest("VALIDATION", "Send the image as the request body");
    if (body.length > MAX_PHOTO_BYTES) throw new HttpError(413, "TOO_LARGE", "Photo is too large");
    const real = sniffImage(body);
    if (!real || real !== ct || req.headers["content-type"] !== ct) throw badRequest("BAD_IMAGE", "That doesn't look like a valid image");
    try {
      await db.photo.create({ data: { key, userId: m[1]!, contentType: real, size: body.length, bytes: body } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw conflict("EXISTS", "This upload link was already used");
      throw e;
    }
    return reply.code(200).send({ ok: true });
  });

  app.get("/photos/file", async (req, reply) => {
    const q = req.query as { key?: string; exp?: string; sig?: string };
    const key = q.key ?? "";
    if (!PHOTO_KEY_RE.test(key) || !store.verify(["get", key, q.exp ?? ""], q.sig ?? "", Number(q.exp))) throw forbidden("BAD_SIGNATURE", "This photo link is invalid or expired");
    const p = await db.photo.findUnique({ where: { key }, select: { bytes: true, contentType: true } });
    if (!p) throw new HttpError(404, "NOT_FOUND", "Photo not found");
    return reply
      .header("Content-Type", p.contentType)
      .header("Cache-Control", "private, max-age=300")
      .header("X-Content-Type-Options", "nosniff")
      .header("Content-Security-Policy", "default-src 'none'")
      .header("Cross-Origin-Resource-Policy", "cross-origin")
      .send(Buffer.from(p.bytes));
  });
}
