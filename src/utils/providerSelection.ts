import { fetchBootstrapData } from "../services/api/bootstrap.js";
import {
  getCopilotEnterpriseUrl,
  getCopilotToken,
} from "../services/copilot/provider.js";
import { getSavedOpenRouterApiKey } from "../services/openrouter/provider.js";
import {
  getAnthropicApiKeyWithSource,
  getAuthTokenSource,
  getOauthAccountInfo,
  getOpenRouterApiKeyWithSource,
  getSubscriptionType,
} from "./auth.js";
import { getGlobalConfig, saveGlobalConfig } from "./config.js";
import { logForDebugging } from "./debug.js";
import { isRunningOnHomespace } from "./envUtils.js";
import { getAPIProvider, type APIProvider } from "./model/providers.js";
import { refreshModelCapabilities } from "./model/modelCapabilities.js";
import { reloadModelStringsForCurrentProvider } from "./model/modelStrings.js";

export type SelectableAPIProvider = Extract<
  APIProvider,
  "firstParty" | "openrouter" | "copilot"
>;

export const SELECTABLE_API_PROVIDERS: SelectableAPIProvider[] = [
  "firstParty",
  "openrouter",
  "copilot",
];

export type ProviderConnectionInfo = {
  provider: SelectableAPIProvider;
  label: string;
  connected: boolean;
  badge: string;
  description: string;
  authLabel?: string;
  detailLines: string[];
  cachedModelCount: number;
};

export function isSelectableAPIProvider(
  provider: APIProvider,
): provider is SelectableAPIProvider {
  return (
    provider === "firstParty" ||
    provider === "openrouter" ||
    provider === "copilot"
  );
}

export function getAPIProviderLabel(provider: APIProvider): string {
  switch (provider) {
    case "firstParty":
      return "Anthropic";
    case "openrouter":
      return "OpenRouter";
    case "copilot":
      return "GitHub Copilot";
    case "bedrock":
      return "AWS Bedrock";
    case "vertex":
      return "Google Vertex AI";
    case "foundry":
      return "Microsoft Foundry";
  }
}

export function toSelectableAPIProvider(
  value: string,
): SelectableAPIProvider | undefined {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "anthropic" ||
    normalized === "default" ||
    normalized === "firstparty"
  ) {
    return "firstParty";
  }
  if (normalized === "openrouter") {
    return "openrouter";
  }
  if (normalized === "copilot" || normalized === "github-copilot") {
    return "copilot";
  }
  return undefined;
}

export function getCLIProviderName(provider: SelectableAPIProvider): string {
  return provider === "firstParty" ? "anthropic" : provider;
}

export function getProviderOnboardingHint(
  provider: SelectableAPIProvider,
): string | undefined {
  if (provider === "openrouter") {
    const { key } = getOpenRouterApiKeyWithSource();
    if (!key) {
      return "Authenticate first with `claude auth openrouter set`.";
    }
    return undefined;
  }

  if (provider === "copilot") {
    if (!getCopilotToken()) {
      return "Authenticate first with `claude auth copilot login`.";
    }
    const enterpriseUrl = getCopilotEnterpriseUrl();
    if (enterpriseUrl) {
      return `Using enterprise endpoint ${enterpriseUrl}.`;
    }
    return "Authenticated with GitHub Copilot.";
  }

  return undefined;
}

function patchProviderEnv(
  env: Record<string, string>,
  provider: SelectableAPIProvider,
): Record<string, string> {
  const next = { ...env };
  delete next.CLAUDE_CODE_USE_OPENROUTER;
  delete next.CLAUDE_CODE_USE_COPILOT;

  if (provider === "openrouter") {
    next.CLAUDE_CODE_USE_OPENROUTER = "1";
  }

  if (provider === "copilot") {
    next.CLAUDE_CODE_USE_COPILOT = "1";
  }

  return next;
}

export function applyProviderEnvToProcess(
  provider: SelectableAPIProvider,
): void {
  delete process.env.CLAUDE_CODE_USE_OPENROUTER;
  delete process.env.CLAUDE_CODE_USE_COPILOT;

  if (provider === "openrouter") {
    process.env.CLAUDE_CODE_USE_OPENROUTER = "1";
  }

  if (provider === "copilot") {
    process.env.CLAUDE_CODE_USE_COPILOT = "1";
  }
}

export async function activateProvider(
  provider: SelectableAPIProvider,
): Promise<void> {
  saveGlobalConfig((current) => ({
    ...current,
    env: patchProviderEnv(current.env, provider),
  }));

  applyProviderEnvToProcess(provider);
  try {
    await reloadModelStringsForCurrentProvider();
  } catch (error) {
    logForDebugging(
      `[provider] model string refresh failed after provider switch: ${
        error instanceof Error ? error.message : "unknown"
      }`,
    );
  }

  try {
    await fetchBootstrapData();
  } catch (error) {
    logForDebugging(
      `[provider] bootstrap refresh failed after provider switch: ${
        error instanceof Error ? error.message : "unknown"
      }`,
    );
  }

  void refreshModelCapabilities();
}

export function isProviderConnected(provider: SelectableAPIProvider): boolean {
  return getProviderConnectionInfo(provider).connected;
}

export function getFallbackSelectableProvider(): SelectableAPIProvider {
  return (
    SELECTABLE_API_PROVIDERS.find((provider) =>
      isProviderConnected(provider),
    ) ?? "firstParty"
  );
}

export function getCurrentSelectableProvider(): SelectableAPIProvider {
  const provider = getAPIProvider();
  if (isSelectableAPIProvider(provider) && isProviderConnected(provider)) {
    return provider;
  }
  return getFallbackSelectableProvider();
}

