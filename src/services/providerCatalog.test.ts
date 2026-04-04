import { describe, expect, test } from "bun:test";
import {
  normalizeDomain,
  parseCopilotModelOptions,
} from "./copilot/provider.js";
import { parseOpenRouterModelOptions } from "./openrouter/provider.js";
import {
  CLAUDE_OPUS_4_CONFIG,
  CLAUDE_OPUS_4_1_CONFIG,
} from "../utils/model/configs.js";
import {
  getCLIProviderName,
  toSelectableAPIProvider,
} from "../utils/providerSelection.js";

describe("OpenRouter provider catalog", () => {
  test("accepts nullable context metadata from the API", () => {
    const options = parseOpenRouterModelOptions({
      data: [
        {
          id: "anthropic/claude-sonnet-4.6",
          name: "Claude Sonnet 4.6",
          description: "Everyday coding model",
          context_length: null,
          pricing: {
            prompt: null,
            completion: null,
          },
          top_provider: {
            context_length: null,
          },
        },
      ],
    });

    expect(options).toEqual([
      {
        value: "anthropic/claude-sonnet-4.6",
        label: "Claude Sonnet 4.6",
        description: "OpenRouter model · Everyday coding model",
        provider: "openrouter",
      },
    ]);
  });
});

describe("Copilot provider catalog", () => {
  test("normalizes nullable provider fields and keeps unsupported models disabled", () => {
    const options = parseCopilotModelOptions({
      data: [
        {
          id: "gpt-5",
          name: null,
          model_picker_enabled: null,
          supported_endpoints: ["responses"],
          capabilities: {
            supports: {
              tool_calls: null,
              vision: null,
            },
          },
        },
        {
          id: "legacy-chat",
          name: "Legacy Chat",
          model_picker_enabled: true,
          supported_endpoints: ["embeddings"],
          capabilities: {
            supports: {
              tool_calls: false,
            },
          },
        },
      ],
    });

    expect(options).toEqual([
      {
        value: "gpt-5",
        label: "gpt-5",
        description: "GitHub Copilot model",
        disabled: false,
        provider: "copilot",
      },
      {
        value: "legacy-chat",
        label: "Legacy Chat",
        description:
          "GitHub Copilot model · Tool calling unavailable, disabled in Claude Code",
        disabled: true,
        provider: "copilot",
      },
    ]);
  });

  test("normalizes enterprise URLs to hostnames before building endpoints", () => {
    expect(normalizeDomain("ghe.example.com")).toBe("ghe.example.com");
    expect(normalizeDomain("https://ghe.example.com")).toBe("ghe.example.com");
    expect(normalizeDomain("https://ghe.example.com/foo/bar")).toBe(
      "ghe.example.com",
    );
    expect(normalizeDomain("https://ghe.example.com:8443/foo/bar?x=1")).toBe(
      "ghe.example.com:8443",
    );
    expect(normalizeDomain("ghe.example.com/foo/bar")).toBe("ghe.example.com");
  });
});

describe("Anthropic provider helpers", () => {
  test("maps public and internal anthropic provider names consistently", () => {
    expect(toSelectableAPIProvider("anthropic")).toBe("firstParty");
    expect(toSelectableAPIProvider("default")).toBe("firstParty");
    expect(toSelectableAPIProvider("firstparty")).toBe("firstParty");
    expect(getCLIProviderName("firstParty")).toBe("anthropic");
  });

  test("keeps Copilot Opus 4 and 4.1 ids distinct", () => {
    expect(CLAUDE_OPUS_4_CONFIG.copilot).toBe("claude-opus-4");
    expect(CLAUDE_OPUS_4_1_CONFIG.copilot).toBe("claude-opus-4-1");
    expect(CLAUDE_OPUS_4_CONFIG.copilot).not.toBe(
      CLAUDE_OPUS_4_1_CONFIG.copilot,
    );
  });
});
