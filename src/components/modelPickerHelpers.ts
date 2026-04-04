import type { ModelOption } from "../utils/model/modelOptions.js";
import { getAPIProviderLabel } from "../utils/providerSelection.js";

function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  const sliced = text.slice(0, Math.max(0, maxLength - 1));
  const trimmed = sliced.replace(/\s+\S*$/, "").trimEnd();
  return `${trimmed || sliced}…`;
}

export function compactModelDescription(
  description: string | undefined,
  maxLength = 96,
): string | undefined {
  if (!description) {
    return undefined;
  }

  const normalized = description.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }

  const sentenceMatch = normalized.match(/^(.+?[.!?])(?:\s|$)/);
  const firstSentence = sentenceMatch?.[1]?.trim();
  const condensed =
    firstSentence && firstSentence.length >= 24 ? firstSentence : normalized;

  return truncateAtWordBoundary(condensed, maxLength);
}

export function filterModelOptions(
  options: ModelOption[],
  query: string,
): ModelOption[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return options;
  }

  return options.filter((option) => {
    const haystack = [
      option.label,
      option.value ?? "",
      option.description,
      option.descriptionForModel ?? "",
      option.provider ?? "",
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

export function getModelPickerDisplayDescription(
  option: ModelOption,
): string | undefined {
  if (option.provider) {
    return getAPIProviderLabel(option.provider);
  }

  return compactModelDescription(option.description);
}
