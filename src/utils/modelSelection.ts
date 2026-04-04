import {
  type SelectableAPIProvider,
  activateProvider,
  getCurrentSelectableProvider,
} from "./providerSelection.js";
import { isProviderConnected } from "./providerSelection.js";
import { getGlobalConfig } from "./config.js";
import { CANONICAL_MODEL_IDS } from "./model/configs.js";

export function getSyntheticProviderForModelSelection(
  model: string | null,
): SelectableAPIProvider | undefined {
  if (!model) return undefined;
  if (
    (CANONICAL_MODEL_IDS as readonly string[]).includes(model) &&
    isProviderConnected("firstParty")
  ) {
    return "firstParty";
  }
  return undefined;
}

export function getProviderForModelSelection(
  model: string | null,
): SelectableAPIProvider | undefined {
  if (!model) return undefined;

  const additional = getGlobalConfig().additionalModelOptionsCache ?? [];
  const match = additional.find((option) => option.value === model);
  return match?.provider ?? getSyntheticProviderForModelSelection(model);
}

export async function activateProviderForSelectedModel(
  model: string | null,
): Promise<SelectableAPIProvider | undefined> {
  const provider = getProviderForModelSelection(model);
  if (!provider) return undefined;
  if (provider === getCurrentSelectableProvider()) {
    return provider;
  }
  await activateProvider(provider);
  return provider;
}
