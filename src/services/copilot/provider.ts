import { openBrowser } from "../../utils/browser.js";
import {
  getGlobalConfig,
  saveGlobalConfig,
  type GlobalConfig,
} from "../../utils/config.js";
import { getUserAgent } from "../../utils/http.js";
import { logForDebugging } from "../../utils/debug.js";
import { errorMessage } from "../../utils/errors.js";
import type { SelectableAPIProvider } from "../../utils/providerSelection.js";
import {
  removeProviderModelOptions,
  replaceProviderModelOptions,
} from "../../utils/providerModelCache.js";
import { z } from "zod";

const COPILOT_CLIENT_ID = "Ov23li8tweQw6odWQebz";
const COPILOT_DEFAULT_API_URL = "https://api.githubcopilot.com";
const OAUTH_POLLING_SAFETY_MARGIN_MS = 3_000;

const copilotModelsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string().nullish(),
      model_picker_enabled: z.boolean().nullish(),
      supported_endpoints: z.array(z.string()).nullish(),
      capabilities: z
        .object({
          supports: z
            .object({
              tool_calls: z.boolean().nullish(),
              vision: z.boolean().nullish(),
            })
            .nullish(),
        })
        .nullish(),
    }),
  ),
});

type AnthropicMessageBody = {
  model: string;
  max_tokens?: number;
  stream?: boolean;
  temperature?: number;
  tools?: Array<{
    name: string;
    description?: string;
    input_schema?: unknown;
  }>;
  tool_choice?: { type?: string; name?: string };
  system?: string | Array<{ type?: string; text?: string }>;
  messages: Array<{
    role: string;
    content: string | Array<Record<string, unknown>>;
  }>;
};

type OpenAIChatResponse = {
  id?: string;
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
};

type OpenAIResponsesItem =
  | {
      type: "message";
      id?: string;
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }
  | {
      type: "function_call";
      id?: string;
      call_id?: string;
      name?: string;
      arguments?: string;
    }
  | {
      type: "reasoning";
      id?: string;
      summary?: Array<{
        type?: string;
        text?: string;
      }>;
    };

type OpenAIResponsesResponse = {
  id?: string;
  model?: string;
  output?: OpenAIResponsesItem[];
  incomplete_details?: {
    reason?: string | null;
  } | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeDomain(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const url = new URL(candidate);
    return url.host;
  } catch {
    return (
      trimmed
        .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
        .split(/[/?#]/, 1)[0]
        ?.replace(/\/$/, "") ?? ""
    );
  }
}

function getOAuthUrls(domain: string) {
  return {
    device: `https://${domain}/login/device/code`,
    access: `https://${domain}/login/oauth/access_token`,
  };
}

export function getCopilotEnterpriseUrl(): string | undefined {
  const value =
    process.env.GITHUB_COPILOT_ENTERPRISE_URL?.trim() ||
    getGlobalConfig().env.GITHUB_COPILOT_ENTERPRISE_URL?.trim();
  return value ? normalizeDomain(value) : undefined;
}

export function getCopilotToken(): string | undefined {
  const value =
    process.env.GITHUB_COPILOT_ACCESS_TOKEN?.trim() ||
    getGlobalConfig().env.GITHUB_COPILOT_ACCESS_TOKEN?.trim();
  return value || undefined;
}

export function getCopilotApiBaseUrl(): string {
  const enterpriseUrl = getCopilotEnterpriseUrl();
  if (!enterpriseUrl) return COPILOT_DEFAULT_API_URL;
  return `https://copilot-api.${enterpriseUrl}`;
}

function getDeviceFlowDomain(enterpriseUrl?: string): string {
  return enterpriseUrl ? normalizeDomain(enterpriseUrl) : "github.com";
}

function getCopilotAuthHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "User-Agent": getUserAgent(),
  };
}

function shouldUseCopilotResponsesApi(modelID: string): boolean {
  const match = /^gpt-(\d+)/.exec(modelID);
  if (!match) return false;
  return Number(match[1]) >= 5 && !modelID.startsWith("gpt-5-mini");
}

function supportsChatCompletions(
  model: z.infer<typeof copilotModelsSchema>["data"][number],
): boolean {
  if (model.capabilities?.supports?.tool_calls === false) {
    return false;
  }

  const endpoints = model.supported_endpoints;
  if (endpoints?.length) {
    return endpoints.some(
      (endpoint) =>
        endpoint.includes("chat/completions") ||
        endpoint === "chat" ||
        endpoint.includes("responses") ||
        endpoint === "responses",
    );
  }

  return true;
}

