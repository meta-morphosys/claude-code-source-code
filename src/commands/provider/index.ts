import type { Command } from "../../commands.js";
import { shouldInferenceConfigCommandBeImmediate } from "../../utils/immediateCommand.js";
import { getAPIProvider } from "../../utils/model/providers.js";
import {
  getAPIProviderLabel,
  getCurrentSelectableProvider,
  isSelectableAPIProvider,
} from "../../utils/providerSelection.js";

export default {
  type: "local-jsx",
  name: "provider",
  get description() {
    const runtimeProvider = getAPIProvider();
    const displayProvider = isSelectableAPIProvider(runtimeProvider)
      ? getCurrentSelectableProvider()
      : runtimeProvider;
    return `Manage AI providers and credentials (currently ${getAPIProviderLabel(
      displayProvider,
    )})`;
  },
  argumentHint: "[provider]",
  get immediate() {
    return shouldInferenceConfigCommandBeImmediate();
  },
  load: () => import("./provider.js"),
} satisfies Command;
