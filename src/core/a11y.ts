/**
 * Accessibility helpers (WCAG-oriented; complements focus styles in index.html).
 */

/** True when the user has requested minimal motion (OS / browser setting). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

/**
 * Escape text for use inside a double-quoted HTML attribute (aria-label, title, etc.).
 */
export function escapeHtmlAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