function getCopilotEnvPatch(input: {
  token: string;
  enterpriseUrl?: string;
  enableByDefault?: boolean;
}): Pick<GlobalConfig, "env"> {
  const nextEnv: Record<string, string> = {
    ...getGlobalConfig().env,
    GITHUB_COPILOT_ACCESS_TOKEN: input.token,
  };

  if (input.enterpriseUrl) {
    nextEnv.GITHUB_COPILOT_ENTERPRISE_URL = normalizeDomain(
      input.enterpriseUrl,
    );
  } else {
    delete nextEnv.GITHUB_COPILOT_ENTERPRISE_URL;
  }

  if (input.enableByDefault !== false) {
    nextEnv.CLAUDE_CODE_USE_COPILOT = "1";
    delete nextEnv.CLAUDE_CODE_USE_OPENROUTER;
  }

  return { env: nextEnv };
}

function applyCopilotEnvToProcess(input: {
  token: string;
  enterpriseUrl?: string;
  enableByDefault?: boolean;
}): void {
  process.env.GITHUB_COPILOT_ACCESS_TOKEN = input.token;

  if (input.enterpriseUrl) {
    process.env.GITHUB_COPILOT_ENTERPRISE_URL = normalizeDomain(
      input.enterpriseUrl,
    );
  } else {
    delete process.env.GITHUB_COPILOT_ENTERPRISE_URL;
  }

  if (input.enableByDefault !== false) {
    process.env.CLAUDE_CODE_USE_COPILOT = "1";
    delete process.env.CLAUDE_CODE_USE_OPENROUTER;
  }
}

function clearCopilotEnvFromProcess(): void {
  delete process.env.CLAUDE_CODE_USE_COPILOT;
  delete process.env.GITHUB_COPILOT_ACCESS_TOKEN;
  delete process.env.GITHUB_COPILOT_ENTERPRISE_URL;
}

function stripCopilotEnv(config: GlobalConfig): GlobalConfig {
  const nextEnv = { ...config.env };
  delete nextEnv.CLAUDE_CODE_USE_COPILOT;
  delete nextEnv.GITHUB_COPILOT_ACCESS_TOKEN;
  delete nextEnv.GITHUB_COPILOT_ENTERPRISE_URL;
  return {
    ...config,
    env: nextEnv,
  };
}

export async function fetchCopilotModelOptions(
  token = getCopilotToken(),
): Promise<
  Array<{
    value: string;
    label: string;
    description: string;
    disabled?: boolean;
    provider?: SelectableAPIProvider;
  }>
> {
  if (!token) return [];

  const response = await fetch(`${getCopilotApiBaseUrl()}/models`, {
    headers: getCopilotAuthHeaders(token),
  });
  if (!response.ok) {
    throw new Error(`Copilot model fetch failed (${response.status})`);
  }

  return parseCopilotModelOptions(await response.json());
}

export function parseCopilotModelOptions(raw: unknown): Array<{
  value: string;
  label: string;
  description: string;
  disabled?: boolean;
  provider?: SelectableAPIProvider;
}> {
  const parsed = copilotModelsSchema.parse(raw);
  return parsed.data
    .filter((model) => model.model_picker_enabled !== false)
    .map((model) => ({
      value: model.id,
      label: model.name ?? model.id,
      description: supportsChatCompletions(model)
        ? "GitHub Copilot model"
        : model.capabilities?.supports?.tool_calls === false
          ? "GitHub Copilot model · Tool calling unavailable, disabled in Obsidian Code"
          : "GitHub Copilot model · Unsupported endpoint shape for Obsidian Code",
      disabled: !supportsChatCompletions(model),
      provider: "copilot",
    }));
}

export async function refreshCopilotModelOptionsCache(): Promise<void> {
  const token = getCopilotToken();
  if (!token) {
    removeProviderModelOptions("copilot");
    return;
  }

  const options = await fetchCopilotModelOptions(token);
  replaceProviderModelOptions("copilot", options);
}

