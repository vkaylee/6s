import { stat } from "node:fs/promises";
import { join, relative } from "node:path";

export interface DebouncedRunner {
  changed(): void;
  flush(): Promise<void>;
}

export function createDebouncedRunner(run: () => Promise<void>, delayMs = 500): DebouncedRunner {
  let timer: Timer | undefined;
  let running = false;
  let pending = false;

  const drain = async () => {
    if (running || !pending) return;
    pending = false;
    running = true;
    try {
      await run();
    } finally {
      running = false;
      if (pending) void drain();
    }
  };

  return {
    changed() {
      pending = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void drain(), delayMs);
    },
    async flush() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      await drain();
    },
  };
}

const root = join(import.meta.dir, "..");
const web = join(root, "web");
const patterns = [
  "src/**/*",
  "public/**/*",
  "index.html",
  "vite.config.ts",
  "tsconfig*.json",
  "package.json",
  "bun.lock",
];
const globs = patterns.map((pattern) => new Bun.Glob(pattern));

async function snapshot() {
  const entries: string[] = [];
  for (const glob of globs) {
    for await (const path of glob.scan({ cwd: web, absolute: true, onlyFiles: true })) {
      try {
        const info = await stat(path);
        entries.push(`${relative(web, path)}:${info.size}:${info.mtimeMs}`);
      } catch {
        // Files may disappear during an edit; the next snapshot will settle.
      }
    }
  }
  return [...new Set(entries)].sort().join("\n");
}

async function build() {
  const proc = Bun.spawn([join(root, "scripts/build-web.sh")], {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) console.error(`[dev-web] build failed (${exitCode}); keeping current dist`);
}

if (import.meta.main) {
  const runner = createDebouncedRunner(build);
  let previous = await snapshot();
  while (true) {
    await Bun.sleep(250);
    const current = await snapshot();
    if (current !== previous) {
      previous = current;
      runner.changed();
    }
  }
}
