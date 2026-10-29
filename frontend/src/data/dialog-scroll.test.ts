import { it } from "node:test";
import assert from "node:assert/strict";
import {
  installDialogScrollLock,
  scrollDialogToTop,
  createScrollActivity,
} from "./dialog-scroll.ts";
function fixture() {
  function style() {
    const values = new Map<string, { value: string; priority: string }>();
    return {
      getPropertyValue: (key: string) => values.get(key)?.value || "",
      getPropertyPriority: (key: string) => values.get(key)?.priority || "",
      setProperty: (key: string, value: string, priority = "") =>
        values.set(key, { value, priority }),
      removeProperty: (key: string) => values.delete(key),
    };
  }
  const body = { style: style() },
    root = { style: style(), clientWidth: 980 };
  let dialogs = 0,
    notify = () => {},
    disconnected = false;
  class Observer {
    constructor(callback: () => void) {
      notify = callback;
    }
    observe() {}
    disconnect() {
      disconnected = true;
    }
  }
  const positions: number[][] = [];
  let toggle: (() => void) | undefined;
  const doc = {
    body,
    documentElement: root,
    querySelector: () => (dialogs ? {} : null),
    addEventListener(_event: string, callback: () => void) {
      toggle = callback;
    },
    removeEventListener() {
      toggle = undefined;
    },
  };
  const view = {
    scrollX: 15,
    scrollY: 420,
    innerWidth: 1000,
    getComputedStyle: () => ({ paddingRight: "6px" }),
    scrollTo: (x: number, y: number) => positions.push([x, y]),
  };
  return {
    body,
    root,
    doc,
    view,
    Observer,
    positions,
    setDialogs: (count: number) => {
      dialogs = count;
      notify();
    },
    setPopover: (count: number) => {
      dialogs = count;
      toggle?.();
    },
    disconnected: () => disconnected,
  };
}
it("locks the background until the last dialog closes and restores styles and scroll position", () => {
  const f = fixture();
  f.body.style.setProperty("position", "relative", "important");
  f.root.style.setProperty("scroll-behavior", "smooth");
  const dispose = installDialogScrollLock(
    f.doc as unknown as Document,
    f.view as unknown as Window,
    f.Observer as unknown as typeof MutationObserver,
  );
  assert.equal(f.body.style.getPropertyValue("position"), "relative");
  f.setDialogs(1);
  assert.equal(f.body.style.getPropertyValue("position"), "fixed");
  assert.equal(f.body.style.getPropertyValue("top"), "-420px");
  assert.equal(f.body.style.getPropertyValue("padding-right"), "26px");
  assert.equal(f.root.style.getPropertyValue("overflow"), "hidden");
  f.setDialogs(2);
  f.setDialogs(1);
  assert.deepEqual(f.positions, []);
  assert.equal(f.body.style.getPropertyValue("position"), "fixed");
  f.setDialogs(0);
  assert.equal(f.body.style.getPropertyValue("position"), "relative");
  assert.equal(f.body.style.getPropertyPriority("position"), "important");
  assert.equal(f.body.style.getPropertyValue("top"), "");
  assert.equal(f.body.style.getPropertyValue("padding-right"), "");
  assert.equal(f.root.style.getPropertyValue("scroll-behavior"), "smooth");
  assert.deepEqual(f.positions, [[15, 420]]);
  dispose();
  assert.ok(f.disconnected());
  assert.equal(f.positions.length, 1);
});
it("locks an already open dialog, preserves padding without a scrollbar and unlocks on disposal", () => {
  const f = fixture();
  f.setDialogs(1);
  f.view.innerWidth = 980;
  const dispose = installDialogScrollLock(
    f.doc as unknown as Document,
    f.view as unknown as Window,
    f.Observer as unknown as typeof MutationObserver,
  );
  assert.equal(f.body.style.getPropertyValue("padding-right"), "6px");
  dispose();
  assert.equal(f.body.style.getPropertyValue("position"), "");
  assert.deepEqual(f.positions, [[15, 420]]);
});

it("tracks date-picker popover toggle events and removes the listener on disposal", () => {
  const f = fixture();
  const dispose = installDialogScrollLock(
    f.doc as unknown as Document,
    f.view as unknown as Window,
    f.Observer as unknown as typeof MutationObserver,
  );
  f.setPopover(1);
  assert.equal(f.body.style.getPropertyValue("position"), "fixed");
  f.setPopover(0);
  assert.equal(f.body.style.getPropertyValue("position"), "");
  dispose();
  f.setPopover(1);
  assert.equal(f.body.style.getPropertyValue("position"), "");
});

it("returns only the owning dialog to the top and restores keyboard focus without scrolling the page", () => {
  for (const reduced of [true, false]) {
    let scroll: ScrollToOptions | undefined, focus: FocusOptions | undefined;
    const dialog = {
      ownerDocument: {
        defaultView: { matchMedia: () => ({ matches: reduced }) },
      },
      scrollTo: (value: ScrollToOptions) => {
        scroll = value;
      },
      querySelector: () => ({
        focus: (value: FocusOptions) => {
          focus = value;
        },
      }),
    };
    scrollDialogToTop(dialog as unknown as HTMLDialogElement);
    assert.deepEqual(scroll, { top: 0, behavior: reduced ? "auto" : "smooth" });
    assert.deepEqual(focus, { preventScroll: true });
  }
});
it("shows back-to-top only during scrolling and resets the three-second idle deadline", (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const visibility: boolean[] = [];
  const activity = createScrollActivity((value) => visibility.push(value));
  activity.scroll(120);
  assert.equal(visibility.at(-1), true);
  context.mock.timers.tick(2999);
  assert.equal(visibility.at(-1), true);
  activity.scroll(150);
  context.mock.timers.tick(1);
  assert.equal(visibility.at(-1), true);
  context.mock.timers.tick(2999);
  assert.equal(visibility.at(-1), false);
  activity.scroll(160);
  assert.equal(visibility.at(-1), true);
  activity.dispose();
});
it("hides immediately at the top and cancels idle timers on cleanup", (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const visibility: boolean[] = [];
  const activity = createScrollActivity((value) => visibility.push(value));
  activity.scroll(20);
  activity.scroll(0);
  assert.equal(visibility.at(-1), false);
  const count = visibility.length;
  context.mock.timers.tick(3000);
  assert.equal(visibility.length, count);
  activity.scroll(10);
  activity.dispose();
  const disposedCount = visibility.length;
  context.mock.timers.tick(3000);
  assert.equal(visibility.length, disposedCount);
  // React StrictMode may clean up and re-run the same mounted effect.
  activity.scroll(30);
  context.mock.timers.tick(3000);
  assert.equal(visibility.at(-1), false);
});