export async function loginWithCopilotDeviceFlow(
  input: {
    enterpriseUrl?: string;
    openBrowserOnStart?: boolean;
  } = {},
): Promise<void> {
  const enterpriseUrl = input.enterpriseUrl?.trim();
  const domain = getDeviceFlowDomain(enterpriseUrl);
  const urls = getOAuthUrls(domain);

  const deviceResponse = await fetch(urls.device, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": getUserAgent(),
    },
    body: JSON.stringify({
      client_id: COPILOT_CLIENT_ID,
      scope: "read:user",
    }),
  });

  if (!deviceResponse.ok) {
    throw new Error(
      `Failed to start GitHub Copilot device flow (${deviceResponse.status})`,
    );
  }

  const deviceData = (await deviceResponse.json()) as {
    verification_uri: string;
    user_code: string;
    device_code: string;
    interval: number;
  };

  process.stdout.write(
    `Open this URL and enter the code:\n${deviceData.verification_uri}\n`,
  );
  process.stdout.write(`Code: ${deviceData.user_code}\n`);

  if (input.openBrowserOnStart !== false) {
    void openBrowser(deviceData.verification_uri).catch(() => {});
  }

  while (true) {
    const response = await fetch(urls.access, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": getUserAgent(),
      },
      body: JSON.stringify({
        client_id: COPILOT_CLIENT_ID,
        device_code: deviceData.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    if (!response.ok) {
      throw new Error(`Copilot token exchange failed (${response.status})`);
    }

    const data = (await response.json()) as {
      access_token?: string;
      error?: string;
      interval?: number;
    };

    if (data.access_token) {
      saveGlobalConfig((current) => ({
        ...current,
        ...getCopilotEnvPatch({
          token: data.access_token,
          enterpriseUrl,
        }),
      }));
      applyCopilotEnvToProcess({
        token: data.access_token,
        enterpriseUrl,
      });
      try {
        await refreshCopilotModelOptionsCache();
      } catch (error) {
        logForDebugging(
          `[copilot] model refresh after login failed: ${errorMessage(error)}`,
        );
      }
      return;
    }

    if (data.error === "authorization_pending") {
      await sleep(deviceData.interval * 1_000 + OAUTH_POLLING_SAFETY_MARGIN_MS);
      continue;
    }

    if (data.error === "slow_down") {
      const nextInterval =
        typeof data.interval === "number" && data.interval > 0
          ? data.interval
          : deviceData.interval + 5;
      await sleep(nextInterval * 1_000 + OAUTH_POLLING_SAFETY_MARGIN_MS);
      continue;
    }

    throw new Error(data.error || "Copilot authorization failed");
  }
}

export function clearCopilotAuth(): void {
  clearCopilotEnvFromProcess();
  saveGlobalConfig((current) => stripCopilotEnv(current));
  removeProviderModelOptions("copilot");
}

function contentText(block: unknown): string {
  if (typeof block === "string") return block;
  if (!block || typeof block !== "object") return "";
  const record = block as Record<string, unknown>;
  if (record.type === "text" && typeof record.text === "string")
    return record.text;
  if (record.type === "tool_result") {
    if (typeof record.content === "string") return record.content;
    return JSON.stringify(record.content ?? "");
  }
  if (record.type === "thinking" && typeof record.thinking === "string")
    return record.thinking;
  return "";
}

function anthropicContentToOpenAIContent(
  content: string | Array<Record<string, unknown>>,
) {
  if (typeof content === "string") return content;

  const parts: Array<Record<string, unknown>> = [];
  for (const block of content) {
    if (block.type === "text" && typeof block.text === "string") {
      parts.push({
        type: "text",
        text: block.text,
      });
      continue;
    }

    if (block.type === "image") {
      const source = block.source as Record<string, unknown> | undefined;
      const mediaType =
        typeof source?.media_type === "string"
          ? source.media_type
          : "image/png";
      const data = typeof source?.data === "string" ? source.data : undefined;
      if (data) {
        parts.push({
          type: "image_url",
          image_url: {
            url: `data:${mediaType};base64,${data}`,
          },
        });
      }
      continue;
    }
  }

  if (parts.length === 0) {
    return content.map(contentText).filter(Boolean).join("\n");
  }
  return parts;
}

function anthropicSystemToOpenAI(body: AnthropicMessageBody) {
  if (!body.system) return [];
  const text =
    typeof body.system === "string"
      ? body.system
      : body.system
          .map((block) => (typeof block?.text === "string" ? block.text : ""))
          .filter(Boolean)
          .join("\n");
  if (!text) return [];
  return [{ role: "system", content: text }];
}

function anthropicMessagesToOpenAI(body: AnthropicMessageBody) {
  const result: Array<Record<string, unknown>> = [
    ...anthropicSystemToOpenAI(body),
  ];

  for (const message of body.messages) {
    if (message.role === "user") {
      if (typeof message.content === "string") {
        result.push({
          role: "user",
          content: message.content,
        });
        continue;
      }

      const toolResults = message.content.filter(
        (block) => block.type === "tool_result",
      );
      const nonToolResults = message.content.filter(
        (block) => block.type !== "tool_result",
      );

      if (nonToolResults.length > 0) {
        result.push({
          role: "user",
          content: anthropicContentToOpenAIContent(nonToolResults),
        });
      }

      for (const block of toolResults) {
        result.push({
          role: "tool",
          tool_call_id:
            typeof block.tool_use_id === "string" ? block.tool_use_id : "",
          content: contentText(block),
        });
      }
      continue;
    }

    if (message.role === "assistant") {
      if (typeof message.content === "string") {
        result.push({
          role: "assistant",
          content: message.content,
        });
        continue;
      }

      const text = message.content
        .filter((block) => block.type === "text")
        .map((block) => contentText(block))
        .join("");
      const toolCalls = message.content
        .filter((block) => block.type === "tool_use")
        .map((block) => ({
          id: typeof block.id === "string" ? block.id : undefined,
          type: "function",
          function: {
            name: typeof block.name === "string" ? block.name : "",
            arguments: JSON.stringify(block.input ?? {}),
          },
        }));

      result.push({
        role: "assistant",
        ...(text ? { content: text } : { content: null }),
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
    }
  }

  return result;
}

function mapToolChoice(toolChoice: AnthropicMessageBody["tool_choice"]) {
  if (!toolChoice) return undefined;
  if (toolChoice.type === "tool" && toolChoice.name) {
    return {
      type: "function",
      function: {
        name: toolChoice.name,
      },
    };
  }
  return "auto";
}

function mapStopReason(value: string | null | undefined): string {
  if (value === "tool_calls") return "tool_use";
  if (value === "length") return "max_tokens";
  return "end_turn";
}

function mapResponsesStopReason(input: {
  reason?: string | null;
  hasToolUse: boolean;
}): string {
  if (input.hasToolUse) return "tool_use";
  if (input.reason === "max_output_tokens") return "max_tokens";
  return "end_turn";
}

function buildOpenAIChatRequest(body: AnthropicMessageBody) {
  return {
    model: body.model,
    max_tokens: body.max_tokens,
    temperature: body.temperature,
    stream: body.stream === true,
    stream_options: body.stream === true ? { include_usage: true } : undefined,
    messages: anthropicMessagesToOpenAI(body),
    tools: body.tools?.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema ?? { type: "object", properties: {} },
      },
    })),
    tool_choice: mapToolChoice(body.tool_choice),
  };
}

