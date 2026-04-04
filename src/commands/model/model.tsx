import chalk from "chalk";
import * as React from "react";
import type { CommandResultDisplay } from "../../commands.js";
import { ModelPicker } from "../../components/ModelPicker.js";
import { COMMON_HELP_ARGS, COMMON_INFO_ARGS } from "../../constants/xml.js";
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from "../../services/analytics/index.js";
import { useAppState, useSetAppState } from "../../state/AppState.js";
import type { LocalJSXCommandCall } from "../../types/command.js";
import type { EffortLevel } from "../../utils/effort.js";
import { errorMessage } from "../../utils/errors.js";
import { isBilledAsExtraUsage } from "../../utils/extraUsage.js";
import {
  clearFastModeCooldown,
  isFastModeAvailable,
  isFastModeEnabled,
  isFastModeSupportedByModel,
} from "../../utils/fastMode.js";
import { stripSignatureBlocks } from "../../utils/messages.js";
import { MODEL_ALIASES } from "../../utils/model/aliases.js";
import {
  checkOpus1mAccess,
  checkSonnet1mAccess,
} from "../../utils/model/check1mAccess.js";
import {
  getDefaultMainLoopModelSetting,
  isOpus1mMergeEnabled,
  renderDefaultModelSetting,
} from "../../utils/model/model.js";
import { isModelAllowed } from "../../utils/model/modelAllowlist.js";
import { validateModel } from "../../utils/model/validateModel.js";
import { activateProviderForSelectedModel } from "../../utils/modelSelection.js";
import { getAPIProviderLabel } from "../../utils/providerSelection.js";

type CommandContext = Parameters<LocalJSXCommandCall>[1];

async function syncProviderForModel(
  model: string | null,
  context?: CommandContext,
): Promise<string | undefined> {
  const provider = await activateProviderForSelectedModel(model);
  if (!provider) {
    return undefined;
  }

  if (context) {
    context.onChangeAPIKey();
    context.setMessages(stripSignatureBlocks);
  }

  return getAPIProviderLabel(provider);
}

function renderModelLabel(model: string | null): string {
  const rendered = renderDefaultModelSetting(
    model ?? getDefaultMainLoopModelSetting(),
  );
  return model === null ? `${rendered} (default)` : rendered;
}

function isKnownAlias(model: string): boolean {
  return (MODEL_ALIASES as readonly string[]).includes(
    model.toLowerCase().trim(),
  );
}

function isOpus1mUnavailable(model: string): boolean {
  const lower = model.toLowerCase();
  return (
    !checkOpus1mAccess() &&
    !isOpus1mMergeEnabled() &&
    lower.includes("opus") &&
    lower.includes("[1m]")
  );
}

function isSonnet1mUnavailable(model: string): boolean {
  const lower = model.toLowerCase();
  return (
    !checkSonnet1mAccess() &&
    (lower.includes("sonnet[1m]") || lower.includes("sonnet-4-6[1m]"))
  );
}

