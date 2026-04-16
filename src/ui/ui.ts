/**
 * Shared shell UI: DOMPurify sanitization, auth/app visibility, tabs, loading overlay, and AI modal host.
 */
import { User, UserRole } from '../types';
import DOMPurify from 'dompurify';
import { renderTemplate } from './dom-render';
import { activateModalLayer } from '../core/modal-focus';
import { canAccessMainTab } from '../core/tab-access';
import { ensureDeferredShellFragmentsSync, injectShellFragments } from './templates';

let domPurifyHooksInstalled = false;

function installDomPurifyLinkHooks(): void {
  if (domPurifyHooksInstalled) return;
  domPurifyHooksInstalled = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName !== 'A') return;
    const el = node as HTMLAnchorElement;
    const href = el.getAttribute('href') || '';
    if (/^\s*javascript:/i.test(href) || /^\s*data:/i.test(href)) {
      el.removeAttribute('href');
      return;
    }
    el.setAttribute('rel', 'noopener noreferrer');
    if (/^https?:\/\//i.test(href)) el.setAttribute('target', '_blank');
  });
}

/**
 * Sanitizes untrusted HTML for safe insertion into the DOM (AI modal, legal docs, chat bubbles).
 * Implemented with **DOMPurify** (not regex) — see `ALLOWED_TAGS` / hooks below.
 */
export function sanitizeHTML(html: string): string {
  installDomPurifyLinkHooks();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p',
      'span',
      'strong',
      'b',
      'i',
      'em',
      'u',
      'br',
      'hr',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'li',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'div',
      'section',
      'article',
      'blockquote',
      'pre',
      'code',
      'a',
      'aside',
      'nav',
      'header',
      'footer',
      'button',
      'input',
    ],
    ALLOWED_ATTR: [
      'class',
      'id',
      'href',
      'target',
      'rel',
      'colspan',
      'rowspan',
      'type',
      'value',
      'readonly',
      'aria-label',
      'aria-hidden',
      'aria-live',
      'role',
      // Form-like primitives used by the AI tools panel (no <form> tag is ever
      // allowed, so these cannot submit or navigate on their own):
      'name',
      'placeholder',
      'accept',
      'min',
      'max',
      'step',
      'pattern',
      'disabled',
      'required',
      'multiple',
      'alt',
      'src',
      'for',
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|data):|[^a-z]|[a-z.+.-]+(?:[^a-z+.:-]|$))/i,
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
    // Allow `data-*` hooks so the AI tool modal can identify its own inputs.
    // DOMPurify strips any data-on* style hooks regardless of this flag.
    ALLOW_DATA_ATTR: true,
  });
}

const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const loginFormContainer = document.getElementById('login-form-container');
const signupFormContainer = document.getElementById('signup-form-container');
const loginTabBtn = document.getElementById('login-tab-btn');
const signupTabBtn = document.getElementById('signup-tab-btn');
const loginForm = document.getElementById('login-form') as HTMLFormElement | null;
const signupForm = document.getElementById('signup-form') as HTMLFormElement | null;
const loginError = document.getElementById('login-error');
const signupError = document.getElementById('signup-error');
const logoutBtn = document.getElementById('logout-btn');
const loadingOverlay = document.getElementById('loading-overlay');
const LOADING_OVERLAY_HIDDEN_CLASS = 'lms-loading-overlay-hidden';
const LOADING_OVERLAY_FADE_MS = 300;
let loadingOverlayHideFinalizeTimer = 0;
let aiModal: HTMLElement | null = null;
let aiModalTitle: HTMLElement | null = null;
let aiModalContent: HTMLElement | null = null;

let currentUserRole: UserRole | null = null;

/** Optional hook invoked after the AI modal is hidden (e.g. refresh shell after "Account Created"). */
let modalOnDismiss: (() => void | Promise<void>) | null = null;

/** Focus trap + scroll lock cleanup for `#ai-modal`. */
let aiModalLayerCleanup: (() => void) | null = null;

export type ShowModalOptions = {
  onDismiss?: () => void | Promise<void>;
};

