import { describe, expect, it } from "vitest";
import {
  duplicateIdentityMatches,
  isWithinDuplicateWindow,
  type ReporterIdentity,
} from "@/lib/report-policy";

const base: ReporterIdentity = {
  accountId: "account-a",
  anonymousTokenHash: "token-a",
  ipHash: "ip-a",
};
describe("duplicate policy", () => {
  it("matches the same account", () =>
    expect(
      duplicateIdentityMatches(base, {
        accountId: "account-a",
        anonymousTokenHash: "token-b",
        ipHash: "ip-b",
      }),
    ).toBe(true));
  it("matches the same anonymous token", () =>
    expect(
      duplicateIdentityMatches(base, {
        accountId: null,
        anonymousTokenHash: "token-a",
        ipHash: "ip-b",
      }),
    ).toBe(true));
  it("matches the same IP hash", () =>
    expect(
      duplicateIdentityMatches(base, {
        accountId: null,
        anonymousTokenHash: null,
        ipHash: "ip-a",
      }),
    ).toBe(true));
  it("does not match unrelated identities", () =>
    expect(
      duplicateIdentityMatches(base, {
        accountId: "b",
        anonymousTokenHash: "b",
        ipHash: "b",
      }),
    ).toBe(false));
  it("rejects before 24 hours and accepts exactly at 24 hours", () => {
    const submitted = new Date("2026-07-01T00:00:00Z");
    expect(
      isWithinDuplicateWindow(
        submitted,
        new Date(submitted.getTime() + 86400000 - 1),
      ),
    ).toBe(true);
    expect(
      isWithinDuplicateWindow(
        submitted,
        new Date(submitted.getTime() + 86400000),
      ),
    ).toBe(false);
  });
});
