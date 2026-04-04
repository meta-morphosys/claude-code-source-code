# Claude Code

This repository is a source checkout of Claude Code that runs directly with [Bun](https://bun.sh). It is organized for direct development: application code lives under `src/`, operational scripts live under `scripts/`, and repository docs live under `docs/`.

## Prerequisites

- **[Bun](https://bun.sh)** installed and on your `PATH` (latest stable is recommended).
- API access: **Anthropic** (`claude login`) or **OpenRouter** (see below).

## Repository layout

```text
.
├── docs/        Maintainer and architecture notes
├── public/      Static assets
├── scripts/     Local automation and code generation
└── src/         Application source
```

Key source areas:

- `src/entrypoints/`: Bun entrypoints and SDK-facing contracts
- `src/cli/`: CLI transport and command wiring
- `src/commands/`: command implementations
- `src/components/`: Ink UI components
- `src/services/`: integrations and orchestration
- `src/tools/`: tool implementations and prompts
- `src/utils/`: shared infrastructure and helpers

See `docs/architecture.md` for the source tree map.

## Install and run

1. Clone the repo and `cd` into it:

   ```bash
   git clone https://github.com/ashish200729/claude-code.git
   cd claude-code
   ```

2. Install dependencies:

   ```bash
   bun install
   ```

3. Start the CLI from source (from this directory, or via a global link):

   ```bash
   bun src/entrypoints/cli.tsx
   ```

   Optional: a global **`ashishcode`** command (same CLI as `bun src/entrypoints/cli.tsx`, with a few extra env vars for parallel tool execution):

   ```bash
   bun link --global
   ashishcode
   ```

   Backward-compatible local alias:

   ```bash
   claude-local
   ```

There is no separate production build for day-to-day use: the entrypoint is `src/entrypoints/cli.tsx`. The shipped product is a different package; here you run the repo directly.

## Common scripts

```bash
bun run cli
node scripts/emit-core-types.mjs
node scripts/emit-control-types.mjs
```

## Validation

Minimal smoke check:

```bash
bun run cli --help
```

## Fork workflow

1. Fork the repository.
2. Clone your fork.
3. Run `bun install`.
4. Start the CLI with `bun run cli`.
5. Make changes inside `src/` and keep repository-level scripts and docs in sync when entrypoints move.

---

## OpenRouter — set the API key from the CLI

The key is stored in Claude Code’s **global** config: `~/.claude.json` → `env`, together with the flag that routes traffic to OpenRouter.

### Save the API key (one-time)

Pick one approach (the binary is named `claude` in `--help`; from source use `bun src/entrypoints/cli.tsx`, `ashishcode`, or `claude-local`):

```bash
# pass the key as an argument
bun src/entrypoints/cli.tsx auth openrouter set sk-or-v1-...

# or use OPENROUTER_API_KEY if it is already exported in your shell
bun src/entrypoints/cli.tsx auth openrouter set

# or pipe from stdin (handy for secrets)
echo "$OPENROUTER_API_KEY" | bun src/entrypoints/cli.tsx auth openrouter set --stdin
```

After a successful run, new sessions default to OpenRouter (`OPENROUTER_API_KEY` and `CLAUDE_CODE_USE_OPENROUTER=1` are written to config).

### Force Anthropic for a single session

```bash
bun src/entrypoints/cli.tsx --api-provider anthropic
```

### Remove the saved OpenRouter key from global config

```bash
bun src/entrypoints/cli.tsx auth openrouter clear
```

_(This only clears what is stored in `~/.claude.json` — not a key you export manually in the shell.)_

### Optional environment variables

| Variable                  | Purpose                                 |
| ------------------------- | --------------------------------------- |
| `OPENROUTER_BASE_URL`     | Defaults to `https://openrouter.ai/api` |
| `OPENROUTER_HTTP_REFERER` | HTTP `Referer` for OpenRouter           |
| `OPENROUTER_APP_TITLE`    | App title sent to OpenRouter            |

---

## Choosing a model in the CLI: `/model`

In an **interactive** session:

- **`/model`** — opens the interactive model picker.
- **`/model sonnet`**, **`/model opus`**, **`/model haiku`**, etc. — set the model by **alias** when your account/org allows it.
- **`/model default`** — revert to the default from your settings.

You can also pass a **full model id** for the active provider — with OpenRouter, ids look like their catalog (`anthropic/claude-sonnet-4.6`, `openai/gpt-4o`, …). What actually works depends on OpenRouter and any org allowlist.

From the shell (before the REPL):

```bash
bun src/entrypoints/cli.tsx --api-provider openrouter --model anthropic/claude-sonnet-4.6
```

---

## Quick checklist

1. `bun install`
2. `bun src/entrypoints/cli.tsx auth openrouter set <key>` _(or `claude login` for Anthropic)_
3. `bun src/entrypoints/cli.tsx` → use **`/model`** inside the session to switch models

If something fails, confirm `bun --version` works and your key is valid for [OpenRouter](https://openrouter.ai/).

## Publish as `ashishcode`

Local release checks:

```bash
bun run test:release
bun run cli --help
npm pack --dry-run
```

Publish the public package:

```bash
npm login
npm publish --access public
```

Install globally after publish:

```bash
npm i -g ashishcode
ashishcode
```

This package runs the source CLI through Bun, so Bun must be installed on the target machine.
