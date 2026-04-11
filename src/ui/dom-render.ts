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
  wrap.className = 'text-center py-16';

  const icon = document.createElement('div');
  icon.className = 'text-4xl mb-3 opacity-30';
  icon.textContent = '⚠️';

  const h3 = document.createElement('h3');
  h3.className = 'text-red-400 font-semibold';
  h3.textContent = message;

  wrap.append(icon, h3);

  if (options?.showBackToList) {
    const btn = document.createElement('button');
    btn.setAttribute('data-action', 'back-to-list');
    btn.className = 'mt-4 px-4 py-2 rounded-lg bg-dark-700 text-dark-300 text-sm hover:bg-dark-600';
    btn.textContent = '\u2190 Back to List';
    wrap.appendChild(btn);
  }

  container.replaceChildren(wrap);
}
