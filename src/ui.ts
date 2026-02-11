/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UI MANAGEMENT AND INTERACTION LOGIC
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Centralized UI state management, DOM manipulation, and user interaction
 * handling. Controls visibility and behavior of UI components based on
 * authentication state and user role.
 * 
 * ARCHITECTURE:
 * 
 * UI LAYERS:
 * 1. Authentication Layer (auth-container)
 *    - Login form
 *    - Signup form
 *    - Tab switching between login/signup
 * 
 * 2. Application Layer (app-container)
 *    - Dashboard (all roles)
 *    - Grades (all roles, different views)
 *    - Attendance (all roles, different views)
 *    - User Management (admin only)
 *    - Student Registration (admin only)
 *    - AI Agent Chat (admin only)
 *    - Student Profile (student only)
 * 
 * ROLE-BASED UI:
 * 
 * UI elements are shown/hidden using CSS classes:
 * - .admin-only: Only visible to admin
 * - .teacher-only: Visible to teacher and admin
 * - .student-only: Only visible to student
 * 
 * VISIBILITY RULES:
 * - Admin sees: admin-only + teacher-only elements (full access)
 * - Teacher sees: teacher-only elements only (no admin features)
 * - Student sees: student-only elements only (restricted view)
 * 
 * STATE MANAGEMENT:
 * 
 * - currentUserRole: Cached user role for quick access
 * - DOM element references: Cached at module load for performance
 * - Loading overlay: Global loading indicator
 * - Modal system: Generic modal for AI responses and notifications
 * 
 * TAB SYSTEM:
 * 
 * Main application uses tab navigation:
 * - .tab-btn elements trigger tab switches
 * - .tab-content elements show/hide based on active tab
 * - .tab-active class indicates active tab
 * - Custom events fired on tab switch for data loading
 * 
 * MODAL SYSTEM:
 * 
 * Generic modal for displaying:
 * - AI-generated summaries
 * - Study tips
 * - UID information
 * - Success/error messages
 * 
 * Features:
 * - Click backdrop to close
 * - Close button
 * - HTML content support
 * - Keyboard shortcuts (future enhancement)
 * 
 * LOADING INDICATOR:
 * 
 * Global loading overlay shows during:
 * - Authentication operations
 * - Data fetching
 * - API calls to Cloud Functions
 * - Form submissions
 * 
 * Prevents user interaction during async operations.
 * 
 * ERROR HANDLING:
 * 
 * Error display patterns:
 * - Form errors: Shown below form with .hide class toggle
 * - Red text for errors
 * - Auto-clear on form resubmit
 * - User-friendly messages
 * 
 * DEBUGGING:
 * 
 * IF UI DOESN'T UPDATE:
 * 1. Check console for errors
 * 2. Verify element IDs match HTML
 * 3. Check .hide class is properly toggled
 * 4. Verify role-based classes are correct
 * 5. Check currentUserRole is set
 * 6. Inspect DOM to see actual classes applied
 * 
 * IF WRONG ELEMENTS SHOW:
 * 1. Check user role in console
 * 2. Verify configureUIForRole was called
 * 3. Check role-based CSS classes (.admin-only, etc.)
 * 4. Inspect HTML for correct class usage
 * 5. Check for CSS specificity issues
 * 
 * IF TABS DON'T SWITCH:
 * 1. Check tab-btn data-tab attribute matches content ID
 * 2. Verify switchTab function is called
 * 3. Check console for JavaScript errors
 * 4. Verify event listeners are attached
 * 
 * PERFORMANCE:
 * 
 * - DOM elements cached at module load (no repeated queries)
 * - Class toggling preferred over style manipulation
 * - Event delegation where appropriate
 * - Minimal reflows/repaints
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { User, UserRole } from './types';

// XSS Protection: Import DOMPurify for sanitizing HTML content
import DOMPurify from 'dompurify';

/**
 * Sanitize HTML content to prevent XSS attacks
 * 
 * SECURITY: All dynamic HTML content MUST be sanitized before
 * being rendered via innerHTML. This prevents:
 * - Script injection attacks
 * - Event handler injection (onclick, onerror, etc.)
 * - Malicious iframe/embed injection
 * - Data exfiltration via CSS
 * 
 * @param html - Raw HTML string to sanitize
 * @returns Sanitized HTML safe for innerHTML
 */
export function sanitizeHTML(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      // Text formatting
      'p', 'span', 'strong', 'b', 'i', 'em', 'u', 'br', 'hr',
      // Headers
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      // Lists
      'ul', 'ol', 'li',
      // Tables
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      // Structure
      'div', 'section', 'article', 'blockquote', 'pre', 'code',
      // Links (href will be sanitized)
      'a',
      // AI card styling classes
      'aside', 'nav', 'header', 'footer'
    ],
    ALLOWED_ATTR: [
      'class', 'id', 'style',
      'href', 'target', 'rel',
      'colspan', 'rowspan'
    ],
    // Strip dangerous protocols
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    // Prevent data exfiltration
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button']
  });
}

// DOM Elements - Authentication
const authContainer = document.getElementById('auth-container')!;
const appContainer = document.getElementById('app-container')!;
const loginFormContainer = document.getElementById('login-form-container')!;
const signupFormContainer = document.getElementById('signup-form-container')!;
const loginTabBtn = document.getElementById('login-tab-btn')!;
const signupTabBtn = document.getElementById('signup-tab-btn')!;
const loginForm = document.getElementById('login-form') as HTMLFormElement;
const signupForm = document.getElementById('signup-form') as HTMLFormElement;
const loginError = document.getElementById('login-error')!;
const signupError = document.getElementById('signup-error')!;

