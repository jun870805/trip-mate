import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { runInNewContext } from "node:vm";
const directory = path.resolve(process.argv[2] || "frontend/dist");
const index = await readFile(path.join(directory, "index.html"), "utf8");
const base = index.match(/href="([^"]*)icon\.png"/)?.[1];
assert.ok(
  base?.startsWith("/"),
  "Build assets must use an absolute deployment base",
);
const html = await readFile(path.join(directory, "404.html"), "utf8");
await access(path.join(directory, ".nojekyll"));
await access(path.join(directory, "icon.png"));
await access(path.join(directory, "templates", "旅程目錄範本.xlsx"));
for (const [, asset] of index.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)) {
  assert.ok(
    asset.startsWith(base),
    "JS and CSS must share the deployment base",
  );
  await access(path.join(directory, asset.slice(base.length)));
}
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, "404 build must contain the recovery script");
let redirected = "";
const location = {
  origin: "https://example.test",
  pathname: base + "trip/T001/tasks",
  search: "?x=1&text=京都",
  hash: "#detail",
  replace(value) {
    redirected = value;
  },
};
runInNewContext(script, { location, URL });
const destination = new URL(redirected);
assert.equal(destination.origin, location.origin);
assert.equal(destination.pathname, base);
assert.equal(
  destination.searchParams.get("__trip_route"),
  location.pathname + location.search + location.hash,
);
redirected = "";
location.pathname = base + "missing-page";
runInNewContext(script, { location, URL });
assert.equal(
  redirected,
  "",
  "Unknown paths must remain on the custom 404 page",
);
console.log(
  `GitHub Pages build checked: base ${base}, assets, 404 recovery and no redirect loop.`,
);
