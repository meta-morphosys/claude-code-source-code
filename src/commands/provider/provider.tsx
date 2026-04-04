import chalk from "chalk";
import * as React from "react";
import { Box, Text } from "../../ink.js";
import { Select } from "../../components/CustomSelect/index.js";
import TextInput from "../../components/TextInput.js";
import { ConfigurableShortcutHint } from "../../components/ConfigurableShortcutHint.js";
import { ConsoleOAuthFlow } from "../../components/ConsoleOAuthFlow.js";
import { Dialog } from "../../components/design-system/Dialog.js";
import {
  clearCopilotAuth,
  loginWithCopilotDeviceFlow,
  refreshCopilotModelOptionsCache,
} from "../../services/copilot/provider.js";
import {
  applyOpenRouterAuthToProcess,
  clearOpenRouterAuth,
  refreshOpenRouterModelOptionsCache,
} from "../../services/openrouter/provider.js";
import { useSetAppState } from "../../state/AppState.js";
import type {
  LocalJSXCommandCall,
  LocalJSXCommandOnDone,
} from "../../types/command.js";
import { saveGlobalConfig } from "../../utils/config.js";
import { errorMessage } from "../../utils/errors.js";
import { stripSignatureBlocks } from "../../utils/messages.js";
import { getAPIProvider } from "../../utils/model/providers.js";
import {
  activateProvider,
  getAPIProviderLabel,
  getCLIProviderName,
  getCurrentSelectableProvider,
  getFallbackSelectableProvider,
  getProviderConnectionInfo,
  getProviderOnboardingHint,
  isSelectableAPIProvider,
  listProviderConnectionInfo,
  toSelectableAPIProvider,
  type SelectableAPIProvider,
} from "../../utils/providerSelection.js";
import { handleLoginResult } from "../login/login.js";
import { performLogout } from "../logout/logout.js";

type CommandContext = Parameters<LocalJSXCommandCall>[1];
type ManagerView =
  | "providers"
  | "actions"
  | "connect-anthropic"
  | "connect-openrouter"
  | "connect-copilot-deployment"
  | "connect-copilot-enterprise";

function getDisplayedCurrentProviderLabel(): string {
  const runtimeProvider = getAPIProvider();
  if (isSelectableAPIProvider(runtimeProvider)) {
    return getAPIProviderLabel(getCurrentSelectableProvider());
  }
  return `${getAPIProviderLabel(runtimeProvider)} (externally controlled)`;
}

function buildProviderMessage(provider: SelectableAPIProvider): string {
  const label = getAPIProviderLabel(provider);
  const hint = getProviderOnboardingHint(provider);
  return hint
    ? `Set provider to ${chalk.bold(label)}. ${hint}`
    : `Set provider to ${chalk.bold(label)}`;
}

function syncProviderState(
  context: CommandContext,
  setAppState: ReturnType<typeof useSetAppState>,
  providerWasChanged: boolean,
): void {
  context.onChangeAPIKey();
  context.setMessages(stripSignatureBlocks);
  setAppState((prev) => ({
    ...prev,
    mainLoopModel: null,
    mainLoopModelForSession: null,
    ...(providerWasChanged ? { authVersion: prev.authVersion + 1 } : {}),
  }));
}

async function applyProviderSelection(
  provider: SelectableAPIProvider,
  onDone: LocalJSXCommandOnDone,
  context: CommandContext,
  setAppState: ReturnType<typeof useSetAppState>,
): Promise<void> {
  const info = getProviderConnectionInfo(provider);
  if (provider !== "firstParty" && !info.connected) {
    onDone(
      getProviderOnboardingHint(provider) ??
        `${info.label} is not connected yet.`,
      { display: "system" },
    );
    return;
  }

  try {
    const changed = provider !== getCurrentSelectableProvider();
    await activateProvider(provider);
    syncProviderState(context, setAppState, changed);
    onDone(buildProviderMessage(provider), { display: "system" });
  } catch (error) {
    onDone(`Failed to switch provider: ${errorMessage(error)}`, {
      display: "system",
    });
  }
}

