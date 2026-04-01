import { getAppVersion } from '../utils/appVersion.js'
import type { Command, LocalCommandCall } from '../types/command.js'

const call: LocalCommandCall = async () => {
  return {
    type: 'text',
    value:
      typeof MACRO !== 'undefined' && MACRO.BUILD_TIME
        ? `${getAppVersion()} (built ${MACRO.BUILD_TIME})`
        : getAppVersion(),
  }
}

const version = {
  type: 'local',
  name: 'version',
  description:
    'Print the version this session is running (not what autoupdate downloaded)',
  isEnabled: () => process.env.USER_TYPE === 'ant',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default version
