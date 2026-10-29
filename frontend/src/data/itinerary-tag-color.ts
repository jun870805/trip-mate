const categoryHues = new Map<string, number>([
  ["交通", 210],
  ["住宿", 275],
  ["景點", 135],
  ["美食", 25],
  ["購物", 335],
  ["自由活動", 70],
]);

/** Fixed by text, independent of trip order, filtering and browser storage. */
export function itineraryTagHue(value: string): number {
  const label = value.trim().normalize("NFC");
  const preset = categoryHues.get(label);
  if (preset !== undefined) return preset;
  let hash = 2166136261;
  for (const character of label)
    hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619) >>> 0;
  // Spread adjacent hashes across the hue wheel instead of a small repeating palette.
  return (Math.round(((hash * 137.50776405) % 360) * 100) / 100) % 360;
}
