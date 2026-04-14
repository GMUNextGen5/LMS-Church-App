import {
  TEMPLATE_AI_MODAL,
  TEMPLATE_CHANGE_ROLE_MODAL,
  TEMPLATE_EDIT_STUDENT_MODAL,
  TEMPLATE_LEGAL_MODAL,
  TEMPLATE_REGISTRATION_STUDENT_INNER,
  TEMPLATE_REGISTRATION_TEACHER_INNER,
} from './templates.part';

let deferredShellInjected = false;
let deferredShellScheduled = false;

/**
 * Verifies the critical app shell from `index.html` is present (`#app-mount`, `#dashboard-content`).
 * Does not inject large HTML strings — those are deferred to {@link injectDeferredShellFragments}.
 */
export function injectImmediateShellFragments(): void {
  if (!document.getElementById('app-mount') || !document.getElementById('dashboard-content')) {
    /* Host must include #app-mount and #dashboard-content from index.html. */
  }
}

/**
 * Heavy shells (registration tab bodies, global modals). The main `#dashboard-content` shell
 * stays in `index.html` — this work is deferred so the first paint can stay interactive.
 */
export function injectDeferredShellFragments(): void {
  if (deferredShellInjected) return;

  const reg = document.getElementById('registration-content');
  if (reg && reg.childElementCount === 0) {
    reg.innerHTML = TEMPLATE_REGISTRATION_STUDENT_INNER.trim();
  }

  const teacher = document.getElementById('teacher-registration-content');
  if (teacher && teacher.childElementCount === 0) {
    teacher.innerHTML = TEMPLATE_REGISTRATION_TEACHER_INNER.trim();
  }

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

  deferredShellInjected = true;
}

/** Injects registration + modal HTML synchronously (e.g. first open of a modal or registration tab). */
export function ensureDeferredShellFragmentsSync(): void {
  injectDeferredShellFragments();
}

/**
 * Schedules deferred injection via `requestIdleCallback` (timeout 500ms) or `setTimeout(500)`.
 */
export function scheduleDeferredShellFragments(onComplete?: () => void): void {
  if (deferredShellInjected) {
    queueMicrotask(() => {
      try {
        onComplete?.();
      } catch {
        /* host DOM */
      }
    });
    return;
  }
  if (deferredShellScheduled) {
    return;
  }
  deferredShellScheduled = true;

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
 * Boots the shell in two phases: immediate verification only, then idle-scheduled heavy HTML.
 * Prefer {@link scheduleDeferredShellFragments} from UI init so modals are not parsed synchronously.
 */
export function injectShellFragments(): void {
  injectImmediateShellFragments();
  scheduleDeferredShellFragments();
}
