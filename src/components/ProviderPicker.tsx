import * as React from "react";
import { Box, Text } from "../ink.js";
import { Select } from "./CustomSelect/index.js";
import { ConfigurableShortcutHint } from "./ConfigurableShortcutHint.js";
import { Byline } from "./design-system/Byline.js";
import { KeyboardShortcutHint } from "./design-system/KeyboardShortcutHint.js";
import {
  getAPIProviderLabel,
  getCurrentSelectableProvider,
  getProviderSelectionValue,
  listProviderConnectionInfo,
  toSelectableAPIProvider,
  type SelectableAPIProvider,
} from "../utils/providerSelection.js";

type Props = {
  onSelect: (provider: SelectableAPIProvider) => void;
  onCancel?: () => void;
  headerText?: string;
};

function renderSectionTitle(title: string, count: number): React.ReactNode {
  return (
    <Text bold color="permission">
      {title} <Text dimColor>({count})</Text>
    </Text>
  );
}

export function ProviderPicker({
  onSelect,
  onCancel,
  headerText,
}: Props): React.ReactNode {
  const current = getCurrentSelectableProvider();
  const items = listProviderConnectionInfo();
  const connected = items.filter((item) => item.connected);
  const available = items.filter((item) => !item.connected);

  const connectedOptions = connected.map((item) => ({
    value: getProviderSelectionValue(item.provider),
    label:
      item.provider === current
        ? `${getAPIProviderLabel(item.provider)} ✓`
        : getAPIProviderLabel(item.provider),
    description: item.badge
      ? `${item.badge} · ${item.description}`
      : item.description,
  }));

  return (
    <Box flexDirection="column" gap={1}>
      <Text dimColor>
        {headerText ??
          "Choose the provider Claude Code should use by default. Connected providers are shown first."}
      </Text>

      <Box flexDirection="column" marginTop={1}>
        <Text>
          Current default: <Text bold>{getAPIProviderLabel(current)}</Text>
        </Text>
      </Box>

      {connected.length > 0 ? (
        <Box flexDirection="column" marginTop={1} gap={1}>
          {renderSectionTitle("Connected Providers", connected.length)}
          <Select
            options={connectedOptions}
            defaultValue={getProviderSelectionValue(current)}
            defaultFocusValue={getProviderSelectionValue(current)}
            onChange={(value) => {
              const provider = toSelectableAPIProvider(String(value));
              if (provider) {
                onSelect(provider);
              }
            }}
            onCancel={onCancel}
            visibleOptionCount={connectedOptions.length}
          />
        </Box>
      ) : null}

      {available.length > 0 ? (
        <Box flexDirection="column" marginTop={1} gap={1}>
          {renderSectionTitle("Available Providers", available.length)}
          <Text dimColor>
            Connect these with their auth commands, then select them here.
          </Text>
          {available.map((item) => (
            <Box key={item.provider} flexDirection="column">
              <Text>{getAPIProviderLabel(item.provider)}</Text>
              <Text dimColor>{item.description}</Text>
            </Box>
          ))}
        </Box>
      ) : null}

      <Text dimColor>
        <Byline>
          <KeyboardShortcutHint shortcut="Enter" action="confirm" />
          <ConfigurableShortcutHint
            action="confirm:no"
            context="Confirmation"
            fallback="Esc"
            description="cancel"
          />
        </Byline>
      </Text>
    </Box>
  );
}
