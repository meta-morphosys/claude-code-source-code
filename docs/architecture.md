# Architecture Layout

This repository now uses a conventional `src/` layout so application code is separated from project metadata and operational files at the repo root.

## Top-Level Structure

- `src/`: all TypeScript application source
- `scripts/`: repository automation and generation scripts
- `docs/`: maintainership and architecture notes
- `public/`: static assets

## `src/` Structure

- `src/entrypoints/`: Bun-executed and SDK-facing entrypoints
- `src/cli/`: CLI transport and handler wiring
- `src/commands/`: slash-command and command-mode implementations
- `src/components/`: Ink UI components and design primitives
- `src/services/`: service-layer integrations and orchestration
- `src/tools/`: tool definitions, prompts, and tool UIs
- `src/utils/`: cross-cutting utilities and infrastructure helpers
- `src/state/`, `src/context/`, `src/hooks/`: state management and shared runtime context
- `src/types/`, `src/schemas/`, `src/constants/`: stable contracts and shared definitions
- `src/tasks/`, `src/remote/`, `src/server/`, `src/bridge/`, `src/plugins/`, `src/skills/`: specialized runtime subsystems
- `src/native-ts/`: native-adjacent TypeScript modules used by the UI/runtime layer

## Refactor Intent

The reorganization is structural only:

- source modules keep their internal relative layout under `src/`
- repo-level scripts and docs now point at `src/entrypoints/...`
- the `src/*` alias resolves to the actual source tree instead of the repository root

This keeps feature behavior unchanged while making the project easier to navigate, safer to script against, and closer to a production-maintainable repository layout.
