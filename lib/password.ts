import { hash, verify } from "@node-rs/argon2";

export function hashPassword(password: string) {
  return hash(password, {
    algorithm: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export function verifyPassword(digest: string, password: string) {
  return verify(digest, password);
}
