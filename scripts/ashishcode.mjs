#!/usr/bin/env bun
/**
 * Public launcher for this repo: run from any cwd with `ashishcode` after
 * `npm install -g ashishcode`, `npm link`, or `bun link --global`.
 *
 * Forwards all CLI args to src/entrypoints/cli.tsx using Bun.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "src", "entrypoints", "cli.tsx");
const args = process.argv.slice(2);

const bunExec =
  typeof process.versions.bun === "string" ? process.execPath : "bun";

const runtimeEnv = {
  ...process.env,
  CLAUDE_CODE_STREAMING_TOOL_EXECUTION: "1",
  CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY:
    process.env.CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY || "25",
};

const result = spawnSync(bunExec, [cli, ...args], {
  stdio: "inherit",
  cwd: process.cwd(),
  env: runtimeEnv,
  shell: false,
});

if (result.error) {
  console.error(
    result.error.message +
      "\nInstall Bun (https://bun.sh) and ensure `bun` is on PATH, or run from repo: bun src/entrypoints/cli.tsx",
  );
  process.exit(1);
}

process.exit(result.status ?? 1);
