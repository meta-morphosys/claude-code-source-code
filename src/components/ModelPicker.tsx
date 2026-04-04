import capitalize from "lodash-es/capitalize.js";
import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useExitOnCtrlCDWithKeybindings } from "src/hooks/useExitOnCtrlCDWithKeybindings.js";
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from "src/services/analytics/index.js";
import {
  FAST_MODE_MODEL_DISPLAY,
  isFastModeAvailable,
  isFastModeCooldown,
  isFastModeEnabled,
} from "src/utils/fastMode.js";
import { Box, Text, useInput, useTerminalFocus } from "../ink.js";
import { useKeybindings } from "../keybindings/useKeybinding.js";
import { useAppState, useSetAppState } from "../state/AppState.js";
import {
  convertEffortValueToLevel,
  type EffortLevel,
  getDefaultEffortForModel,
  modelSupportsEffort,
  modelSupportsMaxEffort,
  resolvePickerEffortPersistence,
  toPersistableEffort,
} from "../utils/effort.js";
import {
  getDefaultMainLoopModel,
  type ModelSetting,
  modelDisplayString,
  parseUserSpecifiedModel,
} from "../utils/model/model.js";
import {
  getModelOptions,
  type ModelOption,
} from "../utils/model/modelOptions.js";
import {
  getSettingsForSource,
  updateSettingsForSource,
} from "../utils/settings/settings.js";
import { ConfigurableShortcutHint } from "./ConfigurableShortcutHint.js";
import { SearchBox } from "./SearchBox.js";
import { Select } from "./CustomSelect/index.js";
import { Byline } from "./design-system/Byline.js";
import { KeyboardShortcutHint } from "./design-system/KeyboardShortcutHint.js";
import { Pane } from "./design-system/Pane.js";
import { effortLevelToSymbol } from "./EffortIndicator.js";
import {
  filterModelOptions,
  getModelPickerDisplayDescription,
} from "./modelPickerHelpers.js";
import { useSearchInput } from "../hooks/useSearchInput.js";

export type Props = {
  initial: string | null;
  sessionModel?: ModelSetting;
  onSelect: (model: string | null, effort: EffortLevel | undefined) => void;
  onCancel?: () => void;
  isStandaloneCommand?: boolean;
  showFastModeNotice?: boolean;
  headerText?: string;
  skipSettingsWrite?: boolean;
};

const NO_PREFERENCE = "__NO_PREFERENCE__";

type SelectOptionValue = string;

function resolveOptionModel(value?: SelectOptionValue): string | undefined {
  if (!value) return undefined;
  return value === NO_PREFERENCE
    ? getDefaultMainLoopModel()
    : parseUserSpecifiedModel(value);
}

function cycleEffortLevel(
  current: EffortLevel,
  direction: "left" | "right",
  includeMax: boolean,
): EffortLevel {
  const levels: EffortLevel[] = includeMax
    ? ["low", "medium", "high", "max"]
    : ["low", "medium", "high"];
  const idx = levels.indexOf(current);
  const currentIndex = idx !== -1 ? idx : levels.indexOf("high");
  if (direction === "right") {
    return levels[(currentIndex + 1) % levels.length]!;
  }
  return levels[(currentIndex - 1 + levels.length) % levels.length]!;
}

function getDefaultEffortLevelForOption(
  value?: SelectOptionValue,
): EffortLevel {
  const resolved = resolveOptionModel(value) ?? getDefaultMainLoopModel();
  const defaultValue = getDefaultEffortForModel(resolved);
  return defaultValue !== undefined
    ? convertEffortValueToLevel(defaultValue)
    : "high";
}

function EffortLevelIndicator({
  effort,
}: {
  effort?: EffortLevel;
}): React.ReactNode {
  return (
    <Text color={effort ? "claude" : "subtle"}>
      {effortLevelToSymbol(effort ?? "low")}
    </Text>
  );
}

function buildDisplayOptions(options: ModelOption[]) {
  return options.map((option) => ({
    ...option,
    value: option.value === null ? NO_PREFERENCE : option.value,
    description: getModelPickerDisplayDescription(option),
  }));
}

