import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("password security", () => {
  it("stores Argon2id hashes and verifies only the matching password", async () => {
    const digest = await hashPassword("correct horse battery staple");
    expect(digest).toMatch(/^\$argon2id\$/);
    await expect(
      verifyPassword(digest, "correct horse battery staple"),
    ).resolves.toBe(true);
    await expect(verifyPassword(digest, "incorrect password")).resolves.toBe(
      false,
    );
  });
});
