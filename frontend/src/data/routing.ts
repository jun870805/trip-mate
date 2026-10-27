export const APP_ROUTE_PATTERN =
  "^(trip|demo)/(T(?:[0-9]{3}|[1-9][0-9]{3}))(?:/(overview|itinerary|fund|expenses|tasks))?/?$";
export function normalizeBase(input: string): string {
  if (
    !input.startsWith("/") ||
    input.startsWith("//") ||
    /[?#\\<>]/.test(input) ||
    input.split("/").some((part) => part === "." || part === "..")
  )
    throw new Error("VITE_BASE_PATH 必須是 / 或 /專案名稱/ 形式的絕對路徑。");
  return input.replace(/\/+$/, "") + "/";
}
export function deploymentBase(
  env: Record<string, string | undefined>,
): string {
  if (env.VITE_BASE_PATH?.trim())
    return normalizeBase(env.VITE_BASE_PATH.trim());
  const [owner, repo] =
    env.GITHUB_ACTIONS === "true"
      ? (env.GITHUB_REPOSITORY || "").split("/")
      : [];
  return repo && repo.toLowerCase() !== `${owner.toLowerCase()}.github.io`
    ? normalizeBase("/" + repo + "/")
    : "/";
}
export function routeHref(path: string, base: string): string {
  return normalizeBase(base) + path.replace(/^\/+/, "");
}
export function parseRoute(pathname: string, base: string) {
  const root = normalizeBase(base);
  const relative = pathname.startsWith(root)
    ? pathname.slice(root.length)
    : null;
  if (relative === "" || relative === "index.html")
    return { source: "", id: "", tab: "overview", notFound: false };
  const match = relative && new RegExp(APP_ROUTE_PATTERN).exec(relative);
  return match
    ? {
        source: match[1],
        id: match[2],
        tab: match[3] || "overview",
        notFound: false,
      }
    : { source: "", id: "", tab: "overview", notFound: true };
}
/** Restore only same-origin, app-local paths; no token or browser storage is used. */
export function initialRouteUrl(href: string, base: string): string | null {
  const url = new URL(href),
    root = normalizeBase(base);
  const fallback = url.searchParams.get("__trip_route");
  if (fallback !== null) {
    let restored: URL;
    try {
      restored = new URL(fallback, url.origin);
    } catch {
      return root;
    }
    if (
      !fallback.startsWith("/") ||
      fallback.startsWith("//") ||
      restored.origin !== url.origin ||
      parseRoute(restored.pathname, root).notFound
    )
      return root;
    restored.searchParams.delete("__trip_route");
    return restored.pathname + restored.search + restored.hash;
  }
  if (
    (url.pathname === root || url.pathname === root + "index.html") &&
    url.hash.startsWith("#/")
  ) {
    const restored = new URL(routeHref(url.hash.slice(2), root), url.origin);
    if (parseRoute(restored.pathname, root).notFound) return root;
    for (const [key, value] of url.searchParams)
      if (!restored.searchParams.has(key))
        restored.searchParams.append(key, value);
    return restored.pathname + restored.search + restored.hash;
  }
  return null;
}
export function create404Html(base: string): string {
  const root = normalizeBase(base);
  const json = (value: string) =>
    JSON.stringify(value).replaceAll("<", "\\u003c");
  const escaped = root.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>找不到頁面｜蕃薯旅遊團</title></head><body style="margin:0;padding:32px 20px;background:#f3ebdf;color:#44372e;font-family:'Microsoft JhengHei',sans-serif"><main style="max-width:480px;margin:48px auto"><h1>找不到頁面</h1><p>請確認網址，或返回所有旅程。</p><a style="display:inline-block;padding:8px 12px;color:#795d48" href="${escaped}">所有旅程</a></main><script>
const base=${json(root)};
const relative=location.pathname.startsWith(base)?location.pathname.slice(base.length):'';
if(new RegExp(${json(APP_ROUTE_PATTERN)}).test(relative)){
 const destination=new URL(base,location.origin);
 destination.searchParams.set('__trip_route',location.pathname+location.search+location.hash);
 location.replace(destination.href);
}
</script></body></html>`;
}