function ModelPickerWrapper({
  onDone,
  context,
}: {
  onDone: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void;
  context: CommandContext;
}): React.ReactNode {
  const mainLoopModel = useAppState((s) => s.mainLoopModel);
  const mainLoopModelForSession = useAppState((s) => s.mainLoopModelForSession);
  const isFastMode = useAppState((s) => s.fastMode);
  const setAppState = useSetAppState();

  function handleCancel(): void {
    logEvent("tengu_model_command_menu", {
      action:
        "cancel" as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    onDone(`Kept model as ${chalk.bold(renderModelLabel(mainLoopModel))}`, {
      display: "system",
    });
  }

  async function handleSelect(
    model: string | null,
    effort: EffortLevel | undefined,
  ): Promise<void> {
    logEvent("tengu_model_command_menu", {
      action:
        model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      from_model:
        mainLoopModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      to_model:
        model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });

    let providerLabel: string | undefined;
    try {
      providerLabel = await syncProviderForModel(model, context);
    } catch (error) {
      onDone(`Failed to switch model: ${errorMessage(error)}`, {
        display: "system",
      });
      return;
    }

    setAppState((prev) => ({
      ...prev,
      mainLoopModel: model,
      mainLoopModelForSession: null,
      ...(providerLabel ? { authVersion: prev.authVersion + 1 } : {}),
    }));

    let message = `Set model to ${chalk.bold(renderModelLabel(model))}`;
    if (providerLabel) {
      message += ` via ${chalk.bold(providerLabel)}`;
    }
    if (effort !== undefined) {
      message += ` with ${chalk.bold(effort)} effort`;
    }

    let wasFastModeToggledOn: boolean | undefined;
    if (isFastModeEnabled()) {
      clearFastModeCooldown();
      if (!isFastModeSupportedByModel(model) && isFastMode) {
        setAppState((prev) => ({ ...prev, fastMode: false }));
        wasFastModeToggledOn = false;
      } else if (
        isFastModeSupportedByModel(model) &&
        isFastModeAvailable() &&
        isFastMode
      ) {
        message += " · Fast mode ON";
        wasFastModeToggledOn = true;
      }
    }

    if (
      isBilledAsExtraUsage(
        model,
        wasFastModeToggledOn === true,
        isOpus1mMergeEnabled(),
      )
    ) {
      message += " · Billed as extra usage";
    }

    if (wasFastModeToggledOn === false) {
      message += " · Fast mode OFF";
    }

    onDone(message);
  }

  return (
    <ModelPicker
      initial={mainLoopModel}
      sessionModel={mainLoopModelForSession}
      onSelect={handleSelect}
      onCancel={handleCancel}
      isStandaloneCommand
      showFastModeNotice={
        isFastModeEnabled() &&
        isFastMode &&
        isFastModeSupportedByModel(mainLoopModel) &&
        isFastModeAvailable()
      }
    />
  );
}

function SetModelAndClose({
  args,
  onDone,
  context,
}: {
  args: string;
  onDone: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void;
  context: CommandContext;
}): React.ReactNode {
  const isFastMode = useAppState((s) => s.fastMode);
  const setAppState = useSetAppState();
  const model = args === "default" ? null : args;

  React.useEffect(() => {
    async function setModel(modelValue: string | null): Promise<void> {
      let providerLabel: string | undefined;
      try {
        providerLabel = await syncProviderForModel(modelValue, context);
      } catch (error) {
        onDone(`Failed to switch model: ${errorMessage(error)}`, {
          display: "system",
        });
        return;
      }

      setAppState((prev) => ({
        ...prev,
        mainLoopModel: modelValue,
        mainLoopModelForSession: null,
        ...(providerLabel ? { authVersion: prev.authVersion + 1 } : {}),
      }));

      let message = `Set model to ${chalk.bold(renderModelLabel(modelValue))}`;
      if (providerLabel) {
        message += ` via ${chalk.bold(providerLabel)}`;
      }

      let wasFastModeToggledOn: boolean | undefined;
      if (isFastModeEnabled()) {
        clearFastModeCooldown();
        if (!isFastModeSupportedByModel(modelValue) && isFastMode) {
          setAppState((prev) => ({ ...prev, fastMode: false }));
          wasFastModeToggledOn = false;
        } else if (isFastModeSupportedByModel(modelValue) && isFastMode) {
          message += " · Fast mode ON";
          wasFastModeToggledOn = true;
        }
      }

      if (
        isBilledAsExtraUsage(
          modelValue,
          wasFastModeToggledOn === true,
          isOpus1mMergeEnabled(),
        )
      ) {
        message += " · Billed as extra usage";
      }

      if (wasFastModeToggledOn === false) {
        message += " · Fast mode OFF";
      }

      onDone(message);
    }

    async function handleModelChange(): Promise<void> {
      if (model && !isModelAllowed(model)) {
        onDone(
          `Model '${model}' is not available. Your organization restricts model selection.`,
          { display: "system" },
        );
        return;
      }

      if (model && isOpus1mUnavailable(model)) {
        onDone(
          "Opus 4.6 with 1M context is not available for your account. Learn more: https://code.claude.com/docs/en/model-config#extended-context-with-1m",
          { display: "system" },
        );
        return;
      }

      if (model && isSonnet1mUnavailable(model)) {
        onDone(
          "Sonnet 4.6 with 1M context is not available for your account. Learn more: https://code.claude.com/docs/en/model-config#extended-context-with-1m",
          { display: "system" },
        );
        return;
      }

      if (!model) {
        await setModel(null);
        return;
      }

      if (isKnownAlias(model)) {
        await setModel(model);
        return;
      }

      try {
        const { valid, error } = await validateModel(model);
        if (valid) {
          await setModel(model);
          return;
        }

        onDone(error || `Model '${model}' not found`, {
          display: "system",
        });
      } catch (error) {
        onDone(`Failed to validate model: ${(error as Error).message}`, {
          display: "system",
        });
      }
    }

    void handleModelChange();
  }, [context, isFastMode, model, onDone, setAppState]);

  return null;
}

function ShowModelAndClose({
  onDone,
}: {
  onDone: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void;
}): React.ReactNode {
  const mainLoopModel = useAppState((s) => s.mainLoopModel);
  const mainLoopModelForSession = useAppState((s) => s.mainLoopModelForSession);
  const effortValue = useAppState((s) => s.effortValue);
  const displayModel = renderModelLabel(mainLoopModel);
  const effortInfo =
    effortValue !== undefined ? ` (effort: ${effortValue})` : "";

  if (mainLoopModelForSession) {
    onDone(
      `Current model: ${chalk.bold(
        renderModelLabel(mainLoopModelForSession),
      )} (session override from plan mode)\nBase model: ${displayModel}${effortInfo}`,
    );
  } else {
    onDone(`Current model: ${displayModel}${effortInfo}`);
  }

  return null;
}

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const trimmed = args?.trim() || "";

  if (COMMON_INFO_ARGS.includes(trimmed)) {
    logEvent("tengu_model_command_inline_help", {
      args: trimmed as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    return <ShowModelAndClose onDone={onDone} />;
  }

  if (COMMON_HELP_ARGS.includes(trimmed)) {
    onDone(
      "Run /model to open the model selection menu, or /model [modelName] to set the model.",
      { display: "system" },
    );
    return;
  }

  if (trimmed) {
    logEvent("tengu_model_command_inline", {
      args: trimmed as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    return (
      <SetModelAndClose args={trimmed} onDone={onDone} context={context} />
    );
  }

  return <ModelPickerWrapper onDone={onDone} context={context} />;
};
