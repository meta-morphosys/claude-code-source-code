#!/usr/bin/env bun
/**
 * Global launcher for this repo: run from any cwd with `obsidian-local` after
 * `npm link`, `bun link`, or `npm install -g` from the repo root.
 *
 * Forwards all CLI args to src/entrypoints/cli.tsx using Bun.
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cli = join(root, 'src', 'entrypoints', 'cli.tsx')
const args = process.argv.slice(2)

/** Prefer Bun (same as `bun run cli`); npm's Windows shim may invoke Node. */
const bunExec =
  typeof process.versions.bun === 'string' ? process.execPath : 'bun'

const turboEnv = {
  ...process.env,
  CLAUDE_CODE_STREAMING_TOOL_EXECUTION: '1',
  CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY:
    process.env.CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY || '25',
}

const r = spawnSync(bunExec, [cli, ...args], {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: turboEnv,
  shell: false,
})

if (r.error) {
  console.error(
    r.error.message +
      '\nInstall Bun (https://bun.sh) and ensure `bun` is on PATH, or run from repo: bun src/entrypoints/cli.tsx',
  )
  process.exit(1)
}
process.exit(r.status ?? 1)
