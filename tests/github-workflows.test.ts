import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const workflowDirectory = join(process.cwd(), ".github", "workflows");
const workflows = readdirSync(workflowDirectory)
  .filter((fileName) => fileName.endsWith(".yml"))
  .map((fileName) => ({
    fileName,
    content: readFileSync(join(workflowDirectory, fileName), "utf8"),
  }));
const lockfile = JSON.parse(
  readFileSync(join(process.cwd(), "package-lock.json"), "utf8"),
) as {
  packages: Record<string, { dev?: boolean; devOptional?: boolean }>;
};

describe("GitHub Actions workflows", () => {
  it("uses current Node 24-based GitHub actions", () => {
    for (const workflow of workflows) {
      expect(workflow.content, workflow.fileName).not.toMatch(
        /actions\/checkout@v[1-6]\b/,
      );
      expect(workflow.content, workflow.fileName).not.toMatch(
        /actions\/setup-node@v[1-6]\b/,
      );
      expect(workflow.content, workflow.fileName).not.toMatch(
        /actions\/setup-python@v[1-6]\b/,
      );
      expect(workflow.content, workflow.fileName).not.toMatch(
        /actions\/cache@v[1-5]\b/,
      );
    }
  });

  it("keeps the daily forecast resumable and production-only", () => {
    const daily = workflows.find(
      (workflow) => workflow.fileName === "forecast-daily.yml",
    )?.content;

    expect(daily).toBeDefined();
    expect(daily).toContain("npm ci --omit=dev --legacy-peer-deps");
    expect(daily).toContain("Publish forecast with a resumable retry");
    expect(daily).toContain("for attempt in 1 2");
  });

  it("keeps migration tooling out of scheduled production installs", () => {
    expect(lockfile.packages["node_modules/tsx"]?.dev).not.toBe(true);
    expect(lockfile.packages["node_modules/drizzle-kit"]?.dev).toBe(true);
    expect(lockfile.packages["node_modules/@esbuild-kit/esm-loader"]?.dev).toBe(
      true,
    );
    expect(lockfile.packages["node_modules/@esbuild-kit/core-utils"]?.dev).toBe(
      true,
    );
  });
});