// DOM Elements - App
const logoutBtn = document.getElementById('logout-btn')!;
const userEmail = document.getElementById('user-email')!;
const userRoleBadge = document.getElementById('user-role-badge')!;
const loadingOverlay = document.getElementById('loading-overlay')!;
const aiModal = document.getElementById('ai-modal')!;
const aiModalTitle = document.getElementById('ai-modal-title')!;
const aiModalContent = document.getElementById('ai-modal-content')!;
const aiModalClose = document.getElementById('ai-modal-close')!;

// Current state
let currentUserRole: UserRole | null = null;

// Initialize UI event listeners
export function initUI(): void {
  // Auth tab switching
  loginTabBtn.addEventListener('click', () => switchAuthTab('login'));
  signupTabBtn.addEventListener('click', () => switchAuthTab('signup'));

  // Tab navigation
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement;
      const tabName = target.dataset.tab;
      if (tabName) {
        switchTab(tabName);
      }
    });
  });

  // Modal close
  aiModalClose.addEventListener('click', closeModal);
  aiModal.addEventListener('click', (e) => {
    if (e.target === aiModal) {
      closeModal();
    }
  });

}

// Switch between login and signup forms
function switchAuthTab(tab: 'login' | 'signup'): void {
  if (tab === 'login') {
    loginFormContainer.classList.remove('hide');
    signupFormContainer.classList.add('hide');
    loginTabBtn.classList.add('tab-active');
    signupTabBtn.classList.remove('tab-active');
    signupTabBtn.classList.add('text-dark-300');
    loginTabBtn.classList.remove('text-dark-300');
    clearError(loginError);
  } else {
    signupFormContainer.classList.remove('hide');
    loginFormContainer.classList.add('hide');
    signupTabBtn.classList.add('tab-active');
    loginTabBtn.classList.remove('tab-active');
    loginTabBtn.classList.add('text-dark-300');
    signupTabBtn.classList.remove('text-dark-300');
    clearError(signupError);
  }
}

// Show/hide authentication container
export function showAuthContainer(): void {
  authContainer.classList.remove('hide');
  appContainer.classList.add('hide');
  clearForms();
}

// Show/hide app container
export function showAppContainer(): void {
  authContainer.classList.add('hide');
  appContainer.classList.remove('hide');
}

// Configure UI based on user role
export function configureUIForRole(user: User): void {
  currentUserRole = user.role;

  // Update user info display
  userEmail.textContent = user.email;
  userRoleBadge.textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);

  // Hide all role-specific elements
  document.querySelectorAll('.admin-only, .teacher-only, .student-only').forEach(el => {
    (el as HTMLElement).classList.add('hide');
  });

  // Show elements based on role
  if (user.role === 'admin') {
    // Admin sees everything (admin + teacher views)
    document.querySelectorAll('.admin-only, .teacher-only').forEach(el => {
      (el as HTMLElement).classList.remove('hide');
    });
  } else if (user.role === 'teacher') {
    // Teacher sees only teacher views
    document.querySelectorAll('.teacher-only').forEach(el => {
      (el as HTMLElement).classList.remove('hide');
    });
  } else {
    // Student/Parent sees only student views
    document.querySelectorAll('.student-only').forEach(el => {
      (el as HTMLElement).classList.remove('hide');
    });
  }

}

// Switch between main app tabs
function switchTab(tabName: string): void {
  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('tab-active');
    btn.classList.add('text-dark-300');
  });

  const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  if (activeBtn) {
    activeBtn.classList.add('tab-active');
    activeBtn.classList.remove('text-dark-300');
  }

  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.add('hide');
  });

  const activeContent = document.getElementById(`${tabName}-content`);
  if (activeContent) {
    activeContent.classList.remove('hide');
  }

  // Load data when switching to specific tabs
  if (tabName === 'attendance') {
    // Trigger attendance loading if student is selected
    const event = new CustomEvent('tab-switched', { detail: { tab: tabName } });
    document.dispatchEvent(event);
  } else if (tabName === 'dashboard') {
    // Reload recent activity when switching to dashboard
    const event = new CustomEvent('tab-switched', { detail: { tab: tabName } });
    document.dispatchEvent(event);
  }
}

// Loading state
export function showLoading(): void {
  loadingOverlay.classList.remove('hide');
}

export function hideLoading(): void {
  loadingOverlay.classList.add('hide');
}

// Error handling
export function showError(element: HTMLElement, message: string): void {
  element.textContent = message;
  element.classList.remove('hide');
}

export function clearError(element: HTMLElement): void {
  element.textContent = '';
  element.classList.add('hide');
}

// Clear all forms
function clearForms(): void {
  loginForm.reset();
  signupForm.reset();
  clearError(loginError);
  clearError(signupError);
}

// Modal handling - SECURITY: Content is sanitized to prevent XSS
export function showModal(title: string, content: string): void {
  aiModalTitle.textContent = title;
  // SECURITY FIX (2025-01-26): Sanitize AI-generated HTML content
  aiModalContent.innerHTML = sanitizeHTML(content);
  aiModal.classList.remove('hide');
}

export function closeModal(): void {
  aiModal.classList.add('hide');
}

// Export form elements and error elements for use in main.ts
export {
  loginForm,
  signupForm,
  logoutBtn,
  loginError,
  signupError
};

// Get current user role
export function getCurrentUserRole(): UserRole | null {
  return currentUserRole;
}

