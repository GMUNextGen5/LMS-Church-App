/**
 * DOM rendering helpers: parsed templates via a detached `<template>` (never assigns `innerHTML` on the
 * live container) and text-safe panels. Pair template literals with `escapeHtmlText` for any dynamic text.
 */

/**
 * HTML-entity encodes text for embedding in static template strings (assign to `textContent` first,
 * then read serialized markup — same behavior as a textarea/div escape, without regex).
 */
export function escapeHtmlText(text: string): string {
  const span = document.createElement('span');
  span.textContent = text;
  return span.innerHTML;
}

/**
 * Parses `html` in a detached `<template>` (`template.innerHTML` only — not the target container) and
 * moves nodes into `container` via `replaceChildren` (single reflow).
 */
export function renderTemplate(container: Element, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  container.replaceChildren(...template.content.childNodes);
}

/**
 * Centered empty / CTA panel for card stacks and non-table regions (static copy only; dynamic text is escaped).
 */
export function emptyStateBlockHtml(
  title: string,
  subtitle?: string,
  ctaHtml?: string,
  options?: { branded?: boolean }
): string {
  const branded = options?.branded !== false;
  const brand = branded
    ? `<p class="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-on-surface-subtle mb-2">DSKM LMS</p>`
    : '';
  const cta = ctaHtml
    ? `<div class="mt-6 flex flex-wrap justify-center gap-3">${ctaHtml}</div>`
    : '';
  const sub = subtitle
    ? `<p class="text-on-surface-muted text-sm mt-1 max-w-md mx-auto">${escapeHtmlText(subtitle)}</p>`
    : '';
  return `
    <div class="lms-empty-state-panel text-center py-14 px-4 rounded-xl border border-surface-default bg-surface-container shadow-sm dark:shadow-none">
      ${brand}
      <div class="text-4xl mb-3 opacity-30" aria-hidden="true">📚</div>
      <h3 class="text-on-surface font-semibold text-lg">${escapeHtmlText(title)}</h3>
      ${sub}
      ${cta}
    </div>`;
}

/** Single table row spanning `colspan` with the same empty-state treatment (for gradebook / history tables). */
export function emptyStateTableRowHtml(
  colspan: number,
  title: string,
  subtitle?: string,
  ctaHtml?: string
): string {
  const inner = emptyStateBlockHtml(title, subtitle, ctaHtml).trim();
  return `<tr><td colspan="${colspan}" class="p-0 border-0 bg-transparent">${inner}</td></tr>`;
}

/**
 * Appends parsed nodes (e.g. one question card) without replacing the whole parent.
 */
export function appendParsedHtml(parent: Element, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  parent.append(...template.content.childNodes);
}

export type RenderErrorPanelOptions = {
  /** Assessment-style error with “Back to List” (classes tab omits this). */
  showBackToList?: boolean;
};

/**
 * Error / empty-error UI with all copy via `textContent` / `createElement` (no HTML injection from `message`).
 */
export function renderErrorPanel(
  container: Element,
  message: string,
  options?: RenderErrorPanelOptions
): void {
  const wrap = document.createElement('div');
  wrap.className =
    'lms-access-denied-panel card-blur progress-bar-glow max-w-lg mx-auto text-center py-14 px-6 rounded-2xl border border-primary-400/15 bg-dark-950/80';

  const icon = document.createElement('div');
  icon.className = 'text-3xl mb-4 opacity-40';
  icon.textContent = '⚠️';

  const h3 = document.createElement('h3');
  h3.className = 'font-display text-lg font-semibold text-on-surface dark:text-primary-300';
  h3.textContent = 'Access or data unavailable';

  const p = document.createElement('p');
  p.className = 'mt-2 text-sm text-on-surface-muted leading-relaxed';
  p.textContent = message;

  wrap.append(icon, h3, p);

  if (options?.showBackToList) {
    const btn = document.createElement('button');
    btn.setAttribute('data-action', 'back-to-list');
    btn.className =
      'mt-6 px-4 py-2.5 rounded-xl text-sm font-medium border border-primary-400/40 text-on-surface dark:text-primary-300 hover:bg-primary-400/10 transition-colors';
    btn.textContent = '\u2190 Back to List';
    wrap.appendChild(btn);
  }

  container.replaceChildren(wrap);
}