function getResponsesSystemRole(model: string): "system" | "developer" {
  if (
    model.startsWith("o") ||
    model.startsWith("gpt-5") ||
    model.startsWith("codex-") ||
    model.startsWith("computer-use")
  ) {
    return "developer";
  }
  return "system";
}

function anthropicContentToResponsesUserContent(
  content: string | Array<Record<string, unknown>>,
) {
  if (typeof content === "string") {
    return [{ type: "input_text", text: content }];
  }

  const parts: Array<Record<string, unknown>> = [];
  for (const block of content) {
    if (block.type === "text" && typeof block.text === "string") {
      parts.push({
        type: "input_text",
        text: block.text,
      });
      continue;
    }

    if (block.type === "image") {
      const source = block.source as Record<string, unknown> | undefined;
      const mediaType =
        typeof source?.media_type === "string"
          ? source.media_type
          : "image/png";
      const data = typeof source?.data === "string" ? source.data : undefined;
      if (data) {
        parts.push({
          type: "input_image",
          image_url: `data:${mediaType};base64,${data}`,
        });
      }
    }
  }

  return parts;
}

function buildOpenAIResponsesRequest(body: AnthropicMessageBody) {
  const input: Array<Record<string, unknown>> = [];
  const systemText =
    typeof body.system === "string"
      ? body.system
      : body.system
          ?.map((block) => (typeof block?.text === "string" ? block.text : ""))
          .filter(Boolean)
          .join("\n");

  if (systemText) {
    input.push({
      role: getResponsesSystemRole(body.model),
      content: systemText,
    });
  }

  for (const message of body.messages) {
    if (message.role === "user") {
      if (typeof message.content === "string") {
        input.push({
          role: "user",
          content: [{ type: "input_text", text: message.content }],
        });
        continue;
      }

      const toolResults = message.content.filter(
        (block) => block.type === "tool_result",
      );
      const nonToolResults = message.content.filter(
        (block) => block.type !== "tool_result",
      );

      const userContent =
        anthropicContentToResponsesUserContent(nonToolResults);
      if (userContent.length > 0) {
        input.push({
          role: "user",
          content: userContent,
        });
      }

      for (const block of toolResults) {
        const callID =
          typeof block.tool_use_id === "string" ? block.tool_use_id : "";
        input.push({
          type: "function_call_output",
          call_id: callID,
          output: contentText(block),
        });
      }
      continue;
    }

    if (message.role === "assistant") {
      if (typeof message.content === "string") {
        input.push({
          role: "assistant",
          content: [{ type: "output_text", text: message.content }],
        });
        continue;
      }

      const text = message.content
        .filter((block) => block.type === "text")
        .map((block) => contentText(block))
        .join("");

      if (text) {
        input.push({
          role: "assistant",
          content: [{ type: "output_text", text }],
        });
      }

      for (const block of message.content.filter(
        (item) => item.type === "tool_use",
      )) {
        input.push({
          type: "function_call",
          call_id: typeof block.id === "string" ? block.id : "",
          name: typeof block.name === "string" ? block.name : "tool",
          arguments: JSON.stringify(block.input ?? {}),
        });
      }
    }
  }

  return {
    model: body.model,
    input,
    max_output_tokens: body.max_tokens,
    temperature: body.temperature,
    tools: body.tools?.map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema ?? { type: "object", properties: {} },
    })),
    tool_choice:
      body.tool_choice?.type === "tool" && body.tool_choice.name
        ? {
            type: "function",
            name: body.tool_choice.name,
          }
        : body.tool_choice
          ? "auto"
          : undefined,
  };
}

