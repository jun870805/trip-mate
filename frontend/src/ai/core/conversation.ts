import { z } from 'zod';
import type { Message } from '../contracts.ts';

const result = z.strictObject({ status: z.enum(['success','cancelled','validation_error','permission_denied','conflict','error']),
  data: z.json().optional(), message: z.string().optional() });
const part = z.union([z.strictObject({text:z.string()}),
  z.strictObject({call:z.strictObject({name:z.string().min(1),args:z.json()})}),
  z.strictObject({result:z.strictObject({name:z.string().min(1),response:result})})]);
const schema = z.strictObject({version:z.literal(1),scope:z.string(),scopeId:z.string(),
  messages:z.array(z.strictObject({role:z.enum(['user','model']),parts:z.array(part).min(1).max(30),opaque:z.json().optional()})).max(80)});
export interface Conversation { version: 1; scope: string; scopeId: string; messages: Message[] }

/** Validate complete tool pairs; restoring history never executes a call or restores authority. */
export function readConversation(value: unknown, scope: string, scopeId: string, maxMessages: number): Conversation {
  const serialized = JSON.stringify(value);
  if (!serialized || new TextEncoder().encode(serialized).byteLength > 1024 * 1024 || /"(?:inlineData|fileData|attachment)"\s*:/.test(serialized))
    throw new Error('對話內容無法恢復。');
  const checkpoint = schema.parse(JSON.parse(serialized));
  if (checkpoint.scope !== scope || checkpoint.scopeId !== scopeId || checkpoint.messages.length > maxMessages)
    throw new Error('對話範圍或版本不符。');
  const awaiting: string[] = [];
  for (const [index, message] of checkpoint.messages.entries()) {
    const isResult = message.parts.some(p => 'result' in p);
    if ((awaiting.length > 0) !== isResult || (index === 0 && message.role !== 'user')) throw new Error('不完整的工具紀錄。');
    for (const part of message.parts) {
      if ('call' in part) {
        if (message.role !== 'model') throw new Error('工具呼叫角色無效。');
        awaiting.push(part.call.name);
      } else if ('result' in part) {
        if (message.role !== 'user' || awaiting.shift() !== part.result.name) throw new Error('工具結果未配對。');
      }
    }
  }
  const last = checkpoint.messages.at(-1);
  // A host-rendered decision may finish on a paired tool result without another model call.
  const completedDecision = last?.role === 'user' && last.parts.every(part => 'result' in part && ['success', 'cancelled'].includes(part.result.response.status));
  if (awaiting.length || (last && last.role !== 'model' && !completedDecision)) throw new Error('對話尚未完成。');
  return checkpoint as Conversation;
}
