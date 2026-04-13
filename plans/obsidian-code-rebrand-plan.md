# Obsidian Code Rebrand Plan

## Brand Mapping

| Aspect | Old Value | New Value |
|--------|-----------|-----------|
| Product name | Claude Code | Obsidian Code |
| npm package | `ashishcode` | `obsidian-code` |
| CLI binary (primary) | `ashishcode` | `obsidian` |
| CLI binary (compat alias) | `claude-local` | `obsidian-local` |
| Launcher script | `scripts/ashishcode.mjs` | `scripts/obsidian.mjs` |
| GitHub repo | `ashish200729/claude-code` | `meta-morphosys/obsidian-code` |
| User agent | `claude-code/{version}` | `obsidian-code/{version}` |
| System prompt identity | "You are Claude Code, Anthropic's official CLI..." | "You are Obsidian Code, a CLI-based agentic coding tool..." |
| Version | `0.1.1` | `0.1.1` (unchanged - no major bump) |

## Scope Rules

**DO rebrand:**
- Package metadata, CLI binary names, launcher scripts
- User-facing strings (prompts, error messages, notifications, help text, UI labels)
- Repository URLs pointing to the old GitHub repo
- System prompt identity strings
- Service names in telemetry/tracing (cosmetic identifiers only)
- Documentation (README, architecture docs)
- Product URL constant

**DO NOT rebrand:**
- Upstream Anthropic API endpoints (`/api/claude_code/*`) -- these are server contracts
- Upstream OAuth scopes (`user:sessions:claude_code`) -- server-side identifiers
- Generated protobuf types (`claude_code_internal_event.ts`) -- generated code
- Environment variable names (`CLAUDE_CODE_*`) -- would break existing user configs
- Internal Anthropic references in comments citing upstream issues (`anthropics/claude-code#12345`)
- Beta header values (`claude-code-20250219`) -- API contract
- Upstream package references (`@anthropic-ai/claude-code`) -- dependency identity
- `~/.claude/` config directory path -- would break existing installs
- Marketplace/plugin references to `claude-code-marketplace` -- external dependency

## Implementation Steps

### Phase 1: Package Identity and Scripts

1. **Rename `package.json` identity**
   - `name`: `"ashishcode"` to `"obsidian-code"`
   - `description`: update to reference Obsidian Code
   - `bin`: `"ashishcode"` to `"obsidian"`, `"claude-local"` to `"obsidian-local"`
   - `files`: update script path references
   - `repository.url`: to `git+https://github.com/meta-morphosys/obsidian-code.git`
   - `homepage`: to `https://github.com/meta-morphosys/obsidian-code`
   - `bugs.url`: to `https://github.com/meta-morphosys/obsidian-code/issues`

2. **Rename launcher script file**
   - `scripts/ashishcode.mjs` to `scripts/obsidian.mjs`
   - Update comments inside the script (the "ashishcode" references in docs/jsdoc)
   - Rename `scripts/claude-local.mjs` to `scripts/obsidian-local.mjs`
   - Update comments inside `obsidian-local.mjs`

### Phase 2: Core Constants and Identity

3. **Update `src/constants/product.ts`**
   - `PRODUCT_URL`: point to new product page or GitHub repo

4. **Update `src/constants/system.ts`**
   - `DEFAULT_PREFIX`: `"You are Obsidian Code, a CLI-based agentic coding tool."`
   - `AGENT_SDK_CLAUDE_CODE_PRESET_PREFIX`: update similarly

5. **Update `src/entrypoints/cli.tsx`**
   - MACRO shim: update `FEEDBACK_CHANNEL` and `ISSUES_EXPLAINER` URLs to `meta-morphosys/obsidian-code`
   - Version output string: `"(Claude Code)"` to `"(Obsidian Code)"`

6. **Update `src/constants/prompts.ts`**
   - All user-facing prompt strings referencing "Claude Code"
   - `DEFAULT_AGENT_PROMPT`: rebrand identity
   - Help text items referencing "Claude Code"

### Phase 3: User-Facing Strings (UI, Commands, Messages)

7. **CLI description and help text** in `src/main.tsx`
   - `.description()` string: "Claude Code" to "Obsidian Code"
   - Version display: `"(Claude Code)"` to `"(Obsidian Code)"`
   - All user-visible strings containing "Claude Code"

8. **Command descriptions** - update `description` fields in:
   - `src/commands/status/index.ts`
   - `src/commands/stats/index.ts`
   - `src/commands/doctor/index.ts`
   - `src/commands/feedback/index.ts`
   - `src/commands/stickers/index.ts`
   - `src/commands/model/index.ts`
   - `src/commands/passes/index.ts`
   - `src/commands/plugin/index.tsx`
   - `src/commands/install.tsx`
   - `src/commands/statusline.tsx`
   - `src/commands/init.ts`
   - `src/commands/review.ts`
   - `src/commands/ultraplan.tsx`
   - `src/commands/thinkback/index.ts`
   - Other commands referencing "Claude Code"

