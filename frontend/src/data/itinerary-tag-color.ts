const categoryHues = new Map<string, number>([
  ["交通", 210],
  ["住宿", 275],
  ["景點", 135],
  ["美食", 25],
  ["購物", 335],
  ["自由活動", 70],
]);

// Keep the first five in distinct orange/green/pink/blue/yellow families.
const spacedHues = [25, 145, 335, 215, 75];
function paletteHue(index: number): number {
  while (spacedHues.length <= index) {
    const sorted = [...spacedHues].sort((a, b) => a - b);
    let largest = -1,
      midpoint = 0;
    for (let i = 0; i < sorted.length; i++) {
      const next = i === sorted.length - 1 ? sorted[0] + 360 : sorted[i + 1];
      const gap = next - sorted[i];
      if (gap > largest) {
        largest = gap;
        midpoint = (sorted[i] + gap / 2) % 360;
      }
    }
    spacedHues.push(midpoint);
  }
  return spacedHues[index];
}

/** Share the full-trip context so date/tag filtering never reallocates colors. */
export function itineraryTagHue(
  value: string,
  allTags?: readonly string[],
): number {
  const label = value.trim().normalize("NFC");
  if (allTags) {
    const unique = [
      ...new Set(
        allTags.map((tag) => tag.trim().normalize("NFC")).filter(Boolean),
      ),
    ];
    const index = unique.indexOf(label);
    if (index >= 0) return paletteHue(index);
  }
  const preset = categoryHues.get(label);
  if (preset !== undefined) return preset;
  let hash = 2166136261;
  for (const character of label)
    hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619) >>> 0;
  // Spread adjacent hashes across the hue wheel instead of a small repeating palette.
  return (Math.round(((hash * 137.50776405) % 360) * 100) / 100) % 360;
}
