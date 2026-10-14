import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Env } from "./env";
import { HttpError } from "./lib/errors";

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

/** Used when R2 isn't configured: weigh-ins still work, photos report as unavailable. */
class DisabledStorage implements PhotoStorage {
  async createUploadUrl(): Promise<string> {
    throw new HttpError(503, "PHOTOS_UNAVAILABLE", "Photo upload isn't available right now");
  }
  async createReadUrl(): Promise<string> {
    throw new HttpError(503, "PHOTOS_UNAVAILABLE", "Photos aren't available right now");
  }
  async remove() {}
}

export function createStorage(env: Env): PhotoStorage {
  if (env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET) {
    return new R2Storage(env.R2_ACCOUNT_ID, env.R2_ACCESS_KEY_ID, env.R2_SECRET_ACCESS_KEY, env.R2_BUCKET);
  }
  return new DisabledStorage();
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
