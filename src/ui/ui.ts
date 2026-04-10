/**
 * Shared shell UI: DOMPurify sanitization, auth/app visibility, tabs, loading overlay, and AI modal host.
 */
import { User, UserRole } from '../core/types';
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
      'a', 'aside', 'nav', 'header', 'footer'
    ],
    ALLOWED_ATTR: [
      'class', 'id',
      'href', 'target', 'rel',
      'colspan', 'rowspan'
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button']
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
const userEmail = document.getElementById('user-email');
const userRoleBadge = document.getElementById('user-role-badge');
const loadingOverlay = document.getElementById('loading-overlay');
const aiModal = document.getElementById('ai-modal');
const aiModalTitle = document.getElementById('ai-modal-title');
const aiModalContent = document.getElementById('ai-modal-content');
const aiModalClose = document.getElementById('ai-modal-close');

let currentUserRole: UserRole | null = null;

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
  aiModalClose?.addEventListener('click', closeModal);
  aiModal?.addEventListener('click', (e) => {
    if (e.target === aiModal) closeModal();
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
  authContainer?.classList.remove('hide');
  appContainer?.classList.add('hide');
  clearForms();
}

export function showAppContainer(): void {
  authContainer?.classList.add('hide');
  appContainer?.classList.remove('hide');
}

/**
 * Shows or hides `.admin-only`, `.teacher-only`, and `.student-only` regions based on `user.role`.
 */
export function configureUIForRole(user: User): void {
  currentUserRole = user.role;
  if (userEmail) userEmail.textContent = user.email;
  if (userRoleBadge) {
    userRoleBadge.textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);
  }
  document.querySelectorAll('.admin-only, .teacher-only, .student-only').forEach(el => {
    (el as HTMLElement).classList.add('hide');
  });
  if (user.role === 'admin') {
    document.querySelectorAll('.admin-only, .teacher-only').forEach(el => {
      (el as HTMLElement).classList.remove('hide');
    });
  } else if (user.role === 'teacher') {
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

export function showLoading(): void {
  loadingOverlay?.classList.remove('hide');
}

export function hideLoading(): void {
  loadingOverlay?.classList.add('hide');
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
export function showModal(title: string, content: string): void {
  if (aiModalTitle) aiModalTitle.textContent = title ?? '';
  if (aiModalContent) aiModalContent.innerHTML = sanitizeHTML(typeof content === 'string' ? content : '');
  aiModal?.classList.remove('hide');
}

export function closeModal(): void {
  aiModal?.classList.add('hide');
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
