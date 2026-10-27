import { useEffect, useState } from "react";
import { initialRouteUrl, parseRoute, routeHref } from "../data/routing";
const base = import.meta.env.BASE_URL;
export const appHref = (path = "/") => routeHref(path, base);
export function useRoute() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  useEffect(() => {
    const change = () => setPathname(window.location.pathname);
    const click = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.hasAttribute("download") ||
        (link.target && link.target !== "_self")
      )
        return;
      const url = new URL(link.href, window.location.href);
      if (
        url.origin !== window.location.origin ||
        parseRoute(url.pathname, base).notFound ||
        url.hash
      )
        return;
      event.preventDefault();
      if (url.href === window.location.href) return;
      window.history.pushState(null, "", url.pathname + url.search);
      change();
      window.scrollTo(0, 0);
    };
    const restored = initialRouteUrl(window.location.href, base);
    if (restored) {
      window.history.replaceState(null, "", restored);
      change();
    }
    window.addEventListener("popstate", change);
    document.addEventListener("click", click);
    return () => {
      window.removeEventListener("popstate", change);
      document.removeEventListener("click", click);
    };
  }, []);
  return parseRoute(pathname, base);
}
