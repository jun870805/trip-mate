/** Browser persistence belongs to the host; the portable agent has no storage dependency. */
export function conversationKey(scope: readonly string[]) {
  return `trip-mate:ai-conversation:v1:${JSON.stringify(scope)}`;
}
export function conversationStorage(getStorage: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {
  return {
    read(key: string): unknown { const raw = getStorage().getItem(key); return raw ? JSON.parse(raw) : null; },
    write(key: string, value: unknown) { getStorage().setItem(key, JSON.stringify(value)); },
    remove(key: string) { getStorage().removeItem(key); },
  };
}