export function getProviderSelectionDescription(
  provider: SelectableAPIProvider,
): string {
  if (provider === "firstParty") {
    return "Direct Anthropic API, Claude subscription, or Anthropic API key";
  }

  if (provider === "openrouter") {
    const key = getSavedOpenRouterApiKey();
    return key
      ? "Access all supported models from one provider"
      : "Use OpenRouter account or API key";
  }

  const enterpriseUrl = getCopilotEnterpriseUrl();
  if (getCopilotToken()) {
    return enterpriseUrl
      ? `Connected via GitHub Copilot Enterprise (${enterpriseUrl})`
      : "Connected via GitHub Copilot device flow";
  }

  return "Requires `claude auth copilot login`";
}

function getCachedModelCount(provider: SelectableAPIProvider): number {
  return (getGlobalConfig().additionalModelOptionsCache ?? []).filter(
    (option) => option.provider === provider,
  ).length;
}

function getFirstPartyConnectionInfo(): ProviderConnectionInfo {
  const { source: authTokenSource, hasToken } = getAuthTokenSource();
  let apiKeySource:
    | ReturnType<typeof getAnthropicApiKeyWithSource>["source"]
    | "none" = "none";
  try {
    apiKeySource = getAnthropicApiKeyWithSource().source;
  } catch {
    apiKeySource = "none";
  }
  const hasApiKeyEnvVar =
    !!process.env.ANTHROPIC_API_KEY && !isRunningOnHomespace();
  const connected = hasToken || apiKeySource !== "none" || hasApiKeyEnvVar;
  let org: string | undefined;
  let subscriptionType: ReturnType<typeof getSubscriptionType> | undefined;
  try {
    org = getOauthAccountInfo()?.organizationName;
  } catch {
    org = undefined;
  }
  try {
    subscriptionType = getSubscriptionType();
  } catch {
    subscriptionType = undefined;
  }

  const authLabel = connected
    ? authTokenSource !== "none"
      ? authTokenSource
      : apiKeySource !== "none"
        ? apiKeySource
        : hasApiKeyEnvVar
          ? "ANTHROPIC_API_KEY"
          : undefined
    : undefined;

  const detailLines = [
    connected ? "Connected" : "Not connected",
    ...(authLabel ? [`Auth: ${authLabel}`] : []),
    ...(subscriptionType ? [`Plan: ${subscriptionType}`] : []),
    ...(org ? [`Organization: ${org}`] : []),
  ];

  return {
    provider: "firstParty",
    label: getAPIProviderLabel("firstParty"),
    connected,
    badge: connected ? "Connected" : "Setup needed",
    description: connected
      ? "Direct Anthropic access is available"
      : "Run `/login` or configure `ANTHROPIC_API_KEY`",
    authLabel,
    detailLines,
    cachedModelCount: 0,
  };
}

function getOpenRouterConnectionInfo(): ProviderConnectionInfo {
  const key = getSavedOpenRouterApiKey();
  const source = key ? "OPENROUTER_API_KEY" : undefined;
  const cachedModelCount = getCachedModelCount("openrouter");
  return {
    provider: "openrouter",
    label: getAPIProviderLabel("openrouter"),
    connected: !!key,
    badge: key ? "Connected" : "Setup needed",
    description: key
      ? "Access all supported models from one provider"
      : "Run `claude auth openrouter set`",
    authLabel: key ? source : undefined,
    detailLines: [
      key ? "Connected" : "Not connected",
      ...(key ? [`Auth: ${source}`] : []),
      ...(cachedModelCount > 0 ? [`Cached models: ${cachedModelCount}`] : []),
    ],
    cachedModelCount,
  };
}

function getCopilotConnectionInfo(): ProviderConnectionInfo {
  const token = getCopilotToken();
  const enterpriseUrl = getCopilotEnterpriseUrl();
  const cachedModelCount = getCachedModelCount("copilot");
  return {
    provider: "copilot",
    label: getAPIProviderLabel("copilot"),
    connected: !!token,
    badge: token ? "Connected" : "Setup needed",
    description: token
      ? enterpriseUrl
        ? `Connected to GitHub Copilot Enterprise (${enterpriseUrl})`
        : "Connected to GitHub Copilot device flow"
      : "Run `claude auth copilot login`",
    authLabel: token ? "device_flow" : undefined,
    detailLines: [
      token ? "Connected" : "Not connected",
      ...(token ? ["Auth: device flow"] : []),
      ...(enterpriseUrl ? [`Enterprise: ${enterpriseUrl}`] : []),
      ...(cachedModelCount > 0 ? [`Cached models: ${cachedModelCount}`] : []),
    ],
    cachedModelCount,
  };
}

export function getProviderConnectionInfo(
  provider: SelectableAPIProvider,
): ProviderConnectionInfo {
  switch (provider) {
    case "firstParty":
      return getFirstPartyConnectionInfo();
    case "openrouter":
      return getOpenRouterConnectionInfo();
    case "copilot":
      return getCopilotConnectionInfo();
  }
}

export function listProviderConnectionInfo(): ProviderConnectionInfo[] {
  return SELECTABLE_API_PROVIDERS.map(getProviderConnectionInfo);
}

export function getProviderSelectionValue(
  provider: SelectableAPIProvider,
): string {
  return getCLIProviderName(provider);
}

export function getSavedProviderSelectionValue(): string {
  return getProviderSelectionValue(getCurrentSelectableProvider());
}
