/**
 * Shared shell UI: DOMPurify sanitization, auth/app visibility, tabs, loading overlay, and AI modal host.
 */
import { User, UserRole } from '../types';
import DOMPurify from 'dompurify';

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

/** Sanitizes untrusted HTML for safe insertion via `innerHTML` (AI modal, chat bubbles). */
export function sanitizeHTML(html: string): string {
  installDomPurifyLinkHooks();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'span', 'strong', 'b', 'i', 'em', 'u', 'br', 'hr',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'div', 'section', 'article', 'blockquote', 'pre', 'code',
      'a', 'aside', 'nav', 'header', 'footer',
      'button', 'input',
    ],
    ALLOWED_ATTR: [
      'class', 'id',
      'href', 'target', 'rel',
      'colspan', 'rowspan',
      'type', 'value', 'readonly', 'aria-label',
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form']
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
const aiModal = document.getElementById('ai-modal');
const aiModalTitle = document.getElementById('ai-modal-title');
const aiModalContent = document.getElementById('ai-modal-content');

let currentUserRole: UserRole | null = null;

/** Optional hook invoked after the AI modal is hidden (e.g. sign-out after "Account Created"). */
let modalOnDismiss: (() => void | Promise<void>) | null = null;

export type ShowModalOptions = {
  onDismiss?: () => void | Promise<void>;
};

function runDelegatedModalCopy(
  copyRoot: Element,
  inputSelector: string,
  successStyleSwap?: { add: string[]; remove: string[] },
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
        window.alert('Failed to copy. Please select and copy manually.');
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
    btn.textContent = '✓ Copied!';
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

/** Single listener on `#ai-modal`: innerHTML swaps do not remove it (Account Created / My Account ID). */
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
          runDelegatedModalCopy(
            root,
            '#uid-display',
            {
              add: ['bg-green-500', 'hover:bg-green-600'],
              remove: ['bg-primary-500', 'hover:bg-primary-600'],
            },
            () => {
              closeModal();
            }
          );
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
export function initUI(): void {
  loginTabBtn?.addEventListener('click', () => switchAuthTab('login'));
  signupTabBtn?.addEventListener('click', () => switchAuthTab('signup'));
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement;
      const tabName = target.dataset.tab;
      if (tabName) switchTab(tabName);
    });
  });
  installAiModalDelegatedClicks();
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
 * Shows or hides `.admin-only`, `.teacher-only`, and `.student-only` regions based on `user.role`.
 */
export function configureUIForRole(user: User): void {
  const validRoles: readonly UserRole[] = ['admin', 'teacher', 'student'] as const;
  const role = user?.role;
  const isValidRole = typeof role === 'string' && (validRoles as readonly string[]).includes(role);
  if (!isValidRole) {
    currentUserRole = null;
    // Hide role-based regions until we have a valid profile.
    document.querySelectorAll('.admin-only, .teacher-only, .student-only').forEach(el => {
      (el as HTMLElement).classList.add('hide');
    });
    return;
  }

  currentUserRole = role as UserRole;

  // Query DOM at call-time (module-level lookups can run before DOM is ready).
  const emailEl = document.getElementById('user-email');
  if (emailEl) emailEl.textContent = user.email;

  const roleBadgeEl = document.getElementById('user-role-badge');
  if (roleBadgeEl) {
    roleBadgeEl.textContent = role.charAt(0).toUpperCase() + role.slice(1);
  }
  document.querySelectorAll('.admin-only, .teacher-only, .student-only').forEach(el => {
    (el as HTMLElement).classList.add('hide');
  });
  if (role === 'admin') {
    document.querySelectorAll('.admin-only, .teacher-only').forEach(el => {
      (el as HTMLElement).classList.remove('hide');
    });
  } else if (role === 'teacher') {
    document.querySelectorAll('.teacher-only').forEach(el => {
      (el as HTMLElement).classList.remove('hide');
    });
  } else {
    document.querySelectorAll('.student-only').forEach(el => {
      (el as HTMLElement).classList.remove('hide');
    });
  }
}

const VALID_MAIN_TABS = new Set([
  'dashboard', 'grades', 'attendance', 'assessments', 'classes', 'registration',
  'teacher-registration', 'users', 'ai-agent', 'student-profile',
]);

/**
 * Activates a main LMS tab from the top tab bar: updates `.tab-btn` / `.tab-content` and emits `tab-switched`.
 */
function switchTab(tabName: string): void {
  if (!VALID_MAIN_TABS.has(tabName)) return;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('tab-active');
    btn.classList.add('text-dark-300');
  });
  const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  if (activeBtn) {
    activeBtn.classList.add('tab-active');
    activeBtn.classList.remove('text-dark-300');
  }
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.add('hide');
  });
  const activeContent = document.getElementById(`${tabName}-content`);
  if (activeContent) activeContent.classList.remove('hide');
  document.dispatchEvent(new CustomEvent('tab-switched', { detail: { tab: tabName } }));
}

function resetLoadingOverlayImportantStyles(el: HTMLElement): void {
  el.style.removeProperty('display');
  el.style.removeProperty('visibility');
  el.style.removeProperty('pointer-events');
  el.style.removeProperty('z-index');
}

export function showLoading(): void {
  const el = loadingOverlay;
  if (el instanceof HTMLElement) {
    resetLoadingOverlayImportantStyles(el);
    el.classList.remove('hide', 'hidden');
  }
}

/** Forces the overlay off the interactive plane even if CSS transitions or classes fail. */
export function hideLoading(): void {
  const el = loadingOverlay;
  if (el instanceof HTMLElement) {
    el.classList.add('hide', 'hidden');
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
    el.style.setProperty('z-index', '-1', 'important');
  }
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

const FIREBASE_CONFIG_BANNER_ID = 'firebase-config-error-banner';

/** Shows a persistent, accessible banner when Firebase cannot start (missing .env, etc.). */
export function showFirebaseConfigurationError(message: string): void {
  const root = document.getElementById('auth-container') ?? document.body;
  if (document.getElementById(FIREBASE_CONFIG_BANNER_ID)) return;
  const banner = document.createElement('div');
  banner.id = FIREBASE_CONFIG_BANNER_ID;
  banner.setAttribute('role', 'alert');
  banner.className = [
    'mx-auto max-w-lg rounded-lg border px-4 py-3 text-sm shadow-lg m-4',
    // Light theme
    'bg-red-50 text-red-900 border-red-300',
    // Dark theme
    'dark:bg-red-950/90 dark:text-red-100 dark:border-red-500/40',
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
    'mx-auto max-w-lg rounded-lg border px-4 py-3 text-sm shadow-lg m-4',
    // Light theme
    'bg-amber-50 text-amber-900 border-amber-300',
    // Dark theme
    'dark:bg-amber-950/90 dark:text-amber-100 dark:border-amber-500/40',
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
  modalOnDismiss = options?.onDismiss ?? null;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        if (aiModal instanceof HTMLElement) {
          aiModal.style.removeProperty('display');
          aiModal.style.removeProperty('pointer-events');
        }
        if (aiModalTitle) aiModalTitle.textContent = title ?? '';
        if (aiModalContent) {
          aiModalContent.innerHTML = sanitizeHTML(typeof content === 'string' ? content : '');
        }
        aiModal?.classList.remove('hide');
      } catch {
        /* DOM not ready */
      }
    });
  });
}

function runModalDismissPipeline(): void {
  aiModal?.classList.add('hide');
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

export {
  loginForm,
  signupForm,
  logoutBtn,
  loginError,
  signupError
};

export function getCurrentUserRole(): UserRole | null {
  return currentUserRole;
}
