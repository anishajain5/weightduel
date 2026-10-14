import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Db } from "./db";
import type { Env } from "./env";
import { hashSecret, safeEqual } from "./lib/crypto";

export const UPLOAD_URL_TTL_SEC = 300; // pre-signed PUT: 5 min (section 10)
export const READ_URL_TTL_SEC = 600; // signed GET for display

export interface PhotoStorage {
  createUploadUrl(key: string, contentType: string): Promise<string>;
  createReadUrl(key: string): Promise<string>;
  remove(key: string): Promise<void>;
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export const photoKeyPrefix = (userId: string) => `photos/${userId}/`;
export const newPhotoKey = (userId: string, contentType: string) =>
  `${photoKeyPrefix(userId)}${randomUUID()}.${EXT[contentType] ?? "jpg"}`;

class R2Storage implements PhotoStorage {
  private s3: S3Client;
  constructor(accountId: string, accessKeyId: string, secretAccessKey: string, private bucket: string) {
    this.s3 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  createUploadUrl(key: string, contentType: string) {
    return getSignedUrl(this.s3, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }), {
      expiresIn: UPLOAD_URL_TTL_SEC,
    });
  }
  createReadUrl(key: string) {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: READ_URL_TTL_SEC });
  }
  async remove(key: string) {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export const MAX_PHOTO_BYTES = 450_000; // client compresses to ~100-250 KB; this is the hard server cap
export const PHOTO_KEY_RE = /^photos\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

/** Magic-byte check so a client can't store arbitrary bytes under an image content type. */
export function sniffImage(b: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 12 && b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}

/**
 * Stores photos in the database (the `photos` table). "Pre-signed" URLs point back at this API and carry an
 * HMAC signature and expiry, so uploads and <Image> loads work without an Authorization header.
 */
export class DbStorage implements PhotoStorage {
  constructor(private db: Db, private secret: string, private baseUrl: string) {}

  sign(parts: (string | number)[]): string {
    return hashSecret(`photo|${parts.join("|")}`, this.secret);
  }
  verify(parts: (string | number)[], sig: string, exp: number): boolean {
    return Number.isFinite(exp) && exp > Date.now() / 1000 && safeEqual(this.sign(parts), sig);
  }
  private url(path: string, params: Record<string, string | number>) {
    return `${this.baseUrl.replace(/\/$/, "")}${path}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`;
  }
  async createUploadUrl(key: string, contentType: string) {
    const exp = Math.floor(Date.now() / 1000) + UPLOAD_URL_TTL_SEC;
    return this.url("/photos/upload", { key, ct: contentType, exp, sig: this.sign(["put", key, contentType, exp]) });
  }
  async createReadUrl(key: string) {
    const exp = Math.floor(Date.now() / 1000) + READ_URL_TTL_SEC;
    return this.url("/photos/file", { key, exp, sig: this.sign(["get", key, exp]) });
  }
  async remove(key: string) {
    await this.db.photo.deleteMany({ where: { key } });
  }
}

/** R2 if configured (optional, better for scale); otherwise photos live in the database. */
export function createStorage(env: Env, db: Db): PhotoStorage {
  if (env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET) {
    return new R2Storage(env.R2_ACCOUNT_ID, env.R2_ACCESS_KEY_ID, env.R2_SECRET_ACCESS_KEY, env.R2_BUCKET);
  }
  return new DbStorage(db, env.JWT_SECRET, env.APP_BASE_URL);
}

/** Test double. */
export class MemoryStorage implements PhotoStorage {
  removed: string[] = [];
  async createUploadUrl(key: string) {
    return `https://storage.test/put/${key}?sig=x`;
  }
  async createReadUrl(key: string) {
    return `https://storage.test/get/${key}?sig=x`;
  }
  async remove(key: string) {
    this.removed.push(key);
  }
}
