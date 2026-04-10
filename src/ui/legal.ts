/**
 * In-app Privacy Policy and Terms of Service: copy, modal host wiring, and theme sync via `lms-theme-changed`.
 */

import { getAppTheme, registerThemeRefreshHandler } from '../core/theme-events';
import { sanitizeHTML } from './ui';

/** Slug for a legal document shown in the in-app modal (footer and signup links). */
export type LegalDocumentId = 'privacy' | 'terms';

const TITLES: Record<LegalDocumentId, string> = {
  privacy: 'Privacy Policy',
  terms: 'Terms of Service',
};

/**
 * Builds sanitized HTML for the Privacy Policy (student-friendly sections).
 */
function buildPrivacyPolicyHtml(): string {
  return `
<section class="mb-6">
  <h4 class="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">Introduction</h4>
  <p class="text-slate-700 dark:text-slate-300 leading-relaxed">DSKM LMS is dedicated to protecting the privacy of students and teachers. We want you to understand what we collect, why we collect it, and how we keep it safe.</p>
</section>
<section class="mb-6">
  <h4 class="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">Data collection</h4>
  <p class="text-slate-700 dark:text-slate-300 leading-relaxed">We collect information needed to run the learning platform. That may include names, email addresses, academic grades, attendance records, and logs of interactions with the AI Assistant (so we can improve guidance and support).</p>
</section>
<section class="mb-6">
  <h4 class="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">How we use your information</h4>
  <p class="text-slate-700 dark:text-slate-300 leading-relaxed">We use this information strictly for educational purposes: supporting teaching and learning, grade tracking, attendance, and improving AI-driven insights that help you study. <strong class="font-semibold text-slate-900 dark:text-slate-100">We never sell your data to third parties.</strong></p>
</section>
<section class="mb-6">
  <h4 class="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">Security</h4>
  <p class="text-slate-700 dark:text-slate-300 leading-relaxed">We use industry-standard encryption and sensible safeguards to help keep your academic records and account information protected.</p>
</section>
<section class="mb-0">
  <h4 class="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">Your rights</h4>
  <p class="text-slate-700 dark:text-slate-300 leading-relaxed">You have the right to view your own data where the platform allows it, and to request corrections if something in your records looks wrong. Reach out to your teacher or school administrator for help with corrections.</p>
</section>`;
}

/**
 * Builds sanitized HTML for the Terms of Service (student-friendly sections).
 */
function buildTermsOfServiceHtml(): string {
  return `
<section class="mb-6">
  <h4 class="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">Agreement</h4>
  <p class="text-slate-700 dark:text-slate-300 leading-relaxed">By using DSKM LMS, you agree to follow our community rules: be respectful, honest, and use the platform in ways that support learning for everyone.</p>
</section>
<section class="mb-6">
  <h4 class="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">Account safety</h4>
  <p class="text-slate-700 dark:text-slate-300 leading-relaxed">You are responsible for keeping your password private. Do not share your login with others. Tell a teacher or administrator right away if you think your account was used without your permission.</p>
</section>
<section class="mb-6">
  <h4 class="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">Acceptable use</h4>
  <p class="text-slate-700 dark:text-slate-300 leading-relaxed">You agree not to try to break into the system, bypass security, or interfere with other users. When you use the AI Assistant, use it to <strong class="font-semibold text-slate-900 dark:text-slate-100">support</strong> your lessons and understanding—not to create inappropriate or harmful content, and not to replace your own thinking or assigned work.</p>
</section>
<section class="mb-6">
  <h4 class="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">AI disclaimer</h4>
  <p class="text-slate-700 dark:text-slate-300 leading-relaxed">The AI Assistant is an educational tool. Its suggestions are meant for learning and information only; they may be incomplete or mistaken. <strong class="font-semibold text-slate-900 dark:text-slate-100">Your teachers and school have the final say on grades and academic decisions.</strong></p>
</section>
<section class="mb-0">
  <h4 class="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">Ownership</h4>
  <p class="text-slate-700 dark:text-slate-300 leading-relaxed">Work and files you upload stay yours. The platform's software, layout, and branding belong to DSKM LMS.</p>
</section>`;
}

