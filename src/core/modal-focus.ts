/**
 * Modal accessibility: focus trap, Escape, body scroll lock, and focus restoration (WCAG 2.4.3, 2.4.7).
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function isFocusableVisible(el: HTMLElement): boolean {
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  return true;
}

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) =>
    isFocusableVisible(el)
  );
}

let bodyScrollLockCount = 0;
let bodyScrollY = 0;

/** Locks document scroll (nested modals increment a counter). */
export function lockBodyScroll(): () => void {
  bodyScrollLockCount += 1;
  if (bodyScrollLockCount === 1) {
    bodyScrollY = window.scrollY;
    document.body.style.setProperty('position', 'fixed', 'important');
    document.body.style.top = `-${bodyScrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
  }
  return (): void => {
    bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
    if (bodyScrollLockCount === 0) {
      document.body.style.removeProperty('position');
      document.body.style.removeProperty('top');
      document.body.style.removeProperty('width');
      document.body.style.removeProperty('overflow');
      window.scrollTo({ top: bodyScrollY, left: 0, behavior: 'auto' });
    }
  };
}

export type ModalLayerCleanup = () => void;

/**
 * Focus trap + scroll lock for a dialog panel. Call the returned function on close.
 */
export function activateModalLayer(
  trapRoot: HTMLElement,
  options: {
    onEscape: () => void;
    initialFocus?: HTMLElement | null;
  }
): ModalLayerCleanup {
  const previous = document.activeElement as HTMLElement | null;
  const unlockScroll = lockBodyScroll();

  const list = (): HTMLElement[] => getFocusableElements(trapRoot);
  const focusFirst = (): void => {
    const nodes = list();
    const pick =
      options.initialFocus && trapRoot.contains(options.initialFocus)
        ? options.initialFocus
        : nodes[0];
    window.requestAnimationFrame(() => {
      try {
        pick?.focus();
      } catch {
        /* detached */
      }
    });
  };
  focusFirst();

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      options.onEscape();
      return;
    }
    if (e.key !== 'Tab') return;
    const nodes = list();
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  document.addEventListener('keydown', onKeyDown, true);

  return (): void => {
    document.removeEventListener('keydown', onKeyDown, true);
    unlockScroll();
    try {
      if (previous && typeof previous.focus === 'function' && document.body.contains(previous)) {
        previous.focus();
      }
    } catch {
      /* ignore */
    }
  };
}
