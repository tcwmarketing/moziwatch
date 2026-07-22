import { createHash } from "node:crypto";

function normalizedTemplate(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/https?:\/\/\S+|www\.\S+/g, " url ")
    .replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g, " email ")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, " phone ")
    .replace(/\b\d+\b/g, " number ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function contactContentFingerprint(value: string) {
  const tokens = normalizedTemplate(value)
    .split(" ")
    .filter((token) => token.length > 2);
  if (tokens.length < 12) return null;
  const features = [
    ...tokens,
    ...tokens
      .slice(0, -1)
      .map((token, index) => `${token}_${tokens[index + 1]}`),
  ];
  const weights = new Array<number>(64).fill(0);
  for (const feature of features) {
    const hash = createHash("sha256").update(feature).digest();
    for (let bit = 0; bit < 64; bit += 1) {
      const enabled = (hash[Math.floor(bit / 8)] & (1 << (bit % 8))) !== 0;
      weights[bit] += enabled ? 1 : -1;
    }
  }
  let low = 0;
  let high = 0;
  for (let bit = 0; bit < 64; bit += 1) {
    if (weights[bit] < 0) continue;
    if (bit < 32) low = (low | (1 << bit)) >>> 0;
    else high = (high | (1 << (bit - 32))) >>> 0;
  }
  return `${high.toString(16).padStart(8, "0")}${low
    .toString(16)
    .padStart(8, "0")}`;
}

export function fingerprintDistance(left: string, right: string) {
  if (!/^[0-9a-f]{16}$/i.test(left) || !/^[0-9a-f]{16}$/i.test(right))
    return Number.POSITIVE_INFINITY;
  const popcount = (value: number) => {
    let remaining = value >>> 0;
    let count = 0;
    while (remaining) {
      remaining = (remaining & (remaining - 1)) >>> 0;
      count += 1;
    }
    return count;
  };
  return (
    popcount(parseInt(left.slice(0, 8), 16) ^ parseInt(right.slice(0, 8), 16)) +
    popcount(parseInt(left.slice(8), 16) ^ parseInt(right.slice(8), 16))
  );
}
