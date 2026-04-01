/**
 * Apply session environment from raw CLI argv before `init()` / settings load.
 * Ensures flags like `--api-provider` affect `getAPIProvider()` during bootstrap.
 */

/** Mutates `process.env`. Idempotent per process; safe to call once per launch. */
export function applySessionEnvFromCliArgv(argv: string[]): void {
  if (argv.includes('--no-web-search')) {
    process.env.CLAUDE_CODE_DISABLE_WEB_SEARCH = '1'
  }

  const apEq = argv.find(a => a.startsWith('--api-provider='))
  if (apEq !== undefined) {
    const v = apEq.slice('--api-provider='.length).trim().toLowerCase()
    if (v === 'openrouter') {
      process.env.CLAUDE_CODE_USE_OPENROUTER = '1'
    } else if (v === 'anthropic') {
      delete process.env.CLAUDE_CODE_USE_OPENROUTER
    }
    return
  }

  const apIdx = argv.indexOf('--api-provider')
  if (apIdx !== -1) {
    const v = argv[apIdx + 1]?.trim().toLowerCase()
    if (v === 'openrouter') {
      process.env.CLAUDE_CODE_USE_OPENROUTER = '1'
    } else if (v === 'anthropic') {
      delete process.env.CLAUDE_CODE_USE_OPENROUTER
    }
  }
}
