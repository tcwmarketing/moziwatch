import { createHmac, randomBytes } from "node:crypto";

export const ANONYMOUS_TOKEN_COOKIE = "camp_signal_reporter";

export function hmacIdentifier(
  value: string,
  secret = process.env.IP_HASH_SECRET || "",
) {
  if (secret.length < 32)
    throw new Error("IP_HASH_SECRET must contain at least 32 characters");
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function newAnonymousToken() {
  return randomBytes(32).toString("base64url");
}

export function normalizeIp(value: string) {
  const unwrapped = value
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (unwrapped.startsWith("::ffff:")) return unwrapped.slice(7);
  return unwrapped.split("%")[0];
}

export function clientIpFromHeaders(headers: Headers) {
  const direct = headers.get("x-real-ip") || "0.0.0.0";
  const trustedHops = Math.max(
    0,
    Math.min(5, Number(process.env.TRUST_PROXY_HOPS || 0)),
  );
  if (trustedHops === 0) return normalizeIp(direct);
  const chain = (headers.get("x-forwarded-for") || "")
    .split(",")
    .map(normalizeIp)
    .filter(Boolean);
  return chain.at(-(trustedHops + 1)) || normalizeIp(direct);
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}
