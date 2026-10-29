import { parseFragment } from "parse5";
import type { DefaultTreeAdapterTypes } from "parse5";
import type { Element, ElementContent, Root } from "hast";
import { safeUrl } from "./portal.ts";

declare module "hast" {
  interface ElementData {
    htmlLink?: boolean;
  }
}

const allowed = new Set(
  "a b blockquote br caption code col colgroup del details div em h1 h2 h3 h4 h5 h6 hr i img input li ol p pre s small span strong sub summary sup table tbody td tfoot th thead tr u ul".split(
    " ",
  ),
);
const blocked = new Set(
  "script style iframe object embed svg math template form button textarea select option title noscript".split(
    " ",
  ),
);
const voidTags = new Set(["br", "hr", "img", "input", "col"]);
const attributes = new Set([
  "href",
  "src",
  "alt",
  "title",
  "align",
  "colspan",
  "rowspan",
  "start",
  "type",
  "checked",
  "disabled",
  "class",
]);
type MarkdownNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: MarkdownNode[];
  position?: Element["position"];
};
function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Parse mixed HTML/Markdown with HTML5 rules, then construct an allowlisted HAST.
 * No source HTML or attributes are passed directly to React/the browser.
 */
export function safeMarkdownHtml() {
  return (tree: Root) => {
    let markup = "";
    const sources = new Map<number, MarkdownNode>();
    function serialize(node: MarkdownNode) {
      if (node.type === "raw") {
        markup += node.value || "";
        return;
      }
      if (node.type === "text") {
        markup += escape(node.value || "");
        return;
      }
      if (node.type === "element") {
        const tag = node.tagName!;
        sources.set(markup.length, node);
        markup += `<${tag}`;
        for (const [key, value] of Object.entries(node.properties || {})) {
          const name = key === "className" ? "class" : key.toLowerCase();
          if (!attributes.has(name) || value === false || value == null)
            continue;
          const text = Array.isArray(value) ? value.join(" ") : String(value);
          markup += value === true ? ` ${name}` : ` ${name}="${escape(text)}"`;
        }
        markup += ">";
        node.children?.forEach(serialize);
        if (!voidTags.has(tag)) markup += `</${tag}>`;
      } else node.children?.forEach(serialize);
    }
    serialize(tree);
    const fragment = parseFragment(markup, { sourceCodeLocationInfo: true });
    function clean(node: DefaultTreeAdapterTypes.ChildNode): ElementContent[] {
      if (node.nodeName === "#text")
        return [
          {
            type: "text",
            value: (node as DefaultTreeAdapterTypes.TextNode).value,
          },
        ];
      if (!("tagName" in node)) return [];
      const tag = node.tagName;
      if (
        node.namespaceURI !== "http://www.w3.org/1999/xhtml" ||
        blocked.has(tag)
      )
        return [];
      const children = node.childNodes.flatMap(clean);
      if (!allowed.has(tag)) return children;
      const attrs = new Map(node.attrs.map((attr) => [attr.name, attr.value]));
      if (tag === "input" && attrs.get("type") !== "checkbox") return [];
      const properties: Element["properties"] = {};
      for (const key of ["href", "src"]) {
        if (
          (tag === "a" && key === "href") ||
          (tag === "img" && key === "src")
        ) {
          const url = safeUrl(attrs.get(key) || "");
          if (url) properties[key] = url;
        }
      }
      if (attrs.has("title")) properties.title = attrs.get("title")!;
      if (tag === "img" && attrs.has("alt")) properties.alt = attrs.get("alt")!;
      if (["td", "th"].includes(tag)) {
        const align = attrs.get("align");
        if (align && ["left", "center", "right"].includes(align))
          properties.align = align;
        for (const [attr, key] of [
          ["colspan", "colSpan"],
          ["rowspan", "rowSpan"],
        ]) {
          const value = attrs.get(attr);
          if (value && /^\d{1,3}$/.test(value) && Number(value) > 0)
            properties[key] = Number(value);
        }
      }
      if (tag === "ol" && /^-?\d{1,6}$/.test(attrs.get("start") || ""))
        properties.start = Number(attrs.get("start"));
      if (tag === "input") {
        properties.type = "checkbox";
        properties.disabled = true;
        properties.checked = attrs.has("checked");
      }
      if (tag === "code") {
        const languages = (attrs.get("class") || "")
          .split(/\s+/)
          .filter((value) => /^language-[\w-]+$/.test(value));
        if (languages.length) properties.className = languages;
      }
      const source = sources.get(node.sourceCodeLocation?.startOffset ?? -1);
      return [
        {
          type: "element",
          tagName: tag,
          properties,
          children,
          ...(source?.position ? { position: source.position } : {}),
          ...(tag === "a" && !source ? { data: { htmlLink: true } } : {}),
        },
      ];
    }
    tree.children = fragment.childNodes.flatMap(clean);
  };
}
