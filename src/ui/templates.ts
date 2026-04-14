import {
  TEMPLATE_AI_MODAL,
  TEMPLATE_CHANGE_ROLE_MODAL,
  TEMPLATE_EDIT_STUDENT_MODAL,
  TEMPLATE_LEGAL_MODAL,
  TEMPLATE_REGISTRATION_STUDENT_INNER,
  TEMPLATE_REGISTRATION_TEACHER_INNER,
} from './templates.part';

let modalShellInjected = false;
let modalShellScheduled = false;

/**
 * Verifies the critical app shell from `index.html` is present (`#app-mount`, `#dashboard-content`).
 * Registration tab bodies and global modals are handled by {@link injectRegistrationFragmentsSync}
 * and {@link injectDeferredShellFragments} respectively.
 */
export function injectImmediateShellFragments(): void {
  if (!document.getElementById('app-mount') || !document.getElementById('dashboard-content')) {
    /* Host must include #app-mount and #dashboard-content from index.html. */
  }
}

/**
 * Injects Student / Teacher registration tab HTML synchronously during init (not idle-deferred).
 * Safe to call multiple times; only fills empty hosts.
 */
export function injectRegistrationFragmentsSync(): void {
  const reg = document.getElementById('registration-content');
  if (reg && reg.childElementCount === 0) {
    reg.innerHTML = TEMPLATE_REGISTRATION_STUDENT_INNER.trim();
  }

  const teacher = document.getElementById('teacher-registration-content');
  if (teacher && teacher.childElementCount === 0) {
    teacher.innerHTML = TEMPLATE_REGISTRATION_TEACHER_INNER.trim();
  }
}

/**
 * Global modals (AI, Legal, edit student, change role) — parsed on idle to keep first paint light.
 * Registration bodies are injected via {@link injectRegistrationFragmentsSync}, not here.
 */
export function injectDeferredShellFragments(): void {
  if (modalShellInjected) return;

  const modalHost = document.getElementById('lms-deferred-modals-root');
  if (modalHost && modalHost.childElementCount === 0) {
    modalHost.innerHTML = [
      TEMPLATE_AI_MODAL,
      TEMPLATE_LEGAL_MODAL,
      TEMPLATE_EDIT_STUDENT_MODAL,
      TEMPLATE_CHANGE_ROLE_MODAL,
    ]
      .join('\n')
      .trim();
  }

  modalShellInjected = true;
}

/** Injects registration (if needed) + modal HTML synchronously (e.g. first open of a modal). */
export function ensureDeferredShellFragmentsSync(): void {
  injectRegistrationFragmentsSync();
  injectDeferredShellFragments();
}

/**
 * Schedules modal injection via `requestIdleCallback` (timeout 500ms) or `setTimeout(500)`.
 */
export function scheduleDeferredShellFragments(onComplete?: () => void): void {
  if (modalShellInjected) {
    queueMicrotask(() => {
      try {
        onComplete?.();
      } catch {
        /* host DOM */
      }
    });
    return;
  }
  if (modalShellScheduled) {
    return;
  }
  modalShellScheduled = true;

  const run = (): void => {
    injectDeferredShellFragments();
    try {
      onComplete?.();
    } catch {
      /* host DOM */
    }
  };

  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(run, { timeout: 500 });
  } else {
    window.setTimeout(run, 500);
  }
}

/**
 * Boots the shell: verify mount points, inject registration HTML synchronously, idle-schedule modals.
 */
export function injectShellFragments(): void {
  injectImmediateShellFragments();
  injectRegistrationFragmentsSync();
  scheduleDeferredShellFragments();
}
