import { User, UserRole } from '../core/types';
import DOMPurify from 'dompurify';

export function sanitizeHTML(html: string): string {
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
      'class', 'id', 'style',
      'href', 'target', 'rel',
      'colspan', 'rowspan'
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button']
  });
}

const authContainer = document.getElementById('auth-container')!;
const appContainer = document.getElementById('app-container')!;
const loginFormContainer = document.getElementById('login-form-container')!;
const signupFormContainer = document.getElementById('signup-form-container')!;
const loginTabBtn = document.getElementById('login-tab-btn');
const signupTabBtn = document.getElementById('signup-tab-btn');
const loginForm = document.getElementById('login-form') as HTMLFormElement;
const signupForm = document.getElementById('signup-form') as HTMLFormElement;
const loginError = document.getElementById('login-error')!;
const signupError = document.getElementById('signup-error')!;
const logoutBtn = document.getElementById('logout-btn')!;
const userEmail = document.getElementById('user-email')!;
const userRoleBadge = document.getElementById('user-role-badge')!;
const loadingOverlay = document.getElementById('loading-overlay')!;
const aiModal = document.getElementById('ai-modal');
const aiModalTitle = document.getElementById('ai-modal-title');
const aiModalContent = document.getElementById('ai-modal-content');
const aiModalClose = document.getElementById('ai-modal-close');

let currentUserRole: UserRole | null = null;

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
  if (tab === 'login') {
    loginFormContainer.classList.remove('hide');
    signupFormContainer.classList.add('hide');
    loginTabBtn?.classList.add('tab-active');
    signupTabBtn?.classList.remove('tab-active');
    signupTabBtn?.classList.add('text-dark-300');
    loginTabBtn?.classList.remove('text-dark-300');
    clearError(loginError);
  } else {
    signupFormContainer.classList.remove('hide');
    loginFormContainer.classList.add('hide');
    signupTabBtn?.classList.add('tab-active');
    loginTabBtn?.classList.remove('tab-active');
    loginTabBtn?.classList.add('text-dark-300');
    signupTabBtn?.classList.remove('text-dark-300');
    clearError(signupError);
  }
}

export function showAuthContainer(): void {
  authContainer.classList.remove('hide');
  appContainer.classList.add('hide');
  clearForms();
}

export function showAppContainer(): void {
  authContainer.classList.add('hide');
  appContainer.classList.remove('hide');
}

export function configureUIForRole(user: User): void {
  currentUserRole = user.role;
  userEmail.textContent = user.email;
  userRoleBadge.textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);
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

function switchTab(tabName: string): void {
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
  if (tabName === 'attendance' || tabName === 'dashboard') {
    document.dispatchEvent(new CustomEvent('tab-switched', { detail: { tab: tabName } }));
  }
}

export function showLoading(): void {
  loadingOverlay.classList.remove('hide');
}

export function hideLoading(): void {
  loadingOverlay.classList.add('hide');
}

export function showError(element: HTMLElement, message: string): void {
  element.textContent = message;
  element.classList.remove('hide');
}

export function clearError(element: HTMLElement): void {
  element.textContent = '';
  element.classList.add('hide');
}

function clearForms(): void {
  loginForm.reset();
  signupForm.reset();
  clearError(loginError);
  clearError(signupError);
}

export function showModal(title: string, content: string): void {
  if (aiModalTitle) aiModalTitle.textContent = title;
  if (aiModalContent) aiModalContent.innerHTML = sanitizeHTML(content);
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