function buildAnthropicMessageFromResponses(
  body: AnthropicMessageBody,
  response: OpenAIResponsesResponse,
) {
  const content: Array<Record<string, unknown>> = [];
  let hasToolUse = false;

  for (const item of response.output ?? []) {
    if (item.type === "message") {
      for (const part of item.content ?? []) {
        if (part.type === "output_text" && typeof part.text === "string") {
          content.push({
            type: "text",
            text: part.text,
          });
        }
      }
      continue;
    }

    if (item.type === "function_call") {
      hasToolUse = true;
      let parsed: unknown = {};
      if (typeof item.arguments === "string") {
        try {
          parsed = JSON.parse(item.arguments);
        } catch {
          parsed = {};
        }
      }
      content.push({
        type: "tool_use",
        id:
          item.call_id ||
          item.id ||
          `tool_${Math.random().toString(36).slice(2, 10)}`,
        name: item.name || "tool",
        input: parsed,
      });
    }
  }

  return {
    id: response.id || `msg_${Math.random().toString(36).slice(2, 10)}`,
    type: "message",
    role: "assistant",
    model: body.model,
    content,
    stop_reason: mapResponsesStopReason({
      reason: response.incomplete_details?.reason,
      hasToolUse,
    }),
    stop_sequence: null,
    usage: {
      input_tokens: response.usage?.input_tokens ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
}

function buildAnthropicMessageFromOpenAI(
  body: AnthropicMessageBody,
  response: OpenAIChatResponse,
) {
  const choice = response.choices?.[0];
  const content: Array<Record<string, unknown>> = [];

  if (choice?.message?.content) {
    content.push({
      type: "text",
      text: choice.message.content,
    });
  }

  for (const toolCall of choice?.message?.tool_calls ?? []) {
    let input: unknown = {};
    if (toolCall.function?.arguments) {
      try {
        input = JSON.parse(toolCall.function.arguments);
      } catch {
        input = {};
      }
    }
    content.push({
      type: "tool_use",
      id: toolCall.id || `tool_${Math.random().toString(36).slice(2, 10)}`,
      name: toolCall.function?.name || "tool",
      input,
    });
  }

  return {
    id: response.id || `msg_${Math.random().toString(36).slice(2, 10)}`,
    type: "message",
    role: "assistant",
    model: body.model,
    content,
    stop_reason: mapStopReason(choice?.finish_reason),
    stop_sequence: null,
    usage: {
      input_tokens: response.usage?.prompt_tokens ?? 0,
      output_tokens: response.usage?.completion_tokens ?? 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function createCopilotSSETransform(body: AnthropicMessageBody) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  let started = false;
  let textBlockStarted = false;
  let textBlockIndex: number | undefined;
  let nextBlockIndex = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const openBlocks: number[] = [];
  const toolState = new Map<
    number,
    {
      id?: string;
      name?: string;
      blockIndex: number;
      started: boolean;
      bufferedArgs: string[];
    }
  >();
  let stopReason = "end_turn";

  function emitMessageStart(
    controller: TransformStreamDefaultController<Uint8Array>,
  ) {
    if (started) return;
    started = true;
    controller.enqueue(
      encoder.encode(
        sseEvent("message_start", {
          type: "message_start",
          message: {
            id: `msg_${Math.random().toString(36).slice(2, 10)}`,
            type: "message",
            role: "assistant",
            model: body.model,
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: {
              input_tokens: inputTokens,
              output_tokens: 0,
            },
          },
        }),
      ),
    );
  }

  function emitTextStart(
    controller: TransformStreamDefaultController<Uint8Array>,
  ) {
    if (textBlockStarted) return;
    textBlockStarted = true;
    textBlockIndex = nextBlockIndex;
    openBlocks.push(nextBlockIndex);
    controller.enqueue(
      encoder.encode(
        sseEvent("content_block_start", {
          type: "content_block_start",
          index: nextBlockIndex,
          content_block: {
            type: "text",
            text: "",
          },
        }),
      ),
    );
    nextBlockIndex += 1;
  }

  function emitToolStart(
    controller: TransformStreamDefaultController<Uint8Array>,
    index: number,
  ) {
    const state = toolState.get(index);
    if (!state || state.started || !state.id || !state.name) return;
    state.started = true;
    openBlocks.push(state.blockIndex);
    controller.enqueue(
      encoder.encode(
        sseEvent("content_block_start", {
          type: "content_block_start",
          index: state.blockIndex,
          content_block: {
            type: "tool_use",
            id: state.id,
            name: state.name,
            input: {},
          },
        }),
      ),
    );
    for (const partial of state.bufferedArgs) {
      controller.enqueue(
        encoder.encode(
          sseEvent("content_block_delta", {
            type: "content_block_delta",
            index: state.blockIndex,
            delta: {
              type: "input_json_delta",
              partial_json: partial,
            },
          }),
        ),
      );
    }
    state.bufferedArgs.length = 0;
  }

  function handleChunk(
    controller: TransformStreamDefaultController<Uint8Array>,
    chunk: Record<string, unknown>,
  ) {
    const usage = chunk.usage as Record<string, unknown> | undefined;
    if (typeof usage?.prompt_tokens === "number")
      inputTokens = usage.prompt_tokens;
    if (typeof usage?.completion_tokens === "number")
      outputTokens = usage.completion_tokens;

    emitMessageStart(controller);
    const choice = Array.isArray(chunk.choices)
      ? (chunk.choices[0] as Record<string, unknown> | undefined)
      : undefined;
    if (!choice) return;

    const delta = (choice.delta ?? {}) as Record<string, unknown>;
    const text = typeof delta.content === "string" ? delta.content : undefined;
    if (text) {
      emitTextStart(controller);
      controller.enqueue(
        encoder.encode(
          sseEvent("content_block_delta", {
            type: "content_block_delta",
            index: textBlockIndex ?? 0,
            delta: {
              type: "text_delta",
              text,
            },
          }),
        ),
      );
    }

    if (Array.isArray(delta.tool_calls)) {
      for (const item of delta.tool_calls as Array<Record<string, unknown>>) {
        const index = typeof item.index === "number" ? item.index : 0;
        const state =
          toolState.get(index) ??
          (() => {
            const value = {
              blockIndex: nextBlockIndex,
              started: false,
              bufferedArgs: [] as string[],
            };
            nextBlockIndex += 1;
            toolState.set(index, value);
            return value;
          })();

        if (typeof item.id === "string") state.id = item.id;
        const fn = (item.function ?? {}) as Record<string, unknown>;
        if (typeof fn.name === "string") state.name = fn.name;
        if (typeof fn.arguments === "string" && fn.arguments.length > 0) {
          if (state.started) {
            controller.enqueue(
              encoder.encode(
                sseEvent("content_block_delta", {
                  type: "content_block_delta",
                  index: state.blockIndex,
                  delta: {
                    type: "input_json_delta",
                    partial_json: fn.arguments,
                  },
                }),
              ),
            );
          } else {
            state.bufferedArgs.push(fn.arguments);
          }
        }

        emitToolStart(controller, index);
      }
    }

    if (typeof choice.finish_reason === "string" && choice.finish_reason) {
      stopReason = mapStopReason(choice.finish_reason);
    }
  }

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const line = part
          .split("\n")
          .map((item) => item.trim())
          .find((item) => item.startsWith("data:"));
        if (!line) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          handleChunk(
            controller,
            JSON.parse(payload) as Record<string, unknown>,
          );
        } catch (error) {
          logForDebugging(
            `[copilot] failed to translate SSE chunk: ${errorMessage(error)}`,
          );
        }
      }
    },
    flush(controller) {
      if (!started) emitMessageStart(controller);
      for (const index of openBlocks) {
        controller.enqueue(
          encoder.encode(
            sseEvent("content_block_stop", {
              type: "content_block_stop",
              index,
            }),
          ),
        );
      }
      controller.enqueue(
        encoder.encode(
          sseEvent("message_delta", {
            type: "message_delta",
            delta: {
              stop_reason: stopReason,
              stop_sequence: null,
            },
            usage: {
              output_tokens: outputTokens,
            },
          }),
        ),
      );
      controller.enqueue(
        encoder.encode(
          sseEvent("message_stop", {
            type: "message_stop",
          }),
        ),
      );
    },
  });
}

