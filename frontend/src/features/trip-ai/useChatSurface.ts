import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

/** A single mounted panel changes modality without losing the composer or pending preview. */
export function useChatSurface(open: boolean, panel: RefObject<HTMLElement | null>, onExpanded?: (expanded: boolean) => void) {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 701px)');
    const sync = () => setDesktop(media.matches);
    sync(); media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    onExpanded?.(open && desktop);
    if (open && desktop) document.body.classList.add('ai-sidebar-open');
    return () => { document.body.classList.remove('ai-sidebar-open'); onExpanded?.(false); };
  }, [open, desktop, onExpanded]);
  useEffect(() => {
    const element = panel.current;
    if (!open || !element) return;
    const previous = new Map<HTMLElement, boolean>();
    if (!desktop) {
      // Portal is a direct body child; preserve pre-existing inert state on every other surface.
      for (const sibling of document.body.children) {
        if (sibling instanceof HTMLElement && sibling !== element.parentElement && !['SCRIPT','STYLE'].includes(sibling.tagName)) {
          previous.set(sibling, sibling.inert); sibling.inert = true;
        }
      }
    }
    if (!element.contains(document.activeElement)) element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true});
    function keepFocus(event: FocusEvent) {
      if (!desktop && event.target instanceof Node && !element!.contains(event.target)) element!.focus({preventScroll:true});
    }
    document.addEventListener('focusin', keepFocus);
    return () => { previous.forEach((inert, node) => { node.inert = inert; }); document.removeEventListener('focusin', keepFocus); };
  }, [open, desktop, panel]);
  return desktop;
}