function runDelegatedModalCopy(
  copyRoot: Element,
  inputSelector: string,
  successStyleSwap?: { add: string[]; remove: string[]; successLabel?: string },
  afterClipboardSuccess?: () => void
): void {
  try {
    const input = aiModalContent?.querySelector(inputSelector) as HTMLInputElement | null;
    if (!input) return;
    input.focus();
    input.select();
  } catch {
    /* selection blocked */
  }
  const inputRead = aiModalContent?.querySelector(inputSelector) as HTMLInputElement | null;
  const text = inputRead?.value ?? '';
  void (async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      try {
        showAppToast('Failed to copy. Please select and copy manually.', 'error');
      } catch {
        /* alert blocked */
      }
      return;
    }
    try {
      afterClipboardSuccess?.();
    } catch {
      /* dismiss must not break copy */
    }
    const btn = copyRoot as HTMLButtonElement;
    if (!successStyleSwap) {
      const orig = btn.textContent;
      btn.textContent = '✓ Copied!';
      window.setTimeout(() => {
        try {
          btn.textContent = orig || 'Copy';
        } catch {
          /* DOM gone */
        }
      }, 2000);
      return;
    }
    const origText = btn.textContent;
    btn.textContent = successStyleSwap.successLabel ?? '✓ Copied!';
    for (const c of successStyleSwap.remove) {
      try {
        btn.classList.remove(c);
      } catch {
        /* ignore */
      }
    }
    for (const c of successStyleSwap.add) {
      try {
        btn.classList.add(c);
      } catch {
        /* ignore */
      }
    }
    window.setTimeout(() => {
      try {
        btn.textContent = origText || 'Copy';
        for (const c of successStyleSwap.add) btn.classList.remove(c);
        for (const c of successStyleSwap.remove) btn.classList.add(c);
      } catch {
        /* DOM gone */
      }
    }, 2000);
  })();
}

/** Single listener on `#ai-modal`: content swaps via `renderTemplate` do not remove it (Account Created / My Account ID). */
function installAiModalDelegatedClicks(): void {
  const shell = aiModal;
  if (!(shell instanceof HTMLElement)) return;
  if ((shell as HTMLElement & { __lmsAiModalDel?: boolean }).__lmsAiModalDel) return;
  (shell as HTMLElement & { __lmsAiModalDel?: boolean }).__lmsAiModalDel = true;

  shell.addEventListener('click', (e: MouseEvent) => {
    try {
      const raw = e.target;
      if (!(raw instanceof Element)) return;

      if (raw.closest('#copy-uid-btn')) {
        e.preventDefault();
        const root = raw.closest('#copy-uid-btn');
        if (root) {
          runDelegatedModalCopy(root, '#uid-display', {
            add: [
              'bg-green-600',
              'hover:bg-green-700',
              'ring-2',
              'ring-green-400',
              'ring-offset-2',
              'ring-offset-dark-800',
            ],
            remove: ['bg-primary-500', 'hover:bg-primary-600'],
            successLabel: 'Copied!',
          });
        }
        return;
      }

      if (raw.closest('#account-id-modal-copy-btn')) {
        e.preventDefault();
        const root = raw.closest('#account-id-modal-copy-btn');
        if (root) {
          runDelegatedModalCopy(root, '#account-id-modal-uid-input');
        }
        return;
      }

      if (raw.closest('.modal-close-trigger')) {
        e.preventDefault();
        closeModal();
        return;
      }

      if (e.target === shell) {
        closeModal();
      }
    } catch {
      /* InPrivate / strict mode: never break the click path */
    }
  });
}

/** Binds auth tab buttons, main tab buttons, and AI modal dismiss controls. */
export function initUI(onDeferredShellReady?: () => void): void {
  injectShellFragments(() => {
    aiModal = document.getElementById('ai-modal');
    aiModalTitle = document.getElementById('ai-modal-title');
    aiModalContent = document.getElementById('ai-modal-content');
    installAiModalDelegatedClicks();
    onDeferredShellReady?.();
  });

  loginTabBtn?.addEventListener('click', () => switchAuthTab('login'));
  signupTabBtn?.addEventListener('click', () => switchAuthTab('signup'));
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement;
      const tabName = target.dataset.tab;
      if (tabName) switchTab(tabName);
    });
  });
}

