import { ProviderRateLimitError, ProviderModelUnavailableError, ProviderRequestError } from '../core/errors.ts';
import { providerFailureDetails } from '../core/diagnostics.ts';
import { Schema } from '@firebase/ai';
import type { Content, GenerateContentRequest, SingleRequestOptions } from '@firebase/ai';
import type { Provider, Part } from '../contracts.ts';

/** Only this adapter understands SDK content; core keeps signed parts opaque. */
export interface FirebaseModel {
  generateContent(request: GenerateContentRequest, options?: SingleRequestOptions): Promise<{
    response: { candidates?: { content: Content }[] };
  }>;
  generateContentStream?(request: GenerateContentRequest, options?: SingleRequestOptions): Promise<{
    stream: AsyncIterable<{ candidates?: { content: Content }[] }>;
    response: Promise<{ candidates?: { content: Content }[] }>;
  }>;
}
export function firebaseSchema(value: Record<string, unknown>): Schema {
  const description = typeof value.description === 'string' ? value.description : undefined;
  if (value.$ref || value.anyOf || value.oneOf) throw new Error('此 Provider 不支援參照或聯集 schema。');
  switch (value.type) {
    case 'object': {
      const properties = (value.properties || {}) as Record<string, Record<string, unknown>>;
      const required = (value.required || []) as string[];
      return Schema.object({ description, properties: Object.fromEntries(Object.entries(properties).map(([key, property]) => [key, firebaseSchema(property)])),
        optionalProperties: Object.keys(properties).filter(key => !required.includes(key)) });
    }
    case 'array': return Schema.array({ description, items: firebaseSchema(value.items as Record<string, unknown>),
      minItems: value.minItems as number | undefined, maxItems: value.maxItems as number | undefined });
    case 'string': return value.enum ? Schema.enumString({ description, enum: value.enum as string[] }) : Schema.string({ description });
    case 'integer': return Schema.integer({ description });
    case 'number': return Schema.number({ description });
    case 'boolean': return Schema.boolean({ description });
    default: throw new Error('此 Provider 不支援這個 schema 類型。');
  }
}
function content(message: import('../contracts.ts').Message): Content {
  if (message.role === 'model' && message.opaque) return structuredClone(message.opaque) as Content;
  return { role: message.role, parts: message.parts.map(part => {
    if ('text' in part) return { text: part.text };
    if ('attachment' in part) return { inlineData: { mimeType: part.attachment.mimeType, data: part.attachment.data } };
    if ('call' in part) return { functionCall: { name: part.call.name, args: part.call.args as object } };
    return { functionResponse: { name: part.result.name, response: part.result.response } };
  }) };
}
export function createFirebaseProvider(model: FirebaseModel): Provider {
  return { async generate(request) {
    request.signal.throwIfAborted();
    const contents: Content[] = [];
    for (const message of request.messages) {
      const next = content(message), last = contents.at(-1);
      if (last?.role === 'user' && next.role === 'user') last.parts.push(...next.parts);
      else contents.push(next);
    }
    const tools = request.tools.length ? [{ functionDeclarations: request.tools.map(tool => ({
      name: tool.name, description: tool.description,
      parameters: firebaseSchema(tool.parameters) as ReturnType<typeof Schema.object>,
    })) }] : undefined;
    let response: Awaited<ReturnType<FirebaseModel['generateContent']>>;
    let operation: 'generateContent' | 'streamGenerateContent' = 'generateContent';
    try {
      const input = { contents, tools, systemInstruction: `${request.system}\n應用提供的目前範圍：${JSON.stringify(request.context)}` };
      if (request.onText && model.generateContentStream) {
        operation = 'streamGenerateContent';
        const result = await model.generateContentStream(input, { signal: request.signal });
        // Attach a rejection handler immediately: the aggregate and iterator may fail separately.
        const completed = result.response.then(value => ({ value }), error => ({ error }));
        for await (const chunk of result.stream) {
          request.signal.throwIfAborted();
          for (const part of chunk.candidates?.[0]?.content?.parts || []) {
            if ('text' in part && typeof part.text === 'string' && !('thought' in part && part.thought)) request.onText(part.text);
          }
        }
        const final = await completed;
        if ('error' in final) throw final.error;
        response = { response: final.value };
      } else {
        response = await model.generateContent(input, { signal: request.signal });
      }
    } catch (error) {
      const details = { ...providerFailureDetails(error), operation };
      if (details.code === '404') throw new ProviderModelUnavailableError(details);
      if (details.code === '429') throw new ProviderRateLimitError(details);
      throw new ProviderRequestError(undefined, details);
    }
    request.signal.throwIfAborted();
    const candidate = response.response.candidates?.[0]?.content;
    if (!candidate?.parts?.length) throw new ProviderRequestError(undefined, { code: 'empty_response', message: '模型沒有可用回應，可能受到內容限制。' });
    const parts: Part[] = [];
    for (const part of candidate.parts) {
      if ('text' in part && typeof part.text === 'string' && !('thought' in part && part.thought)) {
        const previous = parts.at(-1);
        if (previous && 'text' in previous) previous.text += part.text;
        else parts.push({ text: part.text });
      }
      else if ('functionCall' in part && part.functionCall) parts.push({ call: { name: part.functionCall.name, args: part.functionCall.args } });
    }
    if (!parts.length) throw new ProviderRequestError(undefined, { code: 'empty_response', message: '模型沒有可用文字或工具回應。' });
    return { parts, opaque: structuredClone(candidate) };
  } };
}
