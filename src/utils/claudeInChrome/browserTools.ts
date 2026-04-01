import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

export type BrowserTool = { name: string }

let cached: readonly BrowserTool[] | undefined

/** Resolves when `@ant/claude-for-chrome-mcp` is installed (internal); else `[]`. */
export function getBrowserTools(): readonly BrowserTool[] {
  if (cached === undefined) {
    try {
      cached = require('@ant/claude-for-chrome-mcp').BROWSER_TOOLS ?? []
    } catch {
      cached = []
    }
  }
  return cached
}