function switchAuthTab(tab: 'login' | 'signup'): void {
  if (!loginFormContainer || !signupFormContainer) return;
  if (tab === 'login') {
    loginFormContainer.classList.remove('hide');
    signupFormContainer.classList.add('hide');
    loginTabBtn?.classList.add('tab-active');
    signupTabBtn?.classList.remove('tab-active');
    signupTabBtn?.classList.add('text-dark-300');
    loginTabBtn?.classList.remove('text-dark-300');
    if (loginError) clearError(loginError);
  } else {
    signupFormContainer.classList.remove('hide');
    loginFormContainer.classList.add('hide');
    signupTabBtn?.classList.add('tab-active');
    loginTabBtn?.classList.remove('tab-active');
    loginTabBtn?.classList.add('text-dark-300');
    signupTabBtn?.classList.remove('text-dark-300');
    if (signupError) clearError(signupError);
  }
}

export function showAuthContainer(): void {
  authContainer?.classList.remove('hide', 'hidden');
  appContainer?.classList.add('hide', 'hidden');
  clearForms();
}

export function showAppContainer(): void {
  authContainer?.classList.add('hide', 'hidden');
  appContainer?.classList.remove('hide', 'hidden');
}

/**
 * Hides all role-gated chrome before auth resolves (cold start) or after sign-out.
 * Prevents privileged nav from flashing while `onAuthStateChanged` is still in flight.
 */
export function hideAllRoleRegionsForAuthHandshake(): void {
  currentUserRole = null;
  document.documentElement.removeAttribute('data-lms-role');
  document
    .querySelectorAll('.admin-only, .teacher-only, .student-only, .lms-my-account-nav')
    .forEach((el) => {
      (el as HTMLElement).classList.add('hide');
    });
}

export function configureUIForRole(user: User): void {
  const validRoles = [UserRole.Admin, UserRole.Teacher, UserRole.Student] as const;
  const role = user?.role;
  const isValidRole = typeof role === 'string' && (validRoles as readonly string[]).includes(role);
  if (!isValidRole) {
    currentUserRole = null;
    document.documentElement.removeAttribute('data-lms-role');
    // Hide role-based regions until we have a valid profile.
    document
      .querySelectorAll('.admin-only, .teacher-only, .student-only, .lms-my-account-nav')
      .forEach((el) => {
        (el as HTMLElement).classList.add('hide');
      });
    document.dispatchEvent(new CustomEvent('lms-role-configured', { detail: { role: null } }));
    return;
  }

  currentUserRole = role as UserRole;
  document.documentElement.setAttribute('data-lms-role', role);

  // Query DOM at call-time (module-level lookups can run before DOM is ready).
  const emailEl = document.getElementById('user-email');
  if (emailEl) emailEl.textContent = user.email;

  const roleBadgeEl = document.getElementById('user-role-badge');
  if (roleBadgeEl) {
    roleBadgeEl.textContent = role.charAt(0).toUpperCase() + role.slice(1);
  }
  document.querySelectorAll('.admin-only, .teacher-only, .student-only').forEach((el) => {
    (el as HTMLElement).classList.add('hide');
  });
  if (role === UserRole.Admin) {
    document.querySelectorAll('.admin-only, .teacher-only').forEach((el) => {
      (el as HTMLElement).classList.remove('hide');
    });
  } else if (role === UserRole.Teacher) {
    document.querySelectorAll('.teacher-only').forEach((el) => {
      (el as HTMLElement).classList.remove('hide');
    });
  } else {
    document.querySelectorAll('.student-only').forEach((el) => {
      (el as HTMLElement).classList.remove('hide');
    });
  }

  document.querySelectorAll('.lms-my-account-nav').forEach((el) => {
    (el as HTMLElement).classList.remove('hide');
  });

  document.dispatchEvent(
    new CustomEvent('lms-role-configured', { detail: { role: role as UserRole } })
  );
}

const VALID_MAIN_TABS = new Set([
  'dashboard',
  'grades',
  'attendance',
  'assessments',
  'classes',
  'registration',
  'teacher-registration',
  'users',
  'ai-agent',
  'student-profile',
]);

