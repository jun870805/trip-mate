/** Keep Tab at the modal's boundaries, including when native tab order visits browser chrome. */
export function trapDialogFocus(dialog: HTMLElement, event: { key: string; shiftKey: boolean; preventDefault(): void }) {
  if (event.key !== 'Tab') return;
  const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'))
    .filter(element => element.getClientRects().length > 0 && !element.hidden && element.getAttribute('aria-hidden') !== 'true');
  const first = controls[0], last = controls.at(-1);
  const active = dialog.ownerDocument.activeElement;
  if (!first) { event.preventDefault(); dialog.focus(); }
  else if (event.shiftKey && (active === first || active === dialog)) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && (active === last || active === dialog)) { event.preventDefault(); first.focus(); }
}
