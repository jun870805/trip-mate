import { z } from 'zod';
import type { AgentContext, Tool, ToolDeclaration } from '../contracts.ts';

export function createRegistry(tools: readonly Tool[]) {
  const registry = new Map<string, Tool>();
  for (const tool of tools) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(tool.name) || registry.has(tool.name))
      throw new Error('工具名稱不合法或重複。');
    if (tool.risk === 'read' ? !tool.execute : !tool.prepare)
      throw new Error('工具缺少對應的執行方式。');
    registry.set(tool.name, Object.freeze({ ...tool }));
  }
  return {
    get(name: string) { return registry.get(name); },
    declarations(context: AgentContext): ToolDeclaration[] {
      return [...registry.values()].filter(tool => tool.enabled(context)).map(tool => ({
        name: tool.name, description: tool.description,
        parameters: z.toJSONSchema(tool.schema) as Record<string, unknown>,
      }));
    },
  };
}