function roleFromDomAttr(): UserRole | null {
  const r = document.documentElement.getAttribute('data-lms-role');
  if (r === UserRole.Admin || r === UserRole.Teacher || r === UserRole.Student) return r;
  return null;
}

/**
 * Activates a main LMS tab from the top tab bar: updates `.tab-btn` / `.tab-content` and emits `tab-switched`.
 */
function switchTab(tabName: string): void {
  if (!VALID_MAIN_TABS.has(tabName)) return;
  let target = tabName;
  if (!canAccessMainTab(target, roleFromDomAttr())) {
    showAppToast('You do not have access to that area.', 'error');
    target = 'dashboard';
  }
  if (target === 'registration' || target === 'teacher-registration') {
    ensureDeferredShellFragmentsSync();
  }
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.remove('tab-active');
    btn.classList.add('text-dark-300');
  });
  const activeBtn = document.querySelector(`.tab-btn[data-tab="${target}"]`);
  if (activeBtn) {
    activeBtn.classList.add('tab-active');
    activeBtn.classList.remove('text-dark-300');
  }
  document.querySelectorAll('.tab-content').forEach((content) => {
    content.classList.add('hide');
  });
  const activeContent = document.getElementById(`${target}-content`);
  if (activeContent) activeContent.classList.remove('hide');
  document.dispatchEvent(new CustomEvent('tab-switched', { detail: { tab: target } }));
}

function resetLoadingOverlayImportantStyles(el: HTMLElement): void {
  el.style.removeProperty('display');
  el.style.removeProperty('visibility');
  el.style.removeProperty('pointer-events');
  el.style.removeProperty('z-index');
}

function finalizeLoadingOverlayHidden(el: HTMLElement): void {
  el.classList.add('hide', 'hidden');
  el.style.setProperty('display', 'none', 'important');
  el.style.setProperty('z-index', '-1', 'important');
  el.classList.remove(LOADING_OVERLAY_HIDDEN_CLASS);
}

export function showLoading(): void {
  const el = loadingOverlay;
  if (el instanceof HTMLElement) {
    window.clearTimeout(loadingOverlayHideFinalizeTimer);
    loadingOverlayHideFinalizeTimer = 0;
    el.classList.remove(LOADING_OVERLAY_HIDDEN_CLASS);
    resetLoadingOverlayImportantStyles(el);
    el.classList.remove('hide', 'hidden');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-busy', 'true');
    el.setAttribute('aria-hidden', 'false');
  }
  document.getElementById('app-container')?.setAttribute('aria-busy', 'true');
}

/**
 * Fades the boot overlay out (opacity) then removes it from layout after {@link LOADING_OVERLAY_FADE_MS}.
 * Idempotent: safe to call multiple times.
 */
export function hideLoading(): void {
  const el = loadingOverlay;
  if (!(el instanceof HTMLElement)) {
    document.getElementById('app-container')?.removeAttribute('aria-busy');
    return;
  }
  if (el.classList.contains('hide')) {
    document.getElementById('app-container')?.removeAttribute('aria-busy');
    return;
  }
  if (el.classList.contains(LOADING_OVERLAY_HIDDEN_CLASS)) {
    document.getElementById('app-container')?.removeAttribute('aria-busy');
    return;
  }
  el.removeAttribute('aria-busy');
  el.setAttribute('aria-hidden', 'true');
  document.getElementById('app-container')?.removeAttribute('aria-busy');

  window.clearTimeout(loadingOverlayHideFinalizeTimer);
  el.classList.add(LOADING_OVERLAY_HIDDEN_CLASS);
  el.style.setProperty('pointer-events', 'none', 'important');

  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    finalizeLoadingOverlayHidden(el);
    return;
  }

  loadingOverlayHideFinalizeTimer = window.setTimeout(() => {
    loadingOverlayHideFinalizeTimer = 0;
    finalizeLoadingOverlayHidden(el);
  }, LOADING_OVERLAY_FADE_MS);
}

