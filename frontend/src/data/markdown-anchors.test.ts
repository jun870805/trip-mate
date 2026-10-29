import { it } from "node:test";
import assert from "node:assert/strict";
import type { Element, Root } from "hast";
import {
  addMarkdownAnchors,
  markdownFragment,
  scrollMarkdownSection,
} from "./markdown-anchors.ts";
const heading = (text: string): Element => ({
  type: "element",
  tagName: "h2",
  properties: {},
  children: [{ type: "text", value: text }],
});
const link = (href: string): Element => ({
  type: "element",
  tagName: "a",
  properties: { href },
  children: [{ type: "text", value: "跳轉" }],
});
it("assigns scoped, unique heading IDs and resolves only local matching fragments", () => {
  const headings = [
    heading("交通方式"),
    heading("交通方式"),
    heading("交通方式-1"),
    heading("Food & Drink"),
    heading("!!!"),
  ];
  const links = [
    link("#交通方式"),
    link("#%E4%BA%A4%E9%80%9A%E6%96%B9%E5%BC%8F-1"),
    link("#food--drink"),
    link("#missing"),
    link("https://example.com"),
  ];
  const tree: Root = { type: "root", children: [...links, ...headings] };
  addMarkdownAnchors(tree, "body-one-");
  assert.deepEqual(
    headings.map((node) => node.properties.id),
    [
      "body-one-交通方式",
      "body-one-交通方式-1",
      "body-one-交通方式-1-1",
      "body-one-food-drink",
      "body-one-section",
    ],
  );
  assert.equal(links[0].properties.href, "#body-one-交通方式");
  assert.equal(links[1].properties.href, "#body-one-交通方式-1");
  assert.equal(links[2].properties.href, "#body-one-food-drink");
  assert.equal(links[3].properties.href, undefined);
  assert.equal(links[4].properties.href, "https://example.com");
  const second = heading("交通方式");
  addMarkdownAnchors({ type: "root", children: [second] }, "body-two-");
  assert.notEqual(second.properties.id, headings[0].properties.id);
});
it("supports formatted heading text, image alt, Unicode and malformed fragment input safely", () => {
  const title = heading("");
  title.children = [
    {
      type: "element",
      tagName: "strong",
      properties: {},
      children: [{ type: "text", value: "Cafe\u0301" }],
    },
    {
      type: "element",
      tagName: "img",
      properties: { alt: " 圖片" },
      children: [],
    },
  ];
  const tree: Root = {
    type: "root",
    children: [title, link("#caf%C3%A9-%E5%9C%96%E7%89%87")],
  };
  addMarkdownAnchors(tree, "safe-");
  assert.equal(title.properties.id, "safe-café-圖片");
  assert.equal(markdownFragment("#交通方式"), "交通方式");
  for (const href of [
    "#",
    "#%E0%A4%A",
    "#bad\nfragment",
    "javascript:alert(1)",
    "//example.com",
  ])
    assert.equal(markdownFragment(href), undefined);
});
it("scrolls only the current dialog below its sticky heading and focuses without moving the page", () => {
  let scrolled: ScrollToOptions | undefined, focused: FocusOptions | undefined;
  const dialog = {
    scrollTop: 200,
    clientTop: 1,
    getBoundingClientRect: () => ({ top: 50 }),
    querySelector: () => ({ getBoundingClientRect: () => ({ height: 80 }) }),
    scrollTo: (options: ScrollToOptions) => {
      scrolled = options;
    },
  };
  const target = {
    id: "body-one-交通方式",
    getBoundingClientRect: () => ({ top: 500 }),
    focus: (options: FocusOptions) => {
      focused = options;
    },
    ownerDocument: { defaultView: { matchMedia: () => ({ matches: true }) } },
  };
  const root = { querySelectorAll: () => [target], closest: () => dialog };
  assert.equal(
    scrollMarkdownSection(root as unknown as HTMLElement, "body-one-交通方式"),
    true,
  );
  assert.deepEqual(scrolled, { top: 557, behavior: "auto" });
  assert.deepEqual(focused, { preventScroll: true });
  assert.equal(
    scrollMarkdownSection(root as unknown as HTMLElement, "another-body"),
    false,
  );
});
it("keeps scrolling bounded and respects normal motion without a dialog header", () => {
  let scrolled: ScrollToOptions | undefined;
  const target = {
    id: "local",
    getBoundingClientRect: () => ({ top: 0 }),
    focus: () => {},
    ownerDocument: { defaultView: { matchMedia: () => ({ matches: false }) } },
    scrollIntoView: (options: ScrollIntoViewOptions) => {
      scrolled = options;
    },
  };
  const dialog = {
    scrollTop: 0,
    clientTop: 1,
    getBoundingClientRect: () => ({ top: 50 }),
    querySelector: () => null,
    scrollTo: (options: ScrollToOptions) => {
      scrolled = options;
    },
  };
  const root = { querySelectorAll: () => [target], closest: () => dialog };
  scrollMarkdownSection(root as unknown as HTMLElement, "local");
  assert.deepEqual(scrolled, { top: 0, behavior: "smooth" });
  const standalone = { ...root, closest: () => null };
  scrollMarkdownSection(standalone as unknown as HTMLElement, "local");
  assert.deepEqual(scrolled, { block: "start", behavior: "smooth" });
});
