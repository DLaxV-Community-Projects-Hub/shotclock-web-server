import { argon2, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

// Runs in the libuv thread pool, so it never blocks the event loop (and with it the room timers)
const argon2Async = promisify(argon2);

// Argon2id parameters as recommended by OWASP (19 MiB, 2 passes, 1 lane)
const MEMORY_KIB: number = 19456;
const PASSES: number = 2;
const PARALLELISM: number = 1;
const TAG_LENGTH: number = 32;
const SALT_LENGTH: number = 16;

export interface PinHash {
  salt: Buffer;
  hash: Buffer;
}

async function derive(pin: string, salt: Buffer): Promise<Buffer> {
  return argon2Async("argon2id", {
    message: pin,
    nonce: salt,
    memory: MEMORY_KIB,
    passes: PASSES,
    parallelism: PARALLELISM,
    tagLength: TAG_LENGTH,
  });
}

export async function hashPin(pin: string): Promise<PinHash> {
  const salt: Buffer = randomBytes(SALT_LENGTH);
  return { salt, hash: await derive(pin, salt) };
}

export async function verifyPin(
  pin: string,
  expected: PinHash
): Promise<boolean> {
  return timingSafeEqual(await derive(pin, expected.salt), expected.hash);
}