export function showError(element: HTMLElement | null, message: string): void {
  if (!element) return;
  element.textContent = message;
  element.classList.remove('hide');
}

export function clearError(element: HTMLElement | null): void {
  if (!element) return;
  element.textContent = '';
  element.classList.add('hide');
}

export type AppToastKind = 'success' | 'error' | 'info';

const LMS_TOAST_HOST_ID = 'lms-toast-host';

function ensureToastHost(): HTMLElement {
  let host = document.getElementById(LMS_TOAST_HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = LMS_TOAST_HOST_ID;
    host.className =
      'pointer-events-none fixed bottom-4 left-1/2 z-[10001] flex w-[min(100%-2rem,28rem)] max-w-md -translate-x-1/2 flex-col gap-2';
    document.body.appendChild(host);
  }
  return host;
}

const TOAST_STYLES: Record<AppToastKind, string> = {
  success:
    'pointer-events-auto rounded-xl border border-primary-400/35 bg-dark-950/95 px-4 py-3 text-sm text-primary-100 shadow-xl backdrop-blur-md',
  error:
    'pointer-events-auto rounded-xl border border-red-500/40 bg-dark-950/95 px-4 py-3 text-sm text-red-100 shadow-xl backdrop-blur-md',
  info: 'pointer-events-auto rounded-xl border border-secondary-400/30 bg-dark-950/95 px-4 py-3 text-sm text-dark-100 shadow-xl backdrop-blur-md',
};

/**
 * Turns thrown values into short, user-facing copy (no stack traces or verbose SDK dumps).
 * `context` should be a full sentence or clause ending with punctuation, e.g. "Could not save your profile."
 */
export function formatErrorForUserToast(err: unknown, context: string): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: string }).code)
      : '';
  if (code === 'permission-denied') {
    return `${context} You do not have permission. Contact an administrator if you need access.`;
  }
  if (code === 'unavailable' || code === 'deadline-exceeded' || code === 'resource-exhausted') {
    return `${context} The service is busy. Please wait a moment and try again.`;
  }
  if (code === 'failed-precondition' || code === 'aborted') {
    return `${context} The request could not be completed. Please try again.`;
  }
  if (code === 'unauthenticated' || code === 'auth/network-request-failed') {
    return `${context} Your session may have expired or the network dropped. Sign in again and retry.`;
  }
  const msg = err instanceof Error ? err.message : '';
  const safe =
    msg &&
    msg.length < 180 &&
    !/^\s*FirebaseError/i.test(msg) &&
    !/\bat\s+[\w.$]+\s*\(/i.test(msg) &&
    !/\n\s*at\s/.test(msg);
  return safe
    ? `${context} ${msg}`
    : `${context} Please try again, or refresh the page if the problem continues.`;
}

/** Short-lived toast for confirmations and errors (replaces `alert` in production flows). */
export function showAppToast(message: string, kind: AppToastKind = 'info'): void {
  const text = typeof message === 'string' ? message : String(message ?? '');
  const host = ensureToastHost();
  const el = document.createElement('div');
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.className = TOAST_STYLES[kind];
  el.textContent = text;
  host.appendChild(el);
  const ttl = kind === 'error' ? 10_000 : 5_000;
  window.setTimeout(() => {
    try {
      el.remove();
    } catch {
      /* ignore */
    }
    try {
      if (host.childElementCount === 0) host.remove();
    } catch {
      /* ignore */
    }
  }, ttl);
}

const FIREBASE_CONFIG_BANNER_ID = 'firebase-config-error-banner';

/** Shows a persistent, accessible banner when Firebase cannot start (missing .env, etc.). */
export function showFirebaseConfigurationError(message: string): void {
  const root = document.getElementById('auth-container') ?? document.body;
  if (document.getElementById(FIREBASE_CONFIG_BANNER_ID)) return;
  const banner = document.createElement('div');
  banner.id = FIREBASE_CONFIG_BANNER_ID;
  banner.setAttribute('role', 'alert');
  banner.className = [
    'mx-auto m-4 max-w-lg rounded-xl border border-red-500/35 bg-dark-950/95 px-4 py-3 text-sm text-red-100 shadow-xl backdrop-blur-md',
    'dark:border-red-500/35 dark:bg-dark-950/95 dark:text-red-100',
  ].join(' ');
  banner.textContent = message;
  root.insertBefore(banner, root.firstChild);
}

