import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createFormProof, verifyFormProof } from "@/lib/form-proof";

afterEach(() => vi.unstubAllEnvs());

describe("signed contact form proof", () => {
  it("accepts an authentic proof after the minimum completion time", () => {
    vi.stubEnv("IP_HASH_SECRET", "x".repeat(32));
    const issuedAt = new Date("2026-07-22T12:00:00Z");
    const proof = createFormProof("contact", issuedAt);
    expect(
      verifyFormProof(proof, "contact", new Date("2026-07-22T12:00:04Z")),
    ).toEqual(expect.objectContaining({ valid: true }));
  });

  it("rejects proofs that are too fast, expired, tampered, or for another form", () => {
    vi.stubEnv("IP_HASH_SECRET", "x".repeat(32));
    const issuedAt = new Date("2026-07-22T12:00:00Z");
    const proof = createFormProof("contact", issuedAt);
    expect(
      verifyFormProof(proof, "contact", new Date("2026-07-22T12:00:01Z")),
    ).toEqual({ valid: false, reason: "form-submitted-too-quickly" });
    expect(
      verifyFormProof(proof, "contact", new Date("2026-07-22T13:00:01Z")),
    ).toEqual({ valid: false, reason: "expired-form-proof" });
    expect(
      verifyFormProof(`${proof}x`, "contact", new Date("2026-07-22T12:00:04Z")),
    ).toEqual({ valid: false, reason: "invalid-form-proof" });
    expect(
      verifyFormProof(proof, "report", new Date("2026-07-22T12:00:04Z")),
    ).toEqual({ valid: false, reason: "invalid-form-proof" });
  });
});