async function disconnectProvider(
  provider: SelectableAPIProvider,
  context: CommandContext,
  setAppState: ReturnType<typeof useSetAppState>,
): Promise<string> {
  const wasCurrent = getCurrentSelectableProvider() === provider;

  if (provider === "copilot") {
    clearCopilotAuth();
  } else if (provider === "openrouter") {
    clearOpenRouterAuth();
  } else {
    await performLogout({ clearOnboarding: false });
  }

  if (wasCurrent) {
    await activateProvider(getFallbackSelectableProvider());
  }

  syncProviderState(context, setAppState, true);

  if (provider === "copilot") {
    return "Disconnected GitHub Copilot.";
  }
  if (provider === "openrouter") {
    return "Disconnected OpenRouter.";
  }
  return "Logged out from Anthropic.";
}

function ProviderManagerDialog({
  onDone,
  context,
}: {
  onDone: LocalJSXCommandOnDone;
  context: CommandContext;
}): React.ReactNode {
  const setAppState = useSetAppState();
  const [view, setView] = React.useState<ManagerView>("providers");
  const [selectedProvider, setSelectedProvider] = React.useState(
    getCurrentSelectableProvider(),
  );
  const [activeProviderSection, setActiveProviderSection] = React.useState<
    "connected" | "available"
  >("connected");
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [inputValue, setInputValue] = React.useState("");
  const [cursorOffset, setCursorOffset] = React.useState(0);

  const items = listProviderConnectionInfo();
  const current = getCurrentSelectableProvider();
  const connected = items.filter((item) => item.connected);
  const available = items.filter((item) => !item.connected);
  const selectedInfo = getProviderConnectionInfo(selectedProvider);

  React.useEffect(() => {
    if (connected.length === 0 && available.length > 0) {
      setActiveProviderSection("available");
      return;
    }
    if (available.length === 0 && connected.length > 0) {
      setActiveProviderSection("connected");
    }
  }, [available.length, connected.length]);

  const providerOptions = connected.map((item) => ({
    value: getCLIProviderName(item.provider),
    label: item.provider === current ? `${item.label} ✓` : item.label,
  }));

  const actionOptions = [
    ...(selectedInfo.connected && selectedProvider !== current
      ? [
          {
            label: `Use ${selectedInfo.label} as default`,
            value: "activate",
            description: "Switch future sessions to this provider",
          },
        ]
      : []),
    ...(selectedInfo.connected &&
    (selectedProvider === "copilot" || selectedProvider === "openrouter")
      ? [
          {
            label: "Refresh model list",
            value: "refresh-models",
            description:
              selectedProvider === "copilot"
                ? "Fetch the latest GitHub Copilot models"
                : "Fetch the latest OpenRouter models",
          },
        ]
      : []),
    ...(selectedInfo.connected
      ? [
          {
            label: selectedProvider === "firstParty" ? "Log out" : "Disconnect",
            value: "disconnect",
            description:
              selectedProvider === "firstParty"
                ? "Clear Anthropic account credentials"
                : `Remove saved ${selectedInfo.label} credentials`,
          },
        ]
      : [
          {
            label: "Connect",
            value: "connect",
            description:
              selectedProvider === "firstParty"
                ? "Use the Anthropic login flow"
                : `Connect ${selectedInfo.label}`,
          },
        ]),
    {
      label: "Back",
      value: "back",
      description: "Return to provider list",
    },
  ];

  const finishProviderConnect = React.useCallback(
    async (provider: SelectableAPIProvider): Promise<void> => {
      const changed = provider !== getCurrentSelectableProvider();
      await activateProvider(provider);
      syncProviderState(context, setAppState, changed);
    },
    [context, setAppState],
  );

  async function handleAction(action: string): Promise<void> {
    if (action === "back") {
      setView("providers");
      return;
    }

    if (action === "activate") {
      await applyProviderSelection(
        selectedProvider,
        onDone,
        context,
        setAppState,
      );
      return;
    }

    if (action === "connect") {
      if (selectedProvider === "firstParty") {
        setView("connect-anthropic");
        return;
      }

      if (selectedProvider === "openrouter") {
        setInputValue("");
        setCursorOffset(0);
        setView("connect-openrouter");
        return;
      }

      if (selectedProvider === "copilot") {
        setView("connect-copilot-deployment");
        return;
      }
    }

    if (action === "refresh-models") {
      try {
        if (selectedProvider === "copilot") {
          await refreshCopilotModelOptionsCache();
        } else if (selectedProvider === "openrouter") {
          await refreshOpenRouterModelOptionsCache();
        }
        setRefreshKey((key) => key + 1);
        onDone(`Refreshed ${selectedInfo.label} models.`, {
          display: "system",
        });
      } catch (error) {
        onDone(`Failed to refresh models: ${errorMessage(error)}`, {
          display: "system",
        });
      }
      return;
    }

    if (action === "disconnect") {
      try {
        const message = await disconnectProvider(
          selectedProvider,
          context,
          setAppState,
        );
        onDone(message, { display: "system" });
      } catch (error) {
        onDone(`Failed to disconnect provider: ${errorMessage(error)}`, {
          display: "system",
        });
      }
    }
  }

  return (
    <Dialog
      title="Provider"
      inputGuide={
        view === "connect-anthropic"
          ? (exitState) =>
              exitState.pending ? (
                <Text>Press {exitState.keyName} again to exit</Text>
              ) : (
                <ConfigurableShortcutHint
                  action="confirm:no"
                  context="Confirmation"
                  fallback="Esc"
                  description="back"
                />
              )
          : undefined
      }
      onCancel={() =>
        view === "providers"
          ? onDone(
              `Kept provider as ${chalk.bold(getDisplayedCurrentProviderLabel())}`,
              { display: "system" },
            )
          : setView("providers")
      }
      color="permission"
    >
      {view === "providers" ? (
        <Box flexDirection="column" gap={1}>
          <Text dimColor>Select a connected provider to manage it.</Text>

          {connected.length > 0 ? (
            <Box flexDirection="column" marginTop={1} gap={1}>
              <Text bold color="permission">
                Connected Providers <Text dimColor>({connected.length})</Text>
              </Text>
              <Select
                key={`connected-${refreshKey}`}
                options={providerOptions}
                defaultValue={getCLIProviderName(current)}
                defaultFocusValue={getCLIProviderName(current)}
                isDisabled={activeProviderSection !== "connected"}
                onFocus={() => {
                  setActiveProviderSection("connected");
                }}
                onChange={(value) => {
                  const provider = toSelectableAPIProvider(String(value));
                  if (!provider) return;
                  setSelectedProvider(provider);
                  setView("actions");
                }}
                onDownFromLastItem={
                  available.length > 0
                    ? () => {
                        setActiveProviderSection("available");
                      }
                    : undefined
                }
                onCancel={() =>
                  onDone(
                    `Kept provider as ${chalk.bold(getDisplayedCurrentProviderLabel())}`,
                    { display: "system" },
                  )
                }
                visibleOptionCount={providerOptions.length}
              />
            </Box>
          ) : null}

          {available.length > 0 ? (
            <Box flexDirection="column" marginTop={1} gap={1}>
              <Text bold color="permission">
                Available Providers <Text dimColor>({available.length})</Text>
              </Text>
              <Select
                key={`available-${refreshKey}`}
                options={available.map((item) => ({
                  value: getCLIProviderName(item.provider),
                  label: item.label,
                  description: item.description,
                }))}
                isDisabled={activeProviderSection !== "available"}
                defaultFocusValue={
                  available[0]
                    ? getCLIProviderName(available[0].provider)
                    : undefined
                }
                onFocus={() => {
                  setActiveProviderSection("available");
                }}
                onChange={(value) => {
                  const provider = toSelectableAPIProvider(String(value));
                  if (!provider) return;
                  setSelectedProvider(provider);
                  setView("actions");
                }}
                onUpFromFirstItem={
                  connected.length > 0
                    ? () => {
                        setActiveProviderSection("connected");
                      }
                    : undefined
                }
                onCancel={() =>
                  onDone(
                    `Kept provider as ${chalk.bold(getDisplayedCurrentProviderLabel())}`,
                    { display: "system" },
                  )
                }
                visibleOptionCount={available.length}
              />
            </Box>
          ) : null}

          {connected.length > 0 && available.length > 0 ? (
            <Text dimColor>
              Tip: press ↓ on the last connected provider to jump to Available
              Providers, or ↑ on the first available provider to return. Press
              Enter on an available provider to open its connect flow.
            </Text>
          ) : available.length > 0 ? (
            <Text dimColor>
              Tip: select an available provider and press Enter to open its
              connect flow.
            </Text>
          ) : null}
        </Box>
      ) : view === "actions" ? (
        <Box flexDirection="column" gap={1}>
          <Text bold>{selectedInfo.label}</Text>
          {selectedProvider === current ? (
            <Text color="success">Current default provider</Text>
          ) : (
            <Text dimColor>Not the current default provider</Text>
          )}

          <Box flexDirection="column" marginTop={1}>
            {selectedInfo.detailLines.map((line) => (
              <Text key={line}>{line}</Text>
            ))}
          </Box>

          <Box flexDirection="column" marginTop={1} gap={1}>
            <Text bold color="permission">
              Actions
            </Text>
            <Select
              key={`actions-${selectedProvider}-${refreshKey}`}
              options={actionOptions}
              defaultFocusValue={actionOptions[0]?.value}
              onChange={(value) => {
                void handleAction(String(value));
              }}
              onCancel={() => setView("providers")}
              visibleOptionCount={actionOptions.length}
            />
          </Box>
        </Box>
      ) : view === "connect-anthropic" ? (
        <Box flexDirection="column" gap={1}>
          <Text bold>Connect Anthropic</Text>
          <ConsoleOAuthFlow
            startingMessage="Sign in with your Anthropic account to use the Anthropic provider."
            onDone={async () => {
              try {
                await handleLoginResult(true, context);
                await activateProvider("firstParty");
                syncProviderState(context, setAppState, false);
                onDone(buildProviderMessage("firstParty"), {
                  display: "system",
                });
              } catch (error) {
                onDone(`Failed to connect Anthropic: ${errorMessage(error)}`, {
                  display: "system",
                });
              }
            }}
          />
        </Box>
      ) : view === "connect-openrouter" ? (
        <Box flexDirection="column" gap={1}>
          <Text bold>Connect OpenRouter</Text>
          <Text dimColor>
            Paste an OpenRouter API key to connect and load its model catalog.
          </Text>
          <Box flexDirection="row" gap={1}>
            <Text>&gt;</Text>
            <TextInput
              value={inputValue}
              onChange={(value) => {
                setInputValue(value);
                setCursorOffset(value.length);
              }}
              onSubmit={async (value) => {
                const key = value.trim();
                if (!key) return;
                saveGlobalConfig((currentConfig) => {
                  const nextEnv = { ...currentConfig.env };
                  nextEnv.OPENROUTER_API_KEY = key;
                  return { ...currentConfig, env: nextEnv };
                });
                applyOpenRouterAuthToProcess(key);
                try {
                  await refreshOpenRouterModelOptionsCache();
                  await finishProviderConnect("openrouter");
                  onDone(buildProviderMessage("openrouter"), {
                    display: "system",
                  });
                } catch (error) {
                  onDone(
                    `Failed to connect OpenRouter: ${errorMessage(error)}`,
                    { display: "system" },
                  );
                }
              }}
              focus
              showCursor
              mask="*"
              columns={80}
              cursorOffset={cursorOffset}
              onChangeCursorOffset={setCursorOffset}
            />
          </Box>
        </Box>
      ) : view === "connect-copilot-deployment" ? (
        <Box flexDirection="column" gap={1}>
          <Text bold>Connect GitHub Copilot</Text>
          <Text dimColor>
            Choose whether you use GitHub.com or GitHub Enterprise.
          </Text>
          <Select
            options={[
              {
                label: "GitHub.com",
                value: "github.com",
                description: "Public GitHub Copilot",
              },
              {
                label: "GitHub Enterprise",
                value: "enterprise",
                description: "Data residency or self-hosted GitHub Enterprise",
              },
            ]}
            defaultFocusValue="github.com"
            onChange={(value) => {
              if (value === "enterprise") {
                setInputValue("");
                setCursorOffset(0);
                setView("connect-copilot-enterprise");
                return;
              }
              void (async () => {
                try {
                  await loginWithCopilotDeviceFlow();
                  await finishProviderConnect("copilot");
                  onDone(buildProviderMessage("copilot"), {
                    display: "system",
                  });
                } catch (error) {
                  onDone(
                    `Failed to connect GitHub Copilot: ${errorMessage(error)}`,
                    { display: "system" },
                  );
                }
              })();
            }}
            onCancel={() => setView("actions")}
            visibleOptionCount={2}
          />
        </Box>
      ) : (
        <Box flexDirection="column" gap={1}>
          <Text bold>GitHub Enterprise URL</Text>
          <Text dimColor>Enter your GitHub Enterprise URL or hostname.</Text>
          <Box flexDirection="row" gap={1}>
            <Text>&gt;</Text>
            <TextInput
              value={inputValue}
              onChange={(value) => {
                setInputValue(value);
                setCursorOffset(value.length);
              }}
              onSubmit={async (value) => {
                const enterpriseUrl = value.trim();
                if (!enterpriseUrl) return;
                try {
                  await loginWithCopilotDeviceFlow({ enterpriseUrl });
                  await finishProviderConnect("copilot");
                  onDone(buildProviderMessage("copilot"), {
                    display: "system",
                  });
                } catch (error) {
                  onDone(
                    `Failed to connect GitHub Copilot: ${errorMessage(error)}`,
                    { display: "system" },
                  );
                }
              }}
              focus
              showCursor
              placeholder="company.ghe.com"
              columns={80}
              cursorOffset={cursorOffset}
              onChangeCursorOffset={setCursorOffset}
            />
          </Box>
        </Box>
      )}
    </Dialog>
  );
}