const BODY_HTML: Record<LegalDocumentId, string> = {
  privacy: buildPrivacyPolicyHtml(),
  terms: buildTermsOfServiceHtml(),
};

let initialized = false;

/**
 * Syncs `data-app-theme` on legal modal host nodes so panel/backdrop/title CSS tracks the active theme.
 */
function applyLegalModalTheme(): void {
  const theme = getAppTheme();
  const ids = ['legal-modal-backdrop', 'legal-modal-panel', 'legal-modal-title'] as const;
  for (const id of ids) {
    document.getElementById(id)?.setAttribute('data-app-theme', theme);
  }
}

/** Resolves DOM nodes for the legal modal; returns null if markup is incomplete. */
function getLegalElements(): {
  root: HTMLElement;
  backdrop: HTMLElement;
  panel: HTMLElement;
  title: HTMLElement;
  body: HTMLElement;
  closeBtn: HTMLButtonElement;
  closeX: HTMLButtonElement;
} | null {
  const root = document.getElementById('legal-modal');
  const backdrop = document.getElementById('legal-modal-backdrop');
  const panel = document.getElementById('legal-modal-panel');
  const title = document.getElementById('legal-modal-title');
  const body = document.getElementById('legal-modal-body');
  const closeBtn = document.getElementById('legal-modal-close') as HTMLButtonElement | null;
  const closeX = document.getElementById('legal-modal-close-x') as HTMLButtonElement | null;
  if (!root || !backdrop || !panel || !title || !body || !closeBtn || !closeX) return null;
  return { root, backdrop, panel, title, body, closeBtn, closeX };
}

/**
 * Opens the legal modal for the given document and applies the current theme to host nodes.
 * @param doc - `privacy` or `terms`, matching `data-legal-modal` / `data-open-legal` attributes.
 */
export function openLegalModal(doc: LegalDocumentId): void {
  const els = getLegalElements();
  if (!els) return;
  els.title.textContent = TITLES[doc];
  els.body.innerHTML = sanitizeHTML(BODY_HTML[doc]);
  applyLegalModalTheme();
  els.root.classList.remove('hide');
  els.root.setAttribute('aria-hidden', 'false');
  els.closeBtn.focus();
}

/** Closes the legal modal and clears injected body HTML. */
export function closeLegalModal(): void {
  const els = getLegalElements();
  if (!els) return;
  els.root.classList.add('hide');
  els.root.setAttribute('aria-hidden', 'true');
  els.body.innerHTML = '';
}

/**
 * Wires footer and signup legal triggers, Escape/backdrop/close actions, and theme refresh.
 */
export function initLegalModals(): void {
  if (initialized) return;
  initialized = true;

  const els = getLegalElements();
  if (!els) return;

  applyLegalModalTheme();
  registerThemeRefreshHandler(applyLegalModalTheme);

  const footer = document.querySelector('.auth-footer-links');
  footer?.addEventListener('click', (e) => {
    const trigger = (e.target as HTMLElement).closest('[data-legal-modal]') as HTMLElement | null;
    if (!trigger) return;
    e.preventDefault();
    const id = trigger.getAttribute('data-legal-modal') as LegalDocumentId | null;
    if (id === 'privacy' || id === 'terms') openLegalModal(id);
  });

  document.getElementById('auth-container')?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-open-legal]') as HTMLElement | null;
    if (!btn) return;
    e.preventDefault();
    const id = btn.getAttribute('data-open-legal') as LegalDocumentId | null;
    if (id === 'privacy' || id === 'terms') openLegalModal(id);
  });

  const close = (): void => {
    closeLegalModal();
  };
  els.closeBtn.addEventListener('click', close);
  els.closeX.addEventListener('click', close);
  els.backdrop.addEventListener('click', close);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (els.root.classList.contains('hide')) return;
    close();
  });
}
