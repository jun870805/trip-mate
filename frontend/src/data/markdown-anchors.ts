import type { Element, ElementContent, Root, RootContent } from "hast";

declare module "hast" {
  interface ElementData {
    markdownAnchor?: boolean;
  }
}
export function markdownFragment(value: string): string | undefined {
  if (!value.startsWith("#") || value.length === 1) return;
  try {
    const decoded = decodeURIComponent(value.slice(1));
    if (!decoded.trim() || /[\u0000-\u001f\u007f]/.test(decoded)) return;
    return decoded;
  } catch {
    return;
  }
}
function slug(value: string): string {
  return (
    value
      .normalize("NFC")
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}_\s-]/gu, "")
      .replace(/[\s-]+/g, "-")
      .replace(/^-|-$/g, "") || "section"
  );
}
function text(node: ElementContent): string {
  if (node.type === "text") return node.value;
  if (node.type !== "element") return "";
  if (node.tagName === "img") return String(node.properties.alt || "");
  return node.children.map(text).join("");
}
export function addMarkdownAnchors(tree: Root, prefix: string): void {
  const elements: Element[] = [];
  function visit(node: Root | RootContent) {
    if (node.type === "element") elements.push(node);
    if ("children" in node) node.children.forEach(visit);
  }
  visit(tree);
  const names = new Set<string>();
  for (const element of elements) {
    if (!/^h[1-6]$/.test(element.tagName)) continue;
    const base = slug(element.children.map(text).join(""));
    let name = base,
      suffix = 1;
    while (names.has(name)) name = `${base}-${suffix++}`;
    names.add(name);
    element.properties.id = prefix + name;
    element.properties.tabIndex = -1;
  }
  for (const element of elements) {
    const href = element.properties.href;
    if (
      element.tagName !== "a" ||
      typeof href !== "string" ||
      !href.startsWith("#")
    )
      continue;
    const fragment = markdownFragment(href);
    const name = fragment === undefined ? undefined : slug(fragment);
    if (!name || !names.has(name)) {
      delete element.properties.href;
      continue;
    }
    element.properties.href = "#" + prefix + name;
    element.data = { ...element.data, markdownAnchor: true };
  }
}
/** Scroll the owning dialog only, keeping its sticky heading clear of the target. */
export function scrollMarkdownSection(root: HTMLElement, id: string): boolean {
  const target = Array.from(root.querySelectorAll<HTMLElement>("[id]")).find(
    (element) => element.id === id,
  );
  if (!target) return false;
  const view = target.ownerDocument.defaultView;
  const behavior = view?.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
  const dialog = root.closest("dialog");
  if (dialog) {
    const heading = dialog.querySelector<HTMLElement>(".dialog-heading");
    const offset = (heading?.getBoundingClientRect().height || 0) + 12;
    dialog.scrollTo({
      top: Math.max(
        0,
        dialog.scrollTop +
          target.getBoundingClientRect().top -
          dialog.getBoundingClientRect().top -
          dialog.clientTop -
          offset,
      ),
      behavior,
    });
  } else target.scrollIntoView({ block: "start", behavior });
  target.focus({ preventScroll: true });
  return true;
}
