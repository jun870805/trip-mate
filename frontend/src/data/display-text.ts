/** Display Sheets-style escaped line breaks without rewriting stored values. */
export function displayMultiline(value: string): string {
  return value.replace(/\\n/g, "\n");
}
