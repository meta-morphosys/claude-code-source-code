import { isEnvTruthy } from './envUtils.js'
import { getSettings_DEPRECATED } from './settings/settings.js'

/**
 * Whether the built-in Web Search tool may be offered (before provider/model checks).
 */
export function isWebSearchGloballyEnabled(): boolean {
  if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_WEB_SEARCH)) {
    return false
  }
  const settings = getSettings_DEPRECATED() || {}
  if (settings.enableWebSearch === false) {
    return false
  }
  return true
}
