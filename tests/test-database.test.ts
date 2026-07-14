import { afterEach, describe, expect, it } from "vitest";
import { assertDisposableTestDatabase } from "@/lib/test-database";

const original = {
  database: process.env.DATABASE_URL,
  direct: process.env.DIRECT_DATABASE_URL,
  test: process.env.TEST_DATABASE_URL,
  disposable: process.env.TEST_DATABASE_DISPOSABLE,
};

afterEach(() => {
  for (const [name, value] of Object.entries({
    DATABASE_URL: original.database,
    DIRECT_DATABASE_URL: original.direct,
    TEST_DATABASE_URL: original.test,
    TEST_DATABASE_DISPOSABLE: original.disposable,
  })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("test database safety gate", () => {
  it("rejects a test URL that matches the production runtime URL", () => {
    process.env.DATABASE_URL = "postgresql://user:pass@production.example/db";
    process.env.TEST_DATABASE_URL = process.env.DATABASE_URL;
    process.env.TEST_DATABASE_DISPOSABLE = "true";
    expect(() => assertDisposableTestDatabase()).toThrow(/must never equal/);
  });

  it("requires an explicit disposable acknowledgement", () => {
    process.env.DATABASE_URL = "postgresql://user:pass@production.example/db";
    process.env.TEST_DATABASE_URL = "postgresql://user:pass@test.example/db";
    process.env.TEST_DATABASE_DISPOSABLE = "false";
    expect(() => assertDisposableTestDatabase()).toThrow(
      /TEST_DATABASE_DISPOSABLE=true/,
    );
  });
});
