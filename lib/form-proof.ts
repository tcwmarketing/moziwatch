import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const VERSION = "v1";

function signature(value: string) {
  const secret = process.env.IP_HASH_SECRET || "";
  if (secret.length < 32)
    throw new Error("IP_HASH_SECRET must contain at least 32 characters");
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createFormProof(purpose: string, now = new Date()) {
  const payload = [
    VERSION,
    purpose,
    Math.floor(now.getTime() / 1000),
    randomBytes(16).toString("base64url"),
  ].join(".");
  return `${payload}.${signature(payload)}`;
}

export function verifyFormProof(
  value: string | undefined,
  purpose: string,
  now = new Date(),
) {
  if (!value) return { valid: false, reason: "missing-form-proof" } as const;
  const parts = value.split(".");
  if (parts.length !== 5)
    return { valid: false, reason: "invalid-form-proof" } as const;
  const [version, tokenPurpose, issuedValue, nonce, providedSignature] = parts;
  const payload = [version, tokenPurpose, issuedValue, nonce].join(".");
  const expectedSignature = signature(payload);
  const expected = Buffer.from(expectedSignature);
  const provided = Buffer.from(providedSignature);
  if (
    version !== VERSION ||
    tokenPurpose !== purpose ||
    expected.length !== provided.length ||
    !timingSafeEqual(expected, provided)
  )
    return { valid: false, reason: "invalid-form-proof" } as const;

  const issuedAt = Number(issuedValue) * 1000;
  if (!Number.isFinite(issuedAt))
    return { valid: false, reason: "invalid-form-proof" } as const;
  const ageSeconds = (now.getTime() - issuedAt) / 1000;
  const minimumAge = Number(process.env.CONTACT_FORM_MIN_SECONDS || 3);
  const maximumAge = Number(process.env.CONTACT_FORM_MAX_SECONDS || 3600);
  if (ageSeconds < minimumAge)
    return { valid: false, reason: "form-submitted-too-quickly" } as const;
  if (ageSeconds > maximumAge)
    return { valid: false, reason: "expired-form-proof" } as const;
  return { valid: true, reason: null, ageSeconds } as const;
}
