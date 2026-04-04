import { saveGlobalConfig } from './config.js'
import type { SelectableAPIProvider } from './providerSelection.js'
import type { ModelOption } from './model/modelOptions.js'

export function replaceProviderModelOptions(
  provider: SelectableAPIProvider,
  options: ModelOption[],
): void {
  saveGlobalConfig(current => ({
    ...current,
    additionalModelOptionsCache: [
      ...(current.additionalModelOptionsCache ?? []).filter(
        option => option.provider !== provider,
      ),
      ...options,
    ],
  }))
}

export function removeProviderModelOptions(
  provider: SelectableAPIProvider,
): void {
  saveGlobalConfig(current => ({
    ...current,
    additionalModelOptionsCache: (current.additionalModelOptionsCache ?? []).filter(
      option => option.provider !== provider,
    ),
  }))
}

