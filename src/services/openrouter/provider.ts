import type { SelectableAPIProvider } from "../../utils/providerSelection.js";
import { getGlobalConfig, saveGlobalConfig } from "../../utils/config.js";
import {
  removeProviderModelOptions,
  replaceProviderModelOptions,
} from "../../utils/providerModelCache.js";
import { z } from "zod";

const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api";

const openRouterModelsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string().nullish(),
      description: z.string().nullish(),
      context_length: z.number().nullish(),
      pricing: z
        .object({
          prompt: z.string().nullish(),
          completion: z.string().nullish(),
        })
        .nullish(),
      top_provider: z
        .object({
          context_length: z.number().nullish(),
        })
        .nullish(),
    }),
  ),
});

export function getOpenRouterApiBaseUrl(): string {
  return (
    process.env.OPENROUTER_BASE_URL?.replace(/\/$/, "") ||
    DEFAULT_OPENROUTER_BASE_URL
  );
}

export function getSavedOpenRouterApiKey(): string | undefined {
  const fromProcess = process.env.OPENROUTER_API_KEY?.trim();
  if (fromProcess) return fromProcess;
  const fromConfig = getGlobalConfig().env.OPENROUTER_API_KEY?.trim();
  return fromConfig || undefined;
}

export function applyOpenRouterAuthToProcess(apiKey: string): void {
  process.env.OPENROUTER_API_KEY = apiKey;
  process.env.CLAUDE_CODE_USE_OPENROUTER = "1";
  delete process.env.CLAUDE_CODE_USE_COPILOT;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export async function fetchOpenRouterModelOptions(
  apiKey = getSavedOpenRouterApiKey(),
): Promise<
  Array<{
    value: string;
    label: string;
    description: string;
    provider?: SelectableAPIProvider;
  }>
> {
  if (!apiKey) return [];

  const response = await fetch(`${getOpenRouterApiBaseUrl()}/v1/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!response.ok) {
    throw new Error(`OpenRouter model fetch failed (${response.status})`);
  }

  return parseOpenRouterModelOptions(await response.json());
}

export function parseOpenRouterModelOptions(raw: unknown): Array<{
  value: string;
  label: string;
  description: string;
  provider?: SelectableAPIProvider;
}> {
  const parsed = openRouterModelsSchema.parse(raw);
  return parsed.data.map((model) => {
    const context = model.top_provider?.context_length ?? model.context_length;
    const contextText = context
      ? `${formatNumber(context)} context`
      : "OpenRouter model";
    return {
      value: model.id,
      label: model.name ?? model.id,
      description: model.description
        ? `${contextText} · ${model.description}`
        : contextText,
      provider: "openrouter",
    };
  });
}

export async function refreshOpenRouterModelOptionsCache(): Promise<void> {
  const key = getSavedOpenRouterApiKey();
  if (!key) {
    removeProviderModelOptions("openrouter");
    return;
  }
  const options = await fetchOpenRouterModelOptions(key);
  replaceProviderModelOptions("openrouter", options);
}

export function clearOpenRouterAuth(): void {
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.CLAUDE_CODE_USE_OPENROUTER;

  saveGlobalConfig((current) => {
    const nextEnv = { ...current.env };
    delete nextEnv.OPENROUTER_API_KEY;
    delete nextEnv.CLAUDE_CODE_USE_OPENROUTER;
    return {
      ...current,
      env: nextEnv,
    };
  });

  removeProviderModelOptions("openrouter");
}
