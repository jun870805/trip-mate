/** One observer covers every native dialog, including nested dialogs and removal. */
export function installDialogScrollLock(
  doc: Document,
  view: Window,
  Observer: typeof MutationObserver = MutationObserver,
): () => void {
  let restore: (() => void) | undefined;
  function save(style: CSSStyleDeclaration, properties: string[]) {
    const values = properties.map((property) => ({
      property,
      value: style.getPropertyValue(property),
      priority: style.getPropertyPriority(property),
    }));
    return () =>
      values.forEach(({ property, value, priority }) => {
        if (value) style.setProperty(property, value, priority);
        else style.removeProperty(property);
      });
  }
  function sync() {
    const open = !!doc.querySelector(
      'dialog[open], [role="dialog"]:popover-open',
    );
    if (open && !restore) {
      const body = doc.body.style,
        root = doc.documentElement.style;
      const restoreBody = save(body, [
        "position",
        "top",
        "left",
        "width",
        "overflow",
        "padding-right",
      ]);
      const restoreRoot = save(root, [
        "overflow",
        "overscroll-behavior",
        "scroll-behavior",
      ]);
      const x = view.scrollX,
        y = view.scrollY;
      const scrollbar = Math.max(
        0,
        view.innerWidth - doc.documentElement.clientWidth,
      );
      const padding =
        parseFloat(view.getComputedStyle(doc.body).paddingRight) || 0;
      root.setProperty("scroll-behavior", "auto");
      root.setProperty("overflow", "hidden");
      root.setProperty("overscroll-behavior", "none");
      body.setProperty("position", "fixed");
      body.setProperty("top", `${-y}px`);
      body.setProperty("left", `${-x}px`);
      body.setProperty("width", "100%");
      body.setProperty("overflow", "hidden");
      body.setProperty("padding-right", `${padding + scrollbar}px`);
      restore = () => {
        restoreBody();
        // Keep restoration immediate even when the page normally scrolls smoothly.
        root.removeProperty("overflow");
        view.scrollTo(x, y);
        restoreRoot();
      };
    } else if (!open && restore) {
      restore();
      restore = undefined;
    }
  }
  const observer = new Observer(sync);
  observer.observe(doc.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["open"],
  });
  doc.addEventListener("toggle", sync, true);
  sync();
  return () => {
    doc.removeEventListener("toggle", sync, true);
    observer.disconnect();
    restore?.();
    restore = undefined;
  };
}