const INIT_ERROR_BANNER_ID = 'app-init-error-banner';

/** User-visible message when initialization throws after the shell is shown. */
export function showBootstrapError(message: string): void {
  const root =
    document.getElementById('app-container') ??
    document.getElementById('auth-container') ??
    document.body;
  if (document.getElementById(INIT_ERROR_BANNER_ID)) return;
  const banner = document.createElement('div');
  banner.id = INIT_ERROR_BANNER_ID;
  banner.setAttribute('role', 'alert');
  banner.className = [
    'mx-auto m-4 max-w-lg rounded-xl border border-secondary-400/35 bg-dark-950/95 px-4 py-3 text-sm text-amber-100 shadow-xl backdrop-blur-md',
    'dark:border-secondary-400/35 dark:bg-dark-950/95 dark:text-amber-100',
  ].join(' ');
  banner.textContent = message;
  root.insertBefore(banner, root.firstChild);
}

function clearForms(): void {
  loginForm?.reset();
  signupForm?.reset();
  clearError(loginError);
  clearError(signupError);
}

/** Opens the AI results modal with a sanitized HTML body. */
export function showModal(title: string, content: string, options?: ShowModalOptions): void {
  ensureDeferredShellFragmentsSync();
  if (!aiModal || !aiModalTitle || !aiModalContent) {
    aiModal = document.getElementById('ai-modal');
    aiModalTitle = document.getElementById('ai-modal-title');
    aiModalContent = document.getElementById('ai-modal-content');
    installAiModalDelegatedClicks();
  }
  modalOnDismiss = options?.onDismiss ?? null;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        if (aiModalLayerCleanup) {
          aiModalLayerCleanup();
          aiModalLayerCleanup = null;
        }
        if (aiModal instanceof HTMLElement) {
          aiModal.style.removeProperty('display');
          aiModal.style.removeProperty('pointer-events');
        }
        if (aiModalTitle) aiModalTitle.textContent = title ?? '';
        if (aiModalContent) {
          renderTemplate(aiModalContent, sanitizeHTML(typeof content === 'string' ? content : ''));
        }
        aiModal?.classList.remove('hide');
        aiModal?.setAttribute('aria-hidden', 'false');
        const panel = document.getElementById('ai-modal-panel');
        const closeBtn = document.getElementById('ai-modal-close');
        if (panel instanceof HTMLElement) {
          aiModalLayerCleanup = activateModalLayer(panel, {
            onEscape: () => {
              closeModal();
            },
            initialFocus: closeBtn instanceof HTMLElement ? closeBtn : null,
          });
        }
      } catch {
        /* DOM not ready */
      }
    });
  });
}

function runModalDismissPipeline(): void {
  if (aiModalLayerCleanup) {
    aiModalLayerCleanup();
    aiModalLayerCleanup = null;
  }
  aiModal?.classList.add('hide');
  aiModal?.setAttribute('aria-hidden', 'true');
  const modalEl = aiModal;
  if (modalEl instanceof HTMLElement) {
    modalEl.style.setProperty('display', 'none', 'important');
    modalEl.style.setProperty('pointer-events', 'none', 'important');
  }
  const cb = modalOnDismiss;
  modalOnDismiss = null;
  if (!cb) return;
  const invokeDismiss = (): void => {
    try {
      const out = cb();
      if (out != null && typeof (out as Promise<unknown>).then === 'function') {
        void (out as Promise<unknown>).catch(() => {
          /* InPrivate / auth: never block UI after modal is hidden */
        });
      }
    } catch {
      /* dismiss callbacks must not trap the close path */
    }
  };
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        queueMicrotask(invokeDismiss);
      });
    });
  } else {
    queueMicrotask(invokeDismiss);
  }
}

export function closeModal(): void {
  runModalDismissPipeline();
}

export { loginForm, signupForm, logoutBtn, loginError, signupError };

export function getCurrentUserRole(): UserRole | null {
  return currentUserRole;
}
