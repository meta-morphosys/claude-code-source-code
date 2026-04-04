import { describe, expect, test } from "bun:test";
import {
  compactModelDescription,
  filterModelOptions,
  getModelPickerDisplayDescription,
} from "./modelPickerHelpers.js";

describe("compactModelDescription", () => {
  test("keeps short descriptions intact", () => {
    expect(
      compactModelDescription("Sonnet 4.6 · Best for everyday tasks"),
    ).toBe("Sonnet 4.6 · Best for everyday tasks");
  });

  test("truncates long provider descriptions to a readable summary", () => {
    expect(
      compactModelDescription(
        "256,000 context · KAT-Coder-Pro V2 is the latest high-performance model in KwaiKAT's KAT-Coder series, designed for complex enterprise-grade software engineering and SaaS integration.",
        80,
      ),
    ).toBe(
      "256,000 context · KAT-Coder-Pro V2 is the latest high-performance model in…",
    );
  });
});

describe("filterModelOptions", () => {
  const options = [
    {
      value: "gpt-5",
      label: "GPT-5",
      description: "GitHub Copilot model",
      descriptionForModel: "High reasoning model",
      provider: "copilot" as const,
    },
    {
      value: "anthropic/claude-sonnet-4.6",
      label: "Claude Sonnet 4.6",
      description: "OpenRouter model",
      descriptionForModel: "Everyday coding model",
      provider: "openrouter" as const,
    },
  ];

  test("matches on labels, values, providers, and full descriptions", () => {
    expect(filterModelOptions(options, "copilot")).toEqual([options[0]]);
    expect(filterModelOptions(options, "claude-sonnet")).toEqual([options[1]]);
    expect(filterModelOptions(options, "everyday coding")).toEqual([
      options[1],
    ]);
  });
});

describe("getModelPickerDisplayDescription", () => {
  test("shows provider labels for provider-backed models", () => {
    expect(
      getModelPickerDisplayDescription({
        value: "gpt-5",
        label: "GPT-5",
        description: "Long provider description that should not be shown",
        provider: "copilot",
      }),
    ).toBe("GitHub Copilot");

    expect(
      getModelPickerDisplayDescription({
        value: "anthropic/claude-sonnet-4.5",
        label: "Claude Sonnet 4.5",
        description: "Another long provider description",
        provider: "openrouter",
      }),
    ).toBe("OpenRouter");
  });
});
