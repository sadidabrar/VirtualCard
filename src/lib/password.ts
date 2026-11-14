import * as argon2 from '@node-rs/argon2';

const ARGON2_OPTS = {
  memoryCost: 19456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
};

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

let dummyHashCache: string | null = null;

/**
 * Executes a real Argon2id verification with the same cost parameters against
 * a cached dummy hash. Used to equalize response times for non-existent users
 * and eliminate timing side-channel user enumeration (SEC-06).
 */
export async function dummyVerifyPassword(password: string): Promise<void> {
  if (!dummyHashCache) {
    dummyHashCache = await hashPassword('__virtualcard_timing_dummy_password_seed__');
  }
  await verifyPassword(dummyHashCache, password);
}
