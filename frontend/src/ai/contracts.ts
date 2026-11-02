import type { z } from 'zod';

/** Public context only. Never include OAuth tokens, secrets or host service instances. */
export interface AgentContext {
  scope: string;
  scopeId: string;
  locale: string;
  timezone?: string;
  permissions: readonly string[];
}
export interface Attachment { name: string; mimeType: string; data: string }
export type FilePart = { text: string } | { attachment: Attachment };
export type Part =
  | FilePart
  | { call: { name: string; args: unknown } }
  | { result: { name: string; response: ToolResult } };
export interface Message {
  role: 'user' | 'model';
  parts: Part[];
  /** Provider-owned response content, e.g. signed Gemini thought parts. Never interpret in core. */
  opaque?: unknown;
}
export interface ToolResult {
  status: 'success' | 'cancelled' | 'validation_error' | 'permission_denied' | 'conflict' | 'error';
  data?: unknown;
  message?: string;
}
export interface Change {
  operation: 'create' | 'update' | 'delete' | 'reorder';
  target?: string;
  before?: unknown;
  after?: unknown;
}
export interface Preview { summary: string; changes: Change[]; warnings?: string[] }
export interface PendingPreview extends Preview { id: string; scopeId: string; toolName: string }
export interface PreparedChange {
  preview: Preview;
  /** Must recheck host authorization and source snapshot. No automatic retry. */
  commit(context: AgentContext, signal: AbortSignal): Promise<ToolResult>;
}
export interface Tool {
  name: string;
  description: string;
  risk: 'read' | 'write' | 'destructive';
  /** Host renders decision results; finish the turn without a model follow-up. */
  finishAfterDecision?: boolean;
  schema: z.ZodType;
  enabled(context: AgentContext): boolean;
  execute?(input: unknown, context: AgentContext, signal: AbortSignal): Promise<ToolResult>;
  prepare?(input: unknown, context: AgentContext, signal: AbortSignal): Promise<PreparedChange>;
}
export interface ToolDeclaration { name: string; description: string; parameters: Record<string, unknown> }
export interface ProviderRequest {
  system: string;
  context: AgentContext;
  messages: Message[];
  tools: ToolDeclaration[];
  signal: AbortSignal;
}
export interface Provider { generate(request: ProviderRequest): Promise<Omit<Message, 'role'>> }
export type AgentStatus = 'idle' | 'running' | 'awaiting_confirmation' | 'committing' | 'error' | 'disposed';
export interface AgentState {
  status: AgentStatus;
  messages: Message[];
  results: ToolResult[];
  pending?: PendingPreview;
  error?: string;
  errorCode?: 'rate_limit' | 'model_unavailable';
}
export interface AgentOptions {
  provider: Provider;
  tools: readonly Tool[];
  getContext(): AgentContext;
  system?: string;
  maxTurns?: number;
  maxToolCalls?: number;
  maxMessages?: number;
  maxInputChars?: number;
}
