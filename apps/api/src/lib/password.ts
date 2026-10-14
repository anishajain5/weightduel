import argon2 from "argon2";

const options = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string) => argon2.hash(password, options);

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | undefined;
/** Burn equivalent CPU time when the account doesn't exist, so timing doesn't reveal it. */
export async function fakeVerify(password: string): Promise<void> {
  dummy ??= hashPassword("not-a-real-password");
  await verifyPassword(await dummy, password);
}