9. **Error messages and notifications** - update user-facing strings in:
   - `src/cli/update.ts` (update instructions)
   - `src/setup.ts` (Node.js version error)
   - `src/services/notifier.ts` (`DEFAULT_TITLE`)
   - `src/services/rateLimitMessages.ts`
   - `src/services/api/errors.ts`
   - `src/services/voice.ts`
   - `src/services/tips/tipRegistry.ts`

10. **UI component text** - update user-facing labels in:
    - `src/components/ConsoleOAuthFlow.tsx`
    - `src/components/Onboarding.tsx`
    - `src/components/HelpV2/HelpV2.tsx`
    - `src/components/BypassPermissionsModeDialog.tsx`
    - `src/components/IdeOnboardingDialog.tsx`
    - `src/components/permissions/PermissionRequest.tsx`
    - `src/components/ResumeTask.tsx`
    - `src/components/Stats.tsx`
    - `src/components/DesktopUpsell/DesktopUpsellStartup.tsx`
    - `src/screens/REPL.tsx` (terminal title default, suspend messages)
    - Other components with "Claude Code" in visible text

### Phase 4: Telemetry and Service Identifiers

11. **Telemetry service names** (cosmetic, safe to change):
    - `src/utils/telemetry/instrumentation.ts`: `service.name` attribute
    - `src/utils/telemetry/sessionTracing.ts`: tracer name
    - `src/services/analytics/firstPartyEventLogger.ts`: service name
    - `src/services/analytics/datadog.ts`: service/hostname
    - `src/utils/userAgent.ts`: user agent string
    - `src/services/mcp/client.ts`: MCP client name/title

12. **OTel counter metric names** in `src/bootstrap/state.ts`
    - Rename `claude_code.*` metric prefixes to `obsidian_code.*`

### Phase 5: Agent Prompts and Skills

13. **Agent system prompts** - rebrand identity in:
    - `src/tools/AgentTool/built-in/exploreAgent.ts`
    - `src/tools/AgentTool/built-in/planAgent.ts`
    - `src/tools/AgentTool/built-in/claudeCodeGuideAgent.ts` (rename agent type too)
    - `src/tools/AgentTool/built-in/statuslineSetup.ts`
    - `src/coordinator/coordinatorMode.ts`
    - `src/memdir/findRelevantMemories.ts`

14. **Skills** - update user-facing text in:
    - `src/skills/bundled/updateConfig.ts`
    - `src/skills/bundled/debug.ts`
    - `src/skills/bundled/stuck.ts`
    - `src/skills/bundled/keybindings.ts`
    - `src/skills/bundled/scheduleRemoteAgents.ts`

### Phase 6: Miscellaneous

15. **Attribution strings** in `src/utils/attribution.ts`
    - "Generated with Claude Code" to "Generated with Obsidian Code"

16. **Keybindings schema** in `src/keybindings/template.ts` and `src/keybindings/schema.ts`
    - Schema description text

17. **Browser extension / Chrome integration** in:
    - `src/utils/claudeInChrome/setup.ts` (native host description)
    - `src/utils/claudeInChrome/mcpServer.ts`

18. **GitHub Actions / workflow constants** in `src/constants/github-app.ts`
    - PR title, PR body, workflow names
    - Note: keep `anthropics/claude-code-action@v1` references as-is (external dependency)

19. **Settings and MDM descriptions** in:
    - `src/utils/settings/types.ts`
    - `src/utils/settings/constants.ts`
    - `src/utils/settings/mdm/constants.ts`

20. **Completion cache** in `src/utils/completionCache.ts`
    - Shell completion comment text

### Phase 7: Documentation

21. **README.md** - full rewrite of brand references:
    - Title, description, clone URLs, command examples
    - All `ashishcode` references to `obsidian`
    - All GitHub URLs to `meta-morphosys/obsidian-code`

22. **docs/architecture.md** - minor, mostly structural (low brand density)

## Risk Assessment

**Low risk (safe find-and-replace):**
- README.md, docs, command descriptions, UI labels, error messages

**Medium risk (verify behavior after change):**
- Package.json identity and bin entries
- Launcher script rename
- System prompt identity strings (affects model behavior)
- Telemetry metric names (dashboards may break)

**Do not touch (would break functionality):**
- API endpoint paths (`/api/claude_code/*`)
- Environment variable names (`CLAUDE_CODE_*`)
- OAuth scopes and redirect URLs
- Generated protobuf field names
- Upstream Anthropic package references
- Beta header strings
- Config directory paths (`~/.claude/`)

## Suggested Execution Order

Implement phases 1-7 sequentially. After each phase, run `bun run test:release` to catch regressions. The whole change should be a single feature branch and PR.

## File Change Summary

Approximately **80-100 files** will be touched. The changes are almost entirely string replacements in:
- 2 JSON files (package.json, potentially tsconfig)
- 2 script files (launchers)
- ~15 constant/config TS files
- ~30 command/skill TS files  
- ~30 component TSX files
- ~20 utility/service TS files
- 2 markdown docs
