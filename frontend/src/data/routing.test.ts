import { it } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import {
  deploymentBase,
  parseRoute,
  routeHref,
  initialRouteUrl,
  create404Html,
} from "./routing.ts";
it("supports root, repository paths, trailing slashes and default overview", () => {
  assert.deepEqual(parseRoute("/trip/T001", "/"), {
    source: "trip",
    id: "T001",
    tab: "overview",
    notFound: false,
  });
  assert.equal(
    parseRoute("/trip-mate/trip/T001/tasks/", "/trip-mate/").tab,
    "tasks",
  );
  assert.equal(parseRoute("/trip-mate/", "/trip-mate/").notFound, false);
  assert.equal(
    parseRoute("/trip-mate/index.html", "/trip-mate/").notFound,
    false,
  );
  for (const path of [
    "/other/trip/T001",
    "/trip-mate-extra/trip/T001",
    "/trip-mate/trip/T001/unknown",
    "/trip-mate/nope",
  ])
    assert.equal(parseRoute(path, "/trip-mate/").notFound, true);
  assert.equal(routeHref("/trip/T001", "/trip-mate/"), "/trip-mate/trip/T001");
});
it("uses explicit base or GitHub Actions repository configuration", () => {
  assert.equal(deploymentBase({}), "/");
  assert.equal(
    deploymentBase({
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "owner/trip-mate",
    }),
    "/trip-mate/",
  );
  assert.equal(
    deploymentBase({
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "owner/owner.github.io",
    }),
    "/",
  );
  assert.equal(
    deploymentBase({
      VITE_BASE_PATH: "/",
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "owner/trip-mate",
    }),
    "/",
  );
  assert.equal(deploymentBase({ VITE_BASE_PATH: "/travel" }), "/travel/");
  assert.equal(
    deploymentBase({
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "owner/other.github.io",
    }),
    "/other.github.io/",
  );
  for (const base of [
    "//evil.test/",
    "./",
    "https://evil.test/",
    "/bad/../path/",
  ])
    assert.throws(() => deploymentBase({ VITE_BASE_PATH: base }));
});
it("restores GitHub 404 destinations including query strings and fragments", () => {
  const target = "/trip-mate/trip/T001/tasks?text=京都&x=1#section";
  const entry = new URL("https://example.test/trip-mate/");
  entry.searchParams.set("__trip_route", target);
  assert.equal(
    initialRouteUrl(entry.href, "/trip-mate/"),
    "/trip-mate/trip/T001/tasks?text=%E4%BA%AC%E9%83%BD&x=1#section",
  );
  assert.equal(initialRouteUrl("https://example.test/trip/T001", "/"), null);
});
it("migrates old hash links while refusing external or out-of-base restore targets", () => {
  assert.equal(
    initialRouteUrl(
      "https://example.test/trip-mate/?lang=zh#/trip/T001/fund",
      "/trip-mate/",
    ),
    "/trip-mate/trip/T001/fund?lang=zh",
  );
  for (const target of [
    "https://evil.test/trip/T001",
    "//evil.test/trip/T001",
    "/other/trip/T001",
    "/trip-mate/../trip/T001",
    "/trip-mate/unknown",
    "http://[",
  ]) {
    const url = new URL("https://example.test/trip-mate/");
    url.searchParams.set("__trip_route", target);
    assert.equal(initialRouteUrl(url.href, "/trip-mate/"), "/trip-mate/");
  }
});
it("404 pages redirect only app routes, preserve the full URL and do not require storage", () => {
  for (const base of ["/", "/trip-mate/"]) {
    const html = create404Html(base);
    let redirected = "";
    const pathname = base + "trip/T001/tasks";
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    const location = {
      pathname,
      search: "?q=京都&x=1",
      hash: "#detail",
      origin: "https://example.test",
      replace: (value: string) => {
        redirected = value;
      },
    };
    runInNewContext(script, { location, URL });
    const url = new URL(redirected);
    assert.equal(url.pathname, base);
    assert.equal(
      url.searchParams.get("__trip_route"),
      pathname + "?q=京都&x=1#detail",
    );
    assert.equal(
      initialRouteUrl(url.href, base),
      pathname + "?q=%E4%BA%AC%E9%83%BD&x=1#detail",
    );
    redirected = "";
    location.pathname = base + "missing-image.png";
    runInNewContext(script, { location, URL });
    assert.equal(redirected, "");
  }
});