function SetProviderAndClose({
  provider,
  onDone,
  context,
}: {
  provider: SelectableAPIProvider;
  onDone: LocalJSXCommandOnDone;
  context: CommandContext;
}): React.ReactNode {
  const setAppState = useSetAppState();

  React.useEffect(() => {
    void applyProviderSelection(provider, onDone, context, setAppState);
  }, [provider, onDone, context, setAppState]);

  return null;
}

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const runtimeProvider = getAPIProvider();
  if (!isSelectableAPIProvider(runtimeProvider)) {
    onDone(
      `Provider switching is unavailable while using ${chalk.bold(
        getAPIProviderLabel(runtimeProvider),
      )}. This session is controlled by external provider configuration.`,
      { display: "system" },
    );
    return null;
  }

  const trimmed = args.trim();
  if (!trimmed) {
    return <ProviderManagerDialog onDone={onDone} context={context} />;
  }

  if (trimmed === "show" || trimmed === "status" || trimmed === "current") {
    onDone(
      `Current provider: ${chalk.bold(getDisplayedCurrentProviderLabel())}`,
      {
        display: "system",
      },
    );
    return null;
  }

  const provider = toSelectableAPIProvider(trimmed);
  if (!provider) {
    onDone(
      `Unknown provider '${trimmed}'. Use anthropic, openrouter, or copilot.`,
      { display: "system" },
    );
    return null;
  }

  return (
    <SetProviderAndClose
      provider={provider}
      onDone={onDone}
      context={context}
    />
  );
};
