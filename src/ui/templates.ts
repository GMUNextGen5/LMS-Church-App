import {
  TEMPLATE_AI_MODAL,
  TEMPLATE_CHANGE_ROLE_MODAL,
  TEMPLATE_EDIT_STUDENT_MODAL,
  TEMPLATE_LEGAL_MODAL,
  TEMPLATE_REGISTRATION_STUDENT_INNER,
  TEMPLATE_REGISTRATION_TEACHER_INNER,
} from './templates.part';

/**
 * Injects heavy, static shells that previously lived in index.html (runs once at init).
 * Order: registration tabs → global modals under `#lms-deferred-modals-root`.
 */
export function injectShellFragments(): void {
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
}
