import { describe, expect, it, vi } from "vitest";
import {
  maintenanceBatchOptions,
  runMaintenanceBatches,
} from "@/worker/maintenance-batches";
import {
  DatabaseReadOnlyError,
  isDatabaseReadOnlyError,
  assertDatabaseWritable,
} from "@/worker/database-writable";
import type { Sql } from "postgres";

describe("paced storage maintenance", () => {
  it("commits bounded batches and waits between full batches", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ count: 100 })
      .mockResolvedValueOnce({ count: 100 })
      .mockResolvedValueOnce({ count: 37 });
    const wait = vi.fn().mockResolvedValue(undefined);
    expect(
      await runMaintenanceBatches(execute, { size: 100, delayMs: 1000 }, wait),
    ).toBe(237);
    expect(execute.mock.calls).toEqual([[100], [100], [100]]);
    expect(wait.mock.calls).toEqual([[1000], [1000]]);
  });
  it("does no additional work when there is nothing to remove", async () => {
    const execute = vi.fn().mockResolvedValue({ count: 0 });
    const wait = vi.fn();
    expect(
      await runMaintenanceBatches(execute, { size: 100, delayMs: 1000 }, wait),
    ).toBe(0);
    expect(execute).toHaveBeenCalledOnce();
    expect(wait).not.toHaveBeenCalled();
  });
  it("stops immediately on a failed batch", async () => {
    const execute = vi.fn().mockRejectedValue(new Error("storage failure"));
    await expect(runMaintenanceBatches(execute)).rejects.toThrow(
      "storage failure",
    );
    expect(execute).toHaveBeenCalledOnce();
  });
  it("bounds invalid or oversized configuration", () => {
    expect(
      maintenanceBatchOptions({
        FORECAST_CLEANUP_BATCH_SIZE: "99999",
        FORECAST_CLEANUP_BATCH_DELAY_MS: "invalid",
      }),
    ).toEqual({ size: 500, delayMs: 1000 });
    expect(
      maintenanceBatchOptions({
        FORECAST_CLEANUP_BATCH_SIZE: "-1",
        FORECAST_CLEANUP_BATCH_DELAY_MS: "Infinity",
      }),
    ).toEqual({ size: 100, delayMs: 1000 });
  });
});

describe("read-only database handling", () => {
  it("stops before model or weather work when the database is read-only", async () => {
    const query = vi.fn().mockResolvedValue([{ read_only: true }]);
    await expect(
      assertDatabaseWritable(query as unknown as Sql),
    ).rejects.toBeInstanceOf(DatabaseReadOnlyError);
  });
  it("allows a writable database", async () => {
    const query = vi.fn().mockResolvedValue([{ read_only: false }]);
    await expect(
      assertDatabaseWritable(query as unknown as Sql),
    ).resolves.toBeUndefined();
  });
  it("recognizes read-only errors that occur midway through publication", () => {
    expect(isDatabaseReadOnlyError({ code: "25006" })).toBe(true);
    expect(isDatabaseReadOnlyError(new Error("weather error"))).toBe(false);
  });
});
