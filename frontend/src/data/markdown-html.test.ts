import { it } from "node:test";
import assert from "node:assert/strict";
import type { Root } from "hast";
import { safeMarkdownHtml } from "./markdown-html.ts";
function raw(value: string): Root {
  return {
    type: "root",
    children: [{ type: "raw", value }],
  } as unknown as Root;
}
it("parses HTML line breaks, entities and formatting as safe nodes", () => {
  const tree = raw("<div>第一行<br/>第二行 &amp; <strong>重點</strong></div>");
  safeMarkdownHtml()(tree);
  assert.equal(tree.children[0].type, "element");
  const html = JSON.stringify(tree);
  assert.ok(
    html.includes('"tagName":"br"') && html.includes('"tagName":"strong"'),
  );
  assert.ok(html.includes("第二行 & "));
});
it("removes executable markup, namespaces, attributes and unsafe or obfuscated URLs", () => {
  const tree = raw(
    '<script>alert(1)</script><style>body{display:none}</style><iframe src="https://example.com"></iframe><svg><a href="javascript:alert(1)">bad</a></svg><p id="root" style="position:fixed" onclick="alert(1)">safe</p><img src="data:image/svg+xml,bad" onerror="alert(1)" alt="照片"><a href="jav&#x61;script:alert(1)">保留文字</a>',
  );
  safeMarkdownHtml()(tree);
  const html = JSON.stringify(tree);
  for (const denied of [
    "alert(1)",
    'tagName":"script',
    'tagName":"style',
    'tagName":"svg',
    'tagName":"iframe',
    "onclick",
    "onerror",
    "position:fixed",
    "data:image",
    "javascript:",
  ])
    assert.ok(!html.includes(denied), denied);
  assert.ok(html.includes("保留文字") && html.includes("照片"));
});
it("preserves generated Markdown code, named-link locations and display-only task checkboxes", () => {
  const tree: Root = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "a",
        properties: { href: "https://example.com" },
        position: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 24, offset: 23 },
        },
        children: [{ type: "text", value: "官網" }],
      },
      {
        type: "element",
        tagName: "code",
        properties: { className: ["language-html"] },
        children: [{ type: "text", value: "<script>literal</script>" }],
      },
    ],
  };
  safeMarkdownHtml()(tree);
  assert.equal(tree.children[0].position?.start.offset, 0);
  assert.ok(JSON.stringify(tree).includes("<script>literal</script>"));
  const tasks = raw(
    '<input type="checkbox" checked><input type="text" value="bad"><!-- ignore --><custom>內容</custom>',
  );
  safeMarkdownHtml()(tasks);
  assert.ok(JSON.stringify(tasks).includes('"disabled":true'));
  assert.ok(!JSON.stringify(tasks).includes('"value":"bad"'));
  assert.equal(
    tasks.children.filter(
      (node) => node.type === "element" && node.tagName === "input",
    ).length,
    1,
  );
});
it("keeps supported table, list and code properties while dropping styling and invalid attributes", () => {
  const tree = raw(
    '<ol start="3"><li>項目</li></ol><ol start="bad"><li>另一項</li></ol><table><tr><td align="center" colspan="2" rowspan="0" title="A &quot; B">格</td><td align="bad" colspan="bad" rowspan="2">格二</td></tr></table><pre><code class="language-html injected" style="color:red">&lt;br&gt;</code></pre>',
  );
  safeMarkdownHtml()(tree);
  const html = JSON.stringify(tree);
  assert.ok(
    html.includes('"start":3') &&
      html.includes('"colSpan":2') &&
      html.includes('"rowSpan":2') &&
      html.includes('"align":"center"'),
  );
  assert.ok(html.includes("language-html") && html.includes("<br>"));
  for (const denied of [
    "injected",
    "color:red",
    '"rowSpan":0',
    '"align":"bad"',
    '"start":"bad"',
  ])
    assert.ok(!html.includes(denied));
  const generated: Root = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "input",
        properties: {
          type: "checkbox",
          checked: false,
          disabled: true,
          title: '"<&',
          id: "bad",
          hidden: null,
        },
        children: [],
      },
      { type: "element", tagName: "span", properties: {}, children: [] },
    ],
  };
  safeMarkdownHtml()(generated);
  assert.ok(JSON.stringify(generated).includes('"checked":false'));
  assert.ok(!JSON.stringify(generated).includes('"id"'));
});
