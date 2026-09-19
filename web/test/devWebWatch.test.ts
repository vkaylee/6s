import { describe, expect, it } from "bun:test";
import { createDebouncedRunner } from "../../scripts/dev-web-watch.ts";

describe("createDebouncedRunner", () => {
  it("coalesces changes before a flush", async () => {
    let runs = 0;
    const runner = createDebouncedRunner(async () => {
      runs += 1;
    });

    runner.changed();
    runner.changed();
    runner.changed();
    await runner.flush();

    expect(runs).toBe(1);
  });

  it("queues a change that arrives while a build is running", async () => {
    let release!: () => void;
    const firstBuild = new Promise<void>((resolve) => {
      release = resolve;
    });
    let runs = 0;
    const runner = createDebouncedRunner(async () => {
      runs += 1;
      if (runs === 1) await firstBuild;
    });

    runner.changed();
    const firstFlush = runner.flush();
    runner.changed();
    release();
    await firstFlush;
    await runner.flush();

    expect(runs).toBe(2);
  });

  it("continues after a failed build", async () => {
    let runs = 0;
    const runner = createDebouncedRunner(async () => {
      runs += 1;
      if (runs === 1) throw new Error("build failed");
    });

    runner.changed();
    await expect(runner.flush()).rejects.toThrow("build failed");
    runner.changed();
    await runner.flush();

    expect(runs).toBe(2);
  });
});
