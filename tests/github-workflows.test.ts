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
    expect(daily).toContain("npm ci --omit=dev");
    expect(daily).toContain("Publish forecast with a resumable retry");
    expect(daily).toContain("for attempt in 1 2");
  });
});