function createCopilotResponsesSSETransform(body: AnthropicMessageBody) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  let started = false;
  let nextBlockIndex = 0;
  let textBlockIndex: number | undefined;
  let textBlockStarted = false;
  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason = "end_turn";
  let hasToolUse = false;
  const openBlocks: number[] = [];
  const toolState = new Map<
    number,
    { blockIndex: number; callID?: string; name?: string; started: boolean }
  >();

  function emitMessageStart(
    controller: TransformStreamDefaultController<Uint8Array>,
  ) {
    if (started) return;
    started = true;
    controller.enqueue(
      encoder.encode(
        sseEvent("message_start", {
          type: "message_start",
          message: {
            id: `msg_${Math.random().toString(36).slice(2, 10)}`,
            type: "message",
            role: "assistant",
            model: body.model,
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: {
              input_tokens: inputTokens,
              output_tokens: 0,
            },
          },
        }),
      ),
    );
  }

  function emitTextStart(
    controller: TransformStreamDefaultController<Uint8Array>,
  ) {
    if (textBlockStarted) return;
    textBlockStarted = true;
    textBlockIndex = nextBlockIndex;
    openBlocks.push(nextBlockIndex);
    controller.enqueue(
      encoder.encode(
        sseEvent("content_block_start", {
          type: "content_block_start",
          index: nextBlockIndex,
          content_block: {
            type: "text",
            text: "",
          },
        }),
      ),
    );
    nextBlockIndex += 1;
  }

  function emitToolStart(
    controller: TransformStreamDefaultController<Uint8Array>,
    index: number,
  ) {
    const state = toolState.get(index);
    if (!state || state.started || !state.callID || !state.name) return;
    state.started = true;
    openBlocks.push(state.blockIndex);
    controller.enqueue(
      encoder.encode(
        sseEvent("content_block_start", {
          type: "content_block_start",
          index: state.blockIndex,
          content_block: {
            type: "tool_use",
            id: state.callID,
            name: state.name,
            input: {},
          },
        }),
      ),
    );
  }

  function handleChunk(
    controller: TransformStreamDefaultController<Uint8Array>,
    chunk: Record<string, unknown>,
  ) {
    emitMessageStart(controller);

    if (
      (chunk.type === "response.completed" ||
        chunk.type === "response.incomplete") &&
      chunk.response &&
      typeof chunk.response === "object"
    ) {
      const response = chunk.response as Record<string, unknown>;
      const usage = (response.usage ?? {}) as Record<string, unknown>;
      if (typeof usage.input_tokens === "number")
        inputTokens = usage.input_tokens;
      if (typeof usage.output_tokens === "number")
        outputTokens = usage.output_tokens;
      const incomplete = (response.incomplete_details ?? {}) as Record<
        string,
        unknown
      >;
      stopReason = mapResponsesStopReason({
        reason:
          typeof incomplete.reason === "string" ? incomplete.reason : undefined,
        hasToolUse,
      });
      return;
    }

    if (
      chunk.type === "response.output_item.added" &&
      typeof chunk.output_index === "number"
    ) {
      const item = (chunk.item ?? {}) as Record<string, unknown>;
      if (item.type === "message") {
        return;
      }

      if (item.type === "function_call") {
        const index = chunk.output_index;
        toolState.set(index, {
          blockIndex: nextBlockIndex,
          callID: typeof item.call_id === "string" ? item.call_id : undefined,
          name: typeof item.name === "string" ? item.name : undefined,
          started: false,
        });
        nextBlockIndex += 1;
      }
      return;
    }

    if (chunk.type === "response.output_text.delta") {
      const delta = typeof chunk.delta === "string" ? chunk.delta : undefined;
      if (!delta) return;
      emitTextStart(controller);
      controller.enqueue(
        encoder.encode(
          sseEvent("content_block_delta", {
            type: "content_block_delta",
            index: textBlockIndex ?? 0,
            delta: {
              type: "text_delta",
              text: delta,
            },
          }),
        ),
      );
      return;
    }

    if (
      chunk.type === "response.function_call_arguments.delta" &&
      typeof chunk.output_index === "number"
    ) {
      const state =
        toolState.get(chunk.output_index) ??
        (() => {
          const value = {
            blockIndex: nextBlockIndex,
            started: false,
          } as {
            blockIndex: number;
            callID?: string;
            name?: string;
            started: boolean;
          };
          nextBlockIndex += 1;
          toolState.set(chunk.output_index, value);
          return value;
        })();
      emitToolStart(controller, chunk.output_index);
      if (typeof chunk.delta === "string") {
        controller.enqueue(
          encoder.encode(
            sseEvent("content_block_delta", {
              type: "content_block_delta",
              index: state.blockIndex,
              delta: {
                type: "input_json_delta",
                partial_json: chunk.delta,
              },
            }),
          ),
        );
      }
      return;
    }

    if (
      chunk.type === "response.output_item.done" &&
      typeof chunk.output_index === "number"
    ) {
      const item = (chunk.item ?? {}) as Record<string, unknown>;
      if (item.type === "message") {
        return;
      }

      if (item.type === "function_call") {
        hasToolUse = true;
        const state = toolState.get(chunk.output_index) ?? {
          blockIndex: nextBlockIndex,
          started: false,
        };
        if (!toolState.has(chunk.output_index)) {
          nextBlockIndex += 1;
          toolState.set(chunk.output_index, state);
        }
        state.callID =
          typeof item.call_id === "string" ? item.call_id : state.callID;
        state.name = typeof item.name === "string" ? item.name : state.name;
        emitToolStart(controller, chunk.output_index);

        if (
          !state.started &&
          typeof item.arguments === "string" &&
          item.arguments.length > 0
        ) {
          controller.enqueue(
            encoder.encode(
              sseEvent("content_block_delta", {
                type: "content_block_delta",
                index: state.blockIndex,
                delta: {
                  type: "input_json_delta",
                  partial_json: item.arguments,
                },
              }),
            ),
          );
        }
      }
    }
  }

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const line = part
          .split("\n")
          .map((item) => item.trim())
          .find((item) => item.startsWith("data:"));
        if (!line) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          handleChunk(
            controller,
            JSON.parse(payload) as Record<string, unknown>,
          );
        } catch (error) {
          logForDebugging(
            `[copilot] failed to translate responses SSE chunk: ${errorMessage(error)}`,
          );
        }
      }
    },
    flush(controller) {
      if (!started) emitMessageStart(controller);
      for (const index of openBlocks) {
        controller.enqueue(
          encoder.encode(
            sseEvent("content_block_stop", {
              type: "content_block_stop",
              index,
            }),
          ),
        );
      }
      controller.enqueue(
        encoder.encode(
          sseEvent("message_delta", {
            type: "message_delta",
            delta: {
              stop_reason: stopReason,
              stop_sequence: null,
            },
            usage: {
              output_tokens: outputTokens,
            },
          }),
        ),
      );
      controller.enqueue(
        encoder.encode(
          sseEvent("message_stop", {
            type: "message_stop",
          }),
        ),
      );
    },
  });
}