export function ModelPicker({
  initial,
  sessionModel,
  onSelect,
  onCancel,
  isStandaloneCommand,
  showFastModeNotice,
  headerText,
  skipSettingsWrite,
}: Props): React.ReactNode {
  const setAppState = useSetAppState();
  const exitState = useExitOnCtrlCDWithKeybindings();
  const isTerminalFocused = useTerminalFocus();
  const initialValue = initial === null ? NO_PREFERENCE : initial;
  const [focusedValue, setFocusedValue] = useState<
    SelectOptionValue | undefined
  >(initialValue);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const isFastMode = useAppState((s) =>
    isFastModeEnabled() ? s.fastMode : false,
  );
  const [hasToggledEffort, setHasToggledEffort] = useState(false);
  const effortValue = useAppState((s) => s.effortValue);
  const [effort, setEffort] = useState<EffortLevel | undefined>(
    effortValue !== undefined
      ? convertEffortValueToLevel(effortValue)
      : undefined,
  );

  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    cursorOffset: searchCursorOffset,
  } = useSearchInput({
    isActive: isSearchMode,
    onExit: () => setIsSearchMode(false),
    onCancel: () => {
      setSearchQuery("");
      setIsSearchMode(false);
    },
    backspaceExitsOnEmpty: false,
  });

  useInput(
    (input, key) => {
      if (isSearchMode) {
        return;
      }

      if (key.ctrl && input.toLowerCase() === "f") {
        setIsSearchMode(true);
        return;
      }

      if (!key.ctrl && !key.meta && input === "/") {
        setIsSearchMode(true);
      }
    },
    { isActive: true },
  );

  const modelOptions = useMemo(
    () => getModelOptions(isFastMode ?? false),
    [isFastMode],
  );

  const optionsWithInitial = useMemo(() => {
    if (
      initial !== null &&
      !modelOptions.some((opt) => opt.value === initial)
    ) {
      return [
        ...modelOptions,
        {
          value: initial,
          label: modelDisplayString(initial),
          description: "Current model",
        },
      ];
    }
    return modelOptions;
  }, [initial, modelOptions]);

  const filteredOptions = useMemo(
    () => filterModelOptions(optionsWithInitial, searchQuery),
    [optionsWithInitial, searchQuery],
  );

  const selectOptions = useMemo(
    () => buildDisplayOptions(filteredOptions),
    [filteredOptions],
  );

  const activeFocusValue = useMemo(() => {
    if (selectOptions.some((option) => option.value === focusedValue)) {
      return focusedValue;
    }
    return selectOptions.some((option) => option.value === initialValue)
      ? initialValue
      : selectOptions[0]?.value;
  }, [focusedValue, initialValue, selectOptions]);

  useEffect(() => {
    if (activeFocusValue !== focusedValue) {
      setFocusedValue(activeFocusValue);
    }
  }, [activeFocusValue, focusedValue]);

  const visibleCount = Math.min(10, Math.max(1, selectOptions.length));
  const hiddenCount = Math.max(0, selectOptions.length - visibleCount);
  const focusedModelName = selectOptions.find(
    (option) => option.value === activeFocusValue,
  )?.label;
  const focusedModel = resolveOptionModel(activeFocusValue);
  const focusedSupportsEffort = focusedModel
    ? modelSupportsEffort(focusedModel)
    : false;
  const focusedSupportsMax = focusedModel
    ? modelSupportsMaxEffort(focusedModel)
    : false;
  const focusedDefaultEffort = getDefaultEffortLevelForOption(activeFocusValue);
  const displayEffort =
    effort === "max" && !focusedSupportsMax ? "high" : effort;

  useKeybindings(
    {
      "modelPicker:decreaseEffort": () => {
        if (!isSearchMode && focusedSupportsEffort) {
          setEffort((prev) =>
            cycleEffortLevel(
              prev ?? focusedDefaultEffort,
              "left",
              focusedSupportsMax,
            ),
          );
          setHasToggledEffort(true);
        }
      },
      "modelPicker:increaseEffort": () => {
        if (!isSearchMode && focusedSupportsEffort) {
          setEffort((prev) =>
            cycleEffortLevel(
              prev ?? focusedDefaultEffort,
              "right",
              focusedSupportsMax,
            ),
          );
          setHasToggledEffort(true);
        }
      },
    },
    {
      context: "ModelPicker",
    },
  );

  const handleFocus = (value: SelectOptionValue) => {
    setFocusedValue(value);
    if (!hasToggledEffort && effortValue === undefined) {
      setEffort(getDefaultEffortLevelForOption(value));
    }
  };

  const handleSelect = (value: SelectOptionValue) => {
    logEvent("tengu_model_command_menu_effort", {
      effort:
        effort as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });

    if (!skipSettingsWrite) {
      const effortLevel = resolvePickerEffortPersistence(
        effort,
        getDefaultEffortLevelForOption(value),
        getSettingsForSource("userSettings")?.effortLevel,
        hasToggledEffort,
      );
      const persistable = toPersistableEffort(effortLevel);
      if (persistable !== undefined) {
        updateSettingsForSource("userSettings", {
          effortLevel: persistable,
        });
      }
      setAppState((prev) => ({
        ...prev,
        effortValue: effortLevel,
      }));
    }

    const selectedModel = resolveOptionModel(value);
    const selectedEffort =
      hasToggledEffort && selectedModel && modelSupportsEffort(selectedModel)
        ? effort
        : undefined;

    if (value === NO_PREFERENCE) {
      onSelect(null, selectedEffort);
      return;
    }

    onSelect(value, selectedEffort);
  };

  const searchBox = (
    <Box marginBottom={1} flexDirection="column">
      <SearchBox
        query={searchQuery}
        isFocused={isSearchMode}
        isTerminalFocused={isTerminalFocused}
        cursorOffset={searchCursorOffset}
        placeholder="Search models…"
      />
    </Box>
  );

  const list = (
    <Box flexDirection="column">
      {selectOptions.length === 0 ? (
        <Text dimColor>No models match "{searchQuery}"</Text>
      ) : (
        <>
          <Select
            defaultValue={initialValue}
            defaultFocusValue={activeFocusValue}
            options={selectOptions}
            onChange={handleSelect}
            onFocus={handleFocus}
            onCancel={onCancel}
            visibleOptionCount={visibleCount}
            isDisabled={isSearchMode}
          />
          {hiddenCount > 0 ? (
            <Box paddingLeft={3}>
              <Text dimColor>
                {searchQuery
                  ? `${selectOptions.length} matches`
                  : `and ${hiddenCount} more…`}
              </Text>
            </Box>
          ) : null}
        </>
      )}
    </Box>
  );

  const effortBlock = (
    <Box marginBottom={1} flexDirection="column">
      {focusedSupportsEffort ? (
        <Text dimColor>
          <EffortLevelIndicator effort={displayEffort} />{" "}
          {capitalize(displayEffort)} effort
          {displayEffort === focusedDefaultEffort ? " (default)" : ""}{" "}
          <Text color="subtle">← → to adjust</Text>
        </Text>
      ) : (
        <Text color="subtle">
          <EffortLevelIndicator effort={undefined} /> Effort not supported
          {focusedModelName ? ` for ${focusedModelName}` : ""}
        </Text>
      )}
    </Box>
  );

  const fastModeNotice = isFastModeEnabled() ? (
    showFastModeNotice ? (
      <Box marginBottom={1}>
        <Text dimColor>
          Fast mode is <Text bold>ON</Text> and available with{" "}
          {FAST_MODE_MODEL_DISPLAY} only (/fast). Switching to other models
          turns off fast mode.
        </Text>
      </Box>
    ) : isFastModeAvailable() && !isFastModeCooldown() ? (
      <Box marginBottom={1}>
        <Text dimColor>
          Use <Text bold>/fast</Text> to turn on Fast mode (
          {FAST_MODE_MODEL_DISPLAY} only).
        </Text>
      </Box>
    ) : null
  ) : null;

  const content = (
    <Box flexDirection="column">
      <Box marginBottom={1} flexDirection="column">
        <Text color="remember" bold>
          Select model
        </Text>
        <Text dimColor>
          {headerText ??
            "Switch between Claude models. Applies to this session and future Claude Code sessions. Use / to search."}
        </Text>
        {sessionModel ? (
          <Text dimColor>
            Currently using {modelDisplayString(sessionModel)} for this session
            (set by plan mode). Selecting a model will undo this.
          </Text>
        ) : null}
      </Box>

      {searchBox}
      {list}
      {effortBlock}
      {fastModeNotice}

      {isStandaloneCommand ? (
        <Text dimColor italic>
          {exitState.pending ? (
            <>Press {exitState.keyName} again to exit</>
          ) : isSearchMode ? (
            <Byline>
              <Text>Type to search</Text>
              <KeyboardShortcutHint shortcut="Enter" action="browse" />
              <KeyboardShortcutHint shortcut="Esc" action="clear" />
            </Byline>
          ) : (
            <Byline>
              <KeyboardShortcutHint shortcut="/" action="search" />
              <KeyboardShortcutHint shortcut="Enter" action="confirm" />
              <ConfigurableShortcutHint
                action="select:cancel"
                context="Select"
                fallback="Esc"
                description="exit"
              />
            </Byline>
          )}
        </Text>
      ) : null}
    </Box>
  );

  if (!isStandaloneCommand) {
    return content;
  }

  return <Pane color="permission">{content}</Pane>;
}
