import type { Message, ToolResult } from '../contracts.ts';

export function thinkingDuration(elapsedSeconds: number): string {
  const seconds = Math.max(0, Math.floor(elapsedSeconds));
  return seconds < 60 ? `${seconds}秒` : `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
}

export interface ChatEntry {
  id: number;
  role: 'user' | 'model' | 'status';
  text: string;
  files: string[];
}
export function lastUserMessage(messages: readonly Message[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role === 'user' && message.parts[0] && 'text' in message.parts[0]) return message.parts[0].text;
  }
  return '';
}
export function questionForReply(messages: readonly Message[], replyId: number): string {
  return lastUserMessage(messages.slice(0, replyId));
}
/** Never expose opaque provider data, tool arguments/results or extracted file contents. */
export function chatEntries(messages: readonly Message[], formatResult?: (name: string, result: ToolResult) => string | null): ChatEntry[] {
  return messages.flatMap<ChatEntry>((message, id) => {
    const result = message.parts.find(part => 'result' in part);
    if (result && 'result' in result) {
      const text = formatResult?.(result.result.name, result.result.response);
      return text ? [{ id, role: 'status' as const, text, files: [] }] : [];
    }
    const text = message.role === 'user'
      ? ('text' in (message.parts[0] || {}) ? (message.parts[0] as {text: string}).text : '')
      : message.parts.flatMap(part => 'text' in part ? [part.text] : []).join('\n');
    const files = message.role === 'user' ? message.parts.slice(1).flatMap(part => {
      if ('attachment' in part) return [part.attachment.name];
      if ('text' in part) {
        try { const value: unknown = JSON.parse(part.text);
          if (value && typeof value === 'object' && 'sourceFile' in value && typeof value.sourceFile === 'string') return [value.sourceFile];
        } catch { /* extraction remains private even if metadata cannot be read */ }
      }
      return [];
    }) : [];
    return text || files.length ? [{ id, role: message.role, text, files }] : [];
  });
}