function buildCopilotHeaders(input: {
  token: string;
  body: AnthropicMessageBody;
  initHeaders?: HeadersInit;
}) {
  const headers = new Headers(input.initHeaders);
  const last = input.body.messages[input.body.messages.length - 1];
  const lastContent = Array.isArray(last?.content) ? last.content : [];
  const hasNonToolResults =
    Array.isArray(lastContent) &&
    lastContent.some((part) => part.type !== "tool_result");
  const isAgent = !(last?.role === "user" && hasNonToolResults);
  const isVision = input.body.messages.some((message) => {
    if (!Array.isArray(message.content)) return false;
    return message.content.some((part) => part.type === "image");
  });

  headers.set("Authorization", `Bearer ${input.token}`);
  headers.set("User-Agent", getUserAgent());
  headers.set("x-initiator", isAgent ? "agent" : "user");
  headers.set("Openai-Intent", "conversation-edits");
  headers.delete("x-api-key");
  headers.delete("anthropic-version");
  headers.delete("anthropic-beta");
  if (isVision) {
    headers.set("Copilot-Vision-Request", "true");
  }
  return headers;
}

export function createCopilotAnthropicFetch(innerFetch: typeof fetch = fetch) {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const token = getCopilotToken();
    if (!token) {
      return new Response(
        JSON.stringify({
          error: {
            type: "authentication_error",
            message: "GitHub Copilot is not authenticated",
          },
        }),
        {
          status: 401,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }

    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
    );
    if (url.pathname.endsWith("/messages/count_tokens")) {
      return new Response(JSON.stringify({ input_tokens: null }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    }

    if (!url.pathname.endsWith("/messages")) {
      return innerFetch(input, init);
    }

    const rawBody = typeof init?.body === "string" ? init.body : "";
    const body = JSON.parse(rawBody) as AnthropicMessageBody;
    const useResponsesApi = shouldUseCopilotResponsesApi(body.model);
    const requestBody = useResponsesApi
      ? buildOpenAIResponsesRequest(body)
      : buildOpenAIChatRequest(body);
    const response = await innerFetch(
      `${getCopilotApiBaseUrl()}${
        useResponsesApi ? "/responses" : "/chat/completions"
      }`,
      {
        method: "POST",
        headers: buildCopilotHeaders({
          token,
          body,
          initHeaders: init?.headers,
        }),
        body: JSON.stringify(requestBody),
        signal: init?.signal,
      },
    );

    if (!response.ok) {
      return response;
    }

    if (body.stream) {
      return new Response(
        response.body?.pipeThrough(
          useResponsesApi
            ? createCopilotResponsesSSETransform(body)
            : createCopilotSSETransform(body),
        ),
        {
          status: response.status,
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
          },
        },
      );
    }

    const translated = useResponsesApi
      ? buildAnthropicMessageFromResponses(
          body,
          (await response.json()) as OpenAIResponsesResponse,
        )
      : buildAnthropicMessageFromOpenAI(
          body,
          (await response.json()) as OpenAIChatResponse,
        );
    return new Response(JSON.stringify(translated), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  };
}
