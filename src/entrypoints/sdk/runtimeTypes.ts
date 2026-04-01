/**
 * Runtime / callback-heavy SDK types. In the full tree this file is hand-maintained;
 * for partial checkouts we mirror the published Agent SDK surface.
 */
export type {
  AnyZodRawShape,
  EffortLevel,
  ForkSessionOptions,
  ForkSessionResult,
  GetSessionInfoOptions,
  GetSessionMessagesOptions,
  InferShape,
  ListSessionsOptions,
  McpSdkServerConfigWithInstance,
  Options,
  Query,
  SDKSession,
  SDKSessionOptions,
  SdkMcpToolDefinition,
  SessionMessage,
  SessionMutationOptions,
} from '@anthropic-ai/claude-agent-sdk'

import type { Options, Query } from '@anthropic-ai/claude-agent-sdk'

/** @internal — overload branch for `query()`; same shape as public Options in practice */
export type InternalOptions = Options
/** @internal */
export type InternalQuery = Query
