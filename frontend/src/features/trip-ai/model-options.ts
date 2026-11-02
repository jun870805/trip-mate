/** Public model choices without loading the Firebase/validation bundles into the page shell. */
export function readModelOptions(env: Record<string,string|undefined>): {defaultModel:string;models:string[]} {
  function name(value: unknown): string {
    if (typeof value!=='string' || !value.trim() || value.trim().length>200) throw new Error('模型名稱設定無效。');
    return value.trim();
  }
  const defaultModel=name(env.VITE_AI_DEFAULT_MODEL);
  const configured=env.VITE_AI_MODELS?.trim();
  const models:unknown=configured ? JSON.parse(configured) : [];
  if (!Array.isArray(models) || models.length>20) throw new Error('模型清單須為最多 20 筆的 JSON 字串陣列。');
  return {defaultModel,models:[...new Set([defaultModel,...models.map(name)])]};
}
