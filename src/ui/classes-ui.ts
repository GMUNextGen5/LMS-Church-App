/**
 * Classes tab UI. Role-adaptive views (student / teacher / admin). Renders into #classes-content. Modals portaled to body.
 */
import { activateModalLayer } from '../core/modal-focus';
import { getCurrentUser } from '../core/auth';
import { fetchStudents, fetchAllUsers, fetchAllStudentProfiles } from '../data/data';
import { showLoading, hideLoading, showAppToast, formatErrorForUserToast } from './ui';
import { escapeHtmlText as esc, renderTemplate, renderErrorPanel } from './dom-render';
import {
  fetchStudentClasses,
  fetchTeacherClasses,
  fetchAllClasses,
  fetchClassRoster,
  getCourse,
  createClass,
  updateClass,
  deleteClass,
  addStudentsToClass,
  removeStudentsFromClass,
  assignTeacherToClass,
  getUserDisplayName,
  userProfileDisplayLabel,
} from '../data/classes-data';
import { fetchStudentAssessments } from '../data/assessment-data';
import { safeCourseDisplayName, safeStudentDisplayName } from '../core/display-fallbacks';
import type { Course, Student, User } from '../types';

let container: HTMLElement | null = null;

// Admin: cached for teacher dropdown and "available students" in roster
let cachedTeachers: User[] = [];
let cachedAllStudents: Student[] = [];
// Teacher: cached courses so roster panel can compute enrolled/available
let cachedTeacherCourses: Course[] = [];

// ─── helpers ────────────────────────────────────────────────────────────────

function sectionHeader(title: string, rightHtml?: string): string {
  return `
    <div class="flex items-center justify-between gap-3">
      <h2 class="text-xl font-bold text-white font-display">${esc(title)}</h2>
      <div class="flex items-center gap-2 shrink-0">${rightHtml || ''}</div>
    </div>`;
}

function emptyState(title: string, subtitle?: string, ctaHtml?: string): string {
  const cta = ctaHtml
    ? `<div class="mt-6 flex flex-wrap justify-center gap-3">${ctaHtml}</div>`
    : '';
  return `
    <div class="text-center py-16 px-4">
      <p class="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-dark-500 mb-2">DSKM LMS</p>
      <div class="text-4xl mb-3 opacity-30" aria-hidden="true">📚</div>
      <h3 class="text-white font-semibold text-lg">${esc(title)}</h3>
      ${subtitle ? `<p class="text-dark-400 text-sm mt-1 max-w-md mx-auto">${esc(subtitle)}</p>` : ''}
      ${cta}
    </div>`;
}

// ─── Custom student checkbox-dropdown helpers ────────────────────────────────

/**
 * Populate a .student-dropdown with checkboxes for the given students.
 * `owner` is "admin" or "teacher" so we can find the right dropdown.
 */
function populateStudentDropdown(
  owner: 'admin' | 'teacher',
  students: { id: string; name: string }[],
  preselected?: Set<string>
): void {
  const modal =
    owner === 'admin'
      ? document.getElementById('class-form-modal')
      : document.getElementById('teacher-class-form-modal');
  if (!modal) return;
  const dd = modal.querySelector(`.student-dropdown[data-owner="${owner}"]`) as HTMLElement | null;
  if (!dd) return;

  const menu = dd.querySelector('.student-dropdown-menu') as HTMLElement;
  const menuHtml =
    students.length === 0
      ? '<p class="px-3 py-2 text-dark-500 text-sm">No students available</p>'
      : students
          .map((s) => {
            const checked = preselected?.has(s.id) ? 'checked' : '';
            return `<label class="student-dropdown-item flex items-center gap-2 px-3 py-1.5 hover:bg-dark-600/60 cursor-pointer text-sm text-white">
          <input type="checkbox" value="${esc(s.id)}" ${checked} class="accent-primary-500" /> ${esc(safeStudentDisplayName(s.name))}
        </label>`;
          })
          .join('');
  renderTemplate(menu, menuHtml);

  updateDropdownLabel(dd, preselected?.size ?? 0);

  // Toggle menu open/close
  const toggleBtn = dd.querySelector('.student-dropdown-toggle') as HTMLElement;
  // Remove old listener by cloning
  const newToggle = toggleBtn.cloneNode(true) as HTMLElement;
  toggleBtn.parentNode!.replaceChild(newToggle, toggleBtn);
  newToggle.addEventListener('click', () => {
    menu.classList.toggle('hidden');
  });

  // Update label on checkbox change
  menu.addEventListener('change', () => {
    const count = menu.querySelectorAll('input[type="checkbox"]:checked').length;
    updateDropdownLabel(dd, count);
  });
}

function updateDropdownLabel(dd: HTMLElement, count: number): void {
  const label = dd.querySelector('.student-dropdown-label') as HTMLElement;
  if (label) {
    label.textContent =
      count === 0 ? '— Select students —' : `${count} student${count !== 1 ? 's' : ''} selected`;
  }
}

// Close student dropdown when clicking outside
document.addEventListener('click', (e) => {
  document.querySelectorAll('.student-dropdown').forEach((dd) => {
    if (!dd.contains(e.target as Node)) {
      dd.querySelector('.student-dropdown-menu')?.classList.add('hidden');
    }
  });
});

/** Get the IDs of all checked students from the custom dropdown. */
function getSelectedStudentIds(owner: 'admin' | 'teacher'): string[] {
  const modal =
    owner === 'admin'
      ? document.getElementById('class-form-modal')
      : document.getElementById('teacher-class-form-modal');
  if (!modal) return [];
  const checks = modal.querySelectorAll(
    `.student-dropdown[data-owner="${owner}"] input[type="checkbox"]:checked`
  );
  return Array.from(checks).map((cb) => (cb as HTMLInputElement).value);
}

// ─── Modal portal system ────────────────────────────────────────────────────
// Modals live in <body> so z-index is never trapped by parent stacking contexts.

let adminModalEl: HTMLElement | null = null;
let teacherModalEl: HTMLElement | null = null;

let adminClassModalCleanup: (() => void) | null = null;
let teacherClassModalCleanup: (() => void) | null = null;

/** Create (once) or return the admin Create/Edit Class modal overlay. */
function getAdminModal(): HTMLElement {
  if (adminModalEl && document.body.contains(adminModalEl)) return adminModalEl;
  adminModalEl = document.createElement('div');
  adminModalEl.id = 'class-form-modal';
  adminModalEl.className = 'classes-modal-overlay is-hidden';
  renderTemplate(
    adminModalEl,
    `
    <div id="class-form-modal-panel" class="classes-modal-box lms-modal-surface w-full max-w-2xl" role="dialog" aria-modal="true" aria-labelledby="class-form-title">
      <h3 id="class-form-title" class="text-lg font-bold text-white mb-4">Create Class</h3>
      <form id="class-form" data-course-id="">
        <div class="space-y-4">
          <div>
            <label class="block text-dark-300 text-sm mb-1">Class name *</label>
            <input name="courseName" type="text" required
              class="w-full px-3 py-2 rounded-lg bg-dark-700 border border-dark-600 text-white text-sm"
              placeholder="e.g. Sunday School A" />
          </div>
          <div>
            <label class="block text-dark-300 text-sm mb-1">Course code</label>
            <input name="courseCode" type="text"
              class="w-full px-3 py-2 rounded-lg bg-dark-700 border border-dark-600 text-white text-sm"
              placeholder="e.g. SS-A" />
          </div>
          <div>
            <label class="block text-dark-300 text-sm mb-1">Schedule</label>
            <input name="schedule" type="text"
              class="w-full px-3 py-2 rounded-lg bg-dark-700 border border-dark-600 text-white text-sm"
              placeholder="e.g. Sundays 9am" />
          </div>
          <div id="admin-teacher-field">
            <label class="block text-dark-300 text-sm mb-1">Teacher</label>
            <select name="teacherId"
              class="w-full px-3 py-2 rounded-lg bg-dark-700 border border-dark-600 text-white text-sm">
              <option value="">— Select —</option>
            </select>
          </div>
          <div id="admin-students-field">
            <label class="block text-dark-300 text-sm mb-1">Students</label>
            <div class="student-dropdown" data-owner="admin">
              <button type="button" class="student-dropdown-toggle w-full px-3 py-2 rounded-lg bg-dark-700 border border-dark-600 text-white text-sm text-left flex items-center justify-between">
                <span class="student-dropdown-label">— Select students —</span>
                <svg class="w-4 h-4 text-dark-400 shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
              </button>
              <div class="student-dropdown-menu hidden"></div>
            </div>
          </div>
          <div>
            <label class="block text-dark-300 text-sm mb-1">Description</label>
            <textarea name="description" rows="2"
              class="w-full px-3 py-2 rounded-lg bg-dark-700 border border-dark-600 text-white text-sm"
              placeholder="Optional"></textarea>
          </div>
        </div>
        <div class="mt-6 flex gap-2 justify-end">
          <button type="button" id="admin-modal-cancel"
            class="px-4 py-2 rounded-lg bg-dark-600 text-dark-200 hover:bg-dark-500">Cancel</button>
          <button type="submit"
            class="px-4 py-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600">Save</button>
        </div>
      </form>
    </div>`
  );
  document.body.appendChild(adminModalEl);

  // Backdrop click → close
  adminModalEl.addEventListener('click', (ev) => {
    if (ev.target === adminModalEl) closeClassFormModal();
  });
  // Cancel button
  adminModalEl
    .querySelector('#admin-modal-cancel')!
    .addEventListener('click', () => closeClassFormModal());
  // Form submit
  adminModalEl
    .querySelector('#class-form')!
    .addEventListener('submit', handleAdminFormSubmit as EventListener);

  adminModalEl.setAttribute('aria-hidden', 'true');
  return adminModalEl;
}

/** Create (once) or return the teacher Create Class modal overlay. */
function getTeacherModal(): HTMLElement {
  if (teacherModalEl && document.body.contains(teacherModalEl)) return teacherModalEl;
  teacherModalEl = document.createElement('div');
  teacherModalEl.id = 'teacher-class-form-modal';
  teacherModalEl.className = 'classes-modal-overlay is-hidden';
  renderTemplate(
    teacherModalEl,
    `
    <div id="teacher-class-form-modal-panel" class="classes-modal-box lms-modal-surface w-full max-w-2xl" role="dialog" aria-modal="true" aria-labelledby="teacher-class-form-title">
      <h3 id="teacher-class-form-title" class="text-lg font-bold text-white mb-4">Create Class</h3>
      <form id="teacher-class-form" data-course-id="">
        <div class="space-y-4">
          <div>
            <label class="block text-dark-300 text-sm mb-1">Class name *</label>
            <input name="courseName" type="text" required
              class="w-full px-3 py-2 rounded-lg bg-dark-700 border border-dark-600 text-white text-sm"
              placeholder="e.g. Sunday School A" />
          </div>
          <div>
            <label class="block text-dark-300 text-sm mb-1">Course code</label>
            <input name="courseCode" type="text"
              class="w-full px-3 py-2 rounded-lg bg-dark-700 border border-dark-600 text-white text-sm"
              placeholder="e.g. SS-A" />
          </div>
          <div>
            <label class="block text-dark-300 text-sm mb-1">Schedule</label>
            <input name="schedule" type="text"
              class="w-full px-3 py-2 rounded-lg bg-dark-700 border border-dark-600 text-white text-sm"
              placeholder="e.g. Sundays 9am" />
          </div>
          <div id="teacher-students-field">
            <label class="block text-dark-300 text-sm mb-1">Students</label>
            <div class="student-dropdown" data-owner="teacher">
              <button type="button" class="student-dropdown-toggle w-full px-3 py-2 rounded-lg bg-dark-700 border border-dark-600 text-white text-sm text-left flex items-center justify-between">
                <span class="student-dropdown-label">— Select students —</span>
                <svg class="w-4 h-4 text-dark-400 shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
              </button>
              <div class="student-dropdown-menu hidden"></div>
            </div>
          </div>
          <div>
            <label class="block text-dark-300 text-sm mb-1">Description</label>
            <textarea name="description" rows="2"
              class="w-full px-3 py-2 rounded-lg bg-dark-700 border border-dark-600 text-white text-sm"
              placeholder="Optional"></textarea>
          </div>
        </div>
        <div class="mt-6 flex gap-2 justify-end">
          <button type="button" id="teacher-modal-cancel"
            class="px-4 py-2 rounded-lg bg-dark-600 text-dark-200 hover:bg-dark-500">Cancel</button>
          <button type="submit"
            class="px-4 py-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600">Save</button>
        </div>
      </form>
    </div>`
  );
  document.body.appendChild(teacherModalEl);

  teacherModalEl.addEventListener('click', (ev) => {
    if (ev.target === teacherModalEl) closeTeacherClassFormModal();
  });
  teacherModalEl
    .querySelector('#teacher-modal-cancel')!
    .addEventListener('click', () => closeTeacherClassFormModal());
  teacherModalEl
    .querySelector('#teacher-class-form')!
    .addEventListener('submit', handleTeacherFormSubmit as EventListener);

  teacherModalEl.setAttribute('aria-hidden', 'true');
  return teacherModalEl;
}

function bindAdminClassModalLayer(modal: HTMLElement): void {
  adminClassModalCleanup?.();
  adminClassModalCleanup = null;
  const panel = document.getElementById('class-form-modal-panel');
  const first = modal.querySelector('[name="courseName"]') as HTMLInputElement | null;
  if (panel instanceof HTMLElement) {
    adminClassModalCleanup = activateModalLayer(panel, {
      onEscape: () => {
        closeClassFormModal();
      },
      initialFocus: first ?? null,
    });
  }
  modal.setAttribute('aria-hidden', 'false');
}

function bindTeacherClassModalLayer(modal: HTMLElement): void {
  teacherClassModalCleanup?.();
  teacherClassModalCleanup = null;
  const panel = document.getElementById('teacher-class-form-modal-panel');
  const first = modal.querySelector('[name="courseName"]') as HTMLInputElement | null;
  if (panel instanceof HTMLElement) {
    teacherClassModalCleanup = activateModalLayer(panel, {
      onEscape: () => {
        closeTeacherClassFormModal();
      },
      initialFocus: first ?? null,
    });
  }
  modal.setAttribute('aria-hidden', 'false');
}

function openClassFormModal(editCourseId?: string): void {
  const modal = getAdminModal();
  const form = modal.querySelector('#class-form') as HTMLFormElement;
  const titleEl = modal.querySelector('#class-form-title')!;

  // Refresh teacher dropdown
  const sel = form.querySelector('[name="teacherId"]') as HTMLSelectElement;
  sel.replaceChildren();
  const optNone = document.createElement('option');
  optNone.value = '';
  optNone.textContent = '— Select —';
  sel.appendChild(optNone);
  for (const t of cachedTeachers) {
    const o = document.createElement('option');
    o.value = t.uid;
    o.textContent = userProfileDisplayLabel(t);
    sel.appendChild(o);
  }

  form.setAttribute('data-course-id', editCourseId || '');
  titleEl.textContent = editCourseId ? 'Edit Class' : 'Create Class';

  if (editCourseId) {
    (async () => {
      const courses = await fetchAllClasses();
      const c = courses.find((x) => x.id === editCourseId);
      if (c) {
        (form.querySelector('[name="courseName"]') as HTMLInputElement).value = c.courseName;
        (form.querySelector('[name="courseCode"]') as HTMLInputElement).value = c.courseCode || '';
        (form.querySelector('[name="schedule"]') as HTMLInputElement).value = c.schedule || '';
        (form.querySelector('[name="description"]') as HTMLTextAreaElement).value =
          c.description || '';
        sel.value = c.teacherId || '';
        // Populate student dropdown with pre-selected enrolled students
        const enrolledIds = new Set(c.studentIds ?? []);
        populateStudentDropdown(
          'admin',
          cachedAllStudents.map((s) => ({ id: s.id, name: s.name })),
          enrolledIds
        );
      }
    })();
  } else {
    form.reset();
    form.setAttribute('data-course-id', '');
    // Populate student dropdown with no pre-selection
    populateStudentDropdown(
      'admin',
      cachedAllStudents.map((s) => ({ id: s.id, name: s.name }))
    );
  }

  modal.classList.remove('is-hidden');
  window.requestAnimationFrame(() => bindAdminClassModalLayer(modal));
}

function closeClassFormModal(): void {
  if (adminClassModalCleanup) {
    adminClassModalCleanup();
    adminClassModalCleanup = null;
  }
  const modal = document.getElementById('class-form-modal');
  if (modal) {
    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');
  }
}

async function openTeacherClassFormModal(): Promise<void> {
  const modal = getTeacherModal();
  const form = modal.querySelector('#teacher-class-form') as HTMLFormElement;
  const titleEl = modal.querySelector('h3');
  form.reset();
  form.setAttribute('data-course-id', '');

  if (titleEl) titleEl.textContent = 'Create Class';

  // Populate student checkbox dropdown (all students so teacher can assign)
  try {
    const students = await fetchAllStudentProfiles();
    populateStudentDropdown(
      'teacher',
      students.map((s) => ({ id: s.id, name: s.name }))
    );
  } catch {
    // Fallback: empty dropdown
    populateStudentDropdown('teacher', []);
  }

  modal.classList.remove('is-hidden');
  window.requestAnimationFrame(() => bindTeacherClassModalLayer(modal));
}

async function openTeacherClassFormModalForEdit(courseId: string): Promise<void> {
  const modal = getTeacherModal();
  const form = modal.querySelector('#teacher-class-form') as HTMLFormElement;
  const titleEl = modal.querySelector('h3');
  form.reset();
  form.setAttribute('data-course-id', courseId);
  if (titleEl) titleEl.textContent = 'Edit Class';

  const course = await getCourse(courseId);
  if (course) {
    (form.querySelector('[name="courseName"]') as HTMLInputElement).value = course.courseName;
    (form.querySelector('[name="courseCode"]') as HTMLInputElement).value = course.courseCode || '';
    (form.querySelector('[name="schedule"]') as HTMLInputElement).value = course.schedule || '';
    (form.querySelector('[name="description"]') as HTMLTextAreaElement).value =
      course.description || '';
  }

  // Populate dropdown with pre-selected enrolled students
  try {
    const students = await fetchAllStudentProfiles();
    const enrolled = new Set(course?.studentIds ?? []);
    populateStudentDropdown(
      'teacher',
      students.map((s) => ({ id: s.id, name: s.name })),
      enrolled
    );
  } catch {
    populateStudentDropdown('teacher', []);
  }

  modal.classList.remove('is-hidden');
  window.requestAnimationFrame(() => bindTeacherClassModalLayer(modal));
}

function closeTeacherClassFormModal(): void {
  if (teacherClassModalCleanup) {
    teacherClassModalCleanup();
    teacherClassModalCleanup = null;
  }
  const modal = document.getElementById('teacher-class-form-modal');
  if (modal) {
    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');
  }
}

/** Closes Create/Edit class dialogs and releases focus traps (e.g. sign-out). */
export function dismissClassesModals(): void {
  closeClassFormModal();
  closeTeacherClassFormModal();
}

// ─── public API ─────────────────────────────────────────────────────────────

export function initClasses(): void {
  container = document.getElementById('classes-content');
  if (!container) {
    return;
  }
  container.addEventListener('click', handleClick);
  container.addEventListener('change', handleChange);
}

export async function loadClasses(): Promise<void> {
  if (!container) return;
  const user = getCurrentUser();
  if (!user) {
    renderErrorPanel(container, 'Not authenticated');
    return;
  }
  showLoading();
  try {
    if (user.role === 'student') await renderStudentView();
    else if (user.role === 'teacher') await renderTeacherView();
    else if (user.role === 'admin') await renderAdminView();
    else renderTemplate(container, emptyState('No access', 'Your role cannot view classes.'));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    renderErrorPanel(container, msg);
  } finally {
    hideLoading();
  }
}

// ─── Student view ───────────────────────────────────────────────────────────

async function renderStudentView(): Promise<void> {
  const profiles = await fetchStudents();
  const profileIds = profiles.map((s) => s.id);
  const courses = (await fetchStudentClasses(profileIds)).filter((c) =>
    (c.studentIds ?? []).some((id) => profileIds.includes(id))
  );

  const teacherNames: Record<string, string> = {};
  await Promise.all(
    [...new Set(courses.map((c) => c.teacherId).filter(Boolean))].map(async (uid) => {
      teacherNames[uid] = await getUserDisplayName(uid);
    })
  );

  let progressByCourse: Record<string, { done: number; total: number }> = {};
  try {
    const assessRows = await fetchStudentAssessments(profileIds);
    for (const row of assessRows) {
      const cid = row.courseId;
      if (!progressByCourse[cid]) progressByCourse[cid] = { done: 0, total: 0 };
      progressByCourse[cid].total++;
      const sub = row.submission;
      const turnedIn =
        sub &&
        (sub.status === 'submitted' || sub.status === 'late_submitted' || sub.status === 'graded');
      if (turnedIn) progressByCourse[cid].done++;
    }
  } catch {
    progressByCourse = {};
  }

  const cards = courses.map((c) => {
    const t = teacherNames[c.teacherId];
    const teacherLine = t && t !== '—' ? t : 'Teacher';
    const prog = progressByCourse[c.id];
    const pct = prog && prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0;
    const progLabel =
      prog && prog.total > 0
        ? `${prog.done} / ${prog.total} assessments submitted`
        : 'No published assessments yet';
    return `
    <div class="bg-dark-800/60 rounded-2xl border border-dark-700 p-5 hover:border-dark-500 transition-all space-y-3">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h3 class="text-white font-semibold text-base truncate">${esc(safeCourseDisplayName(c.courseName))}</h3>
          <p class="text-dark-400 text-sm mt-0.5">${esc(teacherLine)}</p>
        </div>
        ${prog && prog.total > 0 ? `<span class="shrink-0 text-xs font-bold text-primary-400 tabular-nums">${pct}%</span>` : ''}
      </div>
      ${c.schedule ? `<p class="text-dark-300 text-sm flex items-center gap-1.5"><svg class="w-3.5 h-3.5 opacity-50 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>${esc(c.schedule)}</p>` : ''}
      ${c.description ? `<p class="text-dark-300 text-sm line-clamp-2">${esc(c.description)}</p>` : ''}
      <div role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${prog && prog.total > 0 ? pct : 0}" aria-label="Assessment completion for this class">
        <div class="h-1.5 w-full rounded-full bg-dark-700/90 overflow-hidden">
          <div class="assessment-progress-fill h-full rounded-full bg-gradient-to-r from-primary-600 to-cyan-400 transition-[width] duration-500 ease-out" style="width: ${prog && prog.total > 0 ? pct : 0}%"></div>
        </div>
        <p class="text-dark-500 text-xs mt-1.5">${esc(progLabel)}</p>
      </div>
      <div class="flex gap-2 pt-1">
        <a href="#" data-tab="assessments" class="classes-quick-link min-h-[36px] inline-flex items-center px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-primary-500/15 text-primary-400 hover:bg-primary-500/25 active:scale-[0.97] transition-all touch-manipulation">Assessments</a>
        <a href="#" data-tab="grades" class="classes-quick-link min-h-[36px] inline-flex items-center px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-dark-600 text-dark-300 hover:bg-dark-500 active:scale-[0.97] transition-all touch-manipulation">Grades</a>
      </div>
    </div>`;
  });

  const emptyHtml = emptyState(
    'Welcome to DSKM LMS!',
    "You haven't been assigned to a class yet. Contact your teacher, or open Assessments to see your work.",
    `<a href="#" data-tab="assessments" class="classes-quick-link inline-flex px-4 py-2 rounded-lg text-sm font-semibold bg-primary-500/20 text-primary-400 hover:bg-primary-500/30">View assessments</a>`
  );

  renderTemplate(
    container!,
    `
    <div class="space-y-6">
      ${sectionHeader('My Classes')}
      ${courses.length === 0 ? emptyHtml : `<div class="grid grid-cols-1 gap-4">${cards.join('')}</div>`}
    </div>`
  );
}

// ─── Teacher view ───────────────────────────────────────────────────────────

async function renderTeacherView(): Promise<void> {
  const [courses, students] = await Promise.all([fetchTeacherClasses(), fetchAllStudentProfiles()]);
  cachedTeacherCourses = courses;
  cachedAllStudents = students;

  const studentCount = (c: Course) => c.studentIds?.length ?? 0;

  const mobileCards = courses.map(
    (c) => `
    <div class="rounded-2xl border border-dark-700 bg-dark-800/60 p-4 space-y-3">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <h3 class="text-white font-semibold text-base truncate">${esc(safeCourseDisplayName(c.courseName))}</h3>
          ${c.courseCode ? `<p class="text-dark-400 text-xs mt-0.5">${esc(c.courseCode)}</p>` : ''}
        </div>
        <span class="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-dark-300 bg-dark-700 rounded-lg px-2 py-1">
          <svg class="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
          ${studentCount(c)}
        </span>
      </div>
      <p class="text-dark-400 text-sm"><span class="text-on-surface-muted" data-teacher-cell="${esc(c.id)}" aria-hidden="true">—</span></p>
      <div class="flex flex-wrap gap-2 pt-1">
        <button data-action="teacher-edit-class" data-course-id="${esc(c.id)}" class="min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-primary-500/15 text-primary-400 hover:bg-primary-500/25 active:scale-[0.97] transition-all touch-manipulation">Edit</button>
        <button data-action="teacher-toggle-roster" data-course-id="${esc(c.id)}" class="min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-dark-600 text-dark-300 hover:bg-dark-500 active:scale-[0.97] transition-all touch-manipulation">Roster</button>
        <button data-action="teacher-delete-class" data-course-id="${esc(c.id)}" class="min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 active:scale-[0.97] transition-all touch-manipulation ml-auto">Delete</button>
      </div>
      <div data-roster-panel="teacher-${c.id}" class="hidden border-t border-dark-700 pt-3 mt-1">
        <div data-roster-content="teacher-${c.id}" class="text-on-surface-muted text-sm"><span aria-hidden="true">—</span></div>
      </div>
    </div>`
  );

  const tableRows = courses.map(
    (c) => `
    <tr class="border-b border-dark-700 hover:bg-white/5 transition-colors">
      <td class="py-3 px-4 text-white font-medium">${esc(safeCourseDisplayName(c.courseName))}</td>
      <td class="py-3 px-4 text-dark-300 text-sm">${esc(c.courseCode || '—')}</td>
      <td class="py-3 px-4 text-dark-300 text-sm"><span class="text-on-surface-muted tabular-nums" data-teacher-cell="${esc(c.id)}" aria-hidden="true">—</span></td>
      <td class="py-3 px-4 text-dark-300 text-sm">${studentCount(c)}</td>
      <td class="py-3 px-4 flex gap-1">
        <button data-action="teacher-edit-class" data-course-id="${esc(c.id)}" class="px-2 py-1 rounded text-xs bg-primary-500/20 text-primary-400 hover:bg-primary-500/30">Edit</button>
        <button data-action="teacher-delete-class" data-course-id="${esc(c.id)}" class="px-2 py-1 rounded text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30">Delete</button>
        <button data-action="teacher-toggle-roster" data-course-id="${esc(c.id)}" class="px-2 py-1 rounded text-xs bg-dark-600 text-dark-300 hover:bg-dark-500">Roster</button>
      </td>
    </tr>
    <tr data-roster-panel="teacher-${c.id}" class="hidden border-b border-dark-700 bg-dark-900/30">
      <td colspan="5" class="py-4 px-4">
        <div data-roster-content="teacher-${c.id}" class="text-on-surface-muted text-sm"><span aria-hidden="true">—</span></div>
      </td>
    </tr>`
  );

  const createBtn = `<button type="button" data-action="teacher-create-class" class="min-h-[44px] px-4 py-2 rounded-xl bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 active:scale-[0.97] transition-all touch-manipulation">+ Create Class</button>`;

  const emptyHtml = emptyState(
    'Welcome to your teaching hub',
    'This is your first day on DSKM LMS — create your first class here, or ask an administrator to assign courses to you.',
    `<button type="button" data-action="teacher-create-class" class="px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600">+ Create class</button>`
  );

  const listContent =
    courses.length === 0
      ? emptyHtml
      : `
      <!-- Mobile: card stack -->
      <div class="md:hidden space-y-3">${mobileCards.join('')}</div>
      <!-- Desktop: data table -->
      <div class="hidden md:block overflow-x-auto rounded-xl border border-dark-700">
        <table class="w-full text-sm">
          <thead class="bg-dark-800/80">
            <tr class="text-dark-300 text-xs uppercase tracking-wider">
              <th class="py-3 px-4 text-left">Name</th>
              <th class="py-3 px-4 text-left">Code</th>
              <th class="py-3 px-4 text-left">Teacher</th>
              <th class="py-3 px-4 text-left">Students</th>
              <th class="py-3 px-4 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>${tableRows.join('')}</tbody>
        </table>
      </div>`;

  renderTemplate(
    container!,
    `<div class="space-y-6">
      ${sectionHeader('My Classes', createBtn)}
      ${listContent}
    </div>`
  );

  const teacherIds = [...new Set(courses.map((c) => c.teacherId).filter(Boolean))];
  const teacherNames: Record<string, string> = {};
  await Promise.all(
    teacherIds.map(async (uid) => {
      teacherNames[uid] = await getUserDisplayName(uid);
    })
  );
  if (container) {
    for (const c of courses) {
      container.querySelectorAll(`[data-teacher-cell="${c.id}"]`).forEach((cell) => {
        cell.textContent = teacherNames[c.teacherId] ?? '—';
        cell.classList.remove('text-on-surface-muted', 'tabular-nums');
        cell.removeAttribute('aria-hidden');
      });
    }
  }
}

// ─── Admin view ─────────────────────────────────────────────────────────────

async function renderAdminView(): Promise<void> {
  const [courses, teachers, students] = await Promise.all([
    fetchAllClasses(),
    fetchAllUsers().then((u) => u.filter((x) => x.role === 'teacher')),
    fetchStudents(),
  ]);
  cachedTeachers = teachers;
  cachedAllStudents = students;

  const teacherNames: Record<string, string> = {};
  teachers.forEach((t) => {
    const label = userProfileDisplayLabel(t);
    if (label !== '—') teacherNames[t.uid] = label;
  });
  const orphanTeacherIds = [...new Set(courses.map((c) => c.teacherId).filter(Boolean))].filter(
    (tid) => !teacherNames[tid]
  );
  await Promise.all(
    orphanTeacherIds.map(async (tid) => {
      teacherNames[tid] = await getUserDisplayName(tid);
    })
  );

  const studentCount = (c: Course) => c.studentIds?.length ?? 0;

  const mobileCards = courses.map(
    (c) => `
    <div class="rounded-2xl border border-dark-700 bg-dark-800/60 p-4 space-y-3">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <h3 class="text-white font-semibold text-base truncate">${esc(safeCourseDisplayName(c.courseName))}</h3>
          ${c.courseCode ? `<p class="text-dark-400 text-xs mt-0.5">${esc(c.courseCode)}</p>` : ''}
        </div>
        <span class="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-dark-300 bg-dark-700 rounded-lg px-2 py-1">
          <svg class="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
          ${studentCount(c)}
        </span>
      </div>
      <p class="text-dark-300 text-sm">${esc(teacherNames[c.teacherId] ?? '—')}</p>
      <div class="flex flex-wrap gap-2 pt-1">
        <button data-action="admin-edit-class" data-course-id="${esc(c.id)}" class="min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-primary-500/15 text-primary-400 hover:bg-primary-500/25 active:scale-[0.97] transition-all touch-manipulation">Edit</button>
        <button data-action="admin-toggle-roster" data-course-id="${esc(c.id)}" class="min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-dark-600 text-dark-300 hover:bg-dark-500 active:scale-[0.97] transition-all touch-manipulation">Roster</button>
        <button data-action="admin-delete-class" data-course-id="${esc(c.id)}" class="min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 active:scale-[0.97] transition-all touch-manipulation ml-auto">Delete</button>
      </div>
      <div data-roster-panel="admin-${c.id}" class="hidden border-t border-dark-700 pt-3 mt-1">
        <div data-roster-content="admin-${c.id}" class="text-on-surface-muted text-sm"><span aria-hidden="true">—</span></div>
      </div>
    </div>`
  );

  const tableRows = courses.map(
    (c) => `
    <tr class="border-b border-dark-700 hover:bg-white/5 transition-colors">
      <td class="py-3 px-4 text-white font-medium">${esc(safeCourseDisplayName(c.courseName))}</td>
      <td class="py-3 px-4 text-dark-300 text-sm">${esc(c.courseCode || '—')}</td>
      <td class="py-3 px-4 text-dark-300 text-sm">${esc(teacherNames[c.teacherId] ?? '—')}</td>
      <td class="py-3 px-4 text-dark-300 text-sm">${studentCount(c)}</td>
      <td class="py-3 px-4 flex gap-1">
        <button data-action="admin-edit-class" data-course-id="${esc(c.id)}" class="px-2 py-1 rounded text-xs bg-primary-500/20 text-primary-400 hover:bg-primary-500/30">Edit</button>
        <button data-action="admin-delete-class" data-course-id="${esc(c.id)}" class="px-2 py-1 rounded text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30">Delete</button>
        <button data-action="admin-toggle-roster" data-course-id="${esc(c.id)}" class="px-2 py-1 rounded text-xs bg-dark-600 text-dark-300 hover:bg-dark-500">Roster</button>
      </td>
    </tr>
    <tr data-roster-panel="admin-${c.id}" class="hidden border-b border-dark-700 bg-dark-900/30">
      <td colspan="5" class="py-4 px-4">
        <div data-roster-content="admin-${c.id}" class="text-on-surface-muted text-sm"><span aria-hidden="true">—</span></div>
      </td>
    </tr>`
  );

  const createBtn = `<button type="button" data-action="admin-create-class" class="min-h-[44px] px-4 py-2 rounded-xl bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 active:scale-[0.97] transition-all touch-manipulation">+ Create Class</button>`;

  const emptyHtml = emptyState(
    'No classes found',
    'Create a class to get started.',
    `<button type="button" data-action="admin-create-class" class="px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600">+ Create class</button>`
  );

  const listContent =
    courses.length === 0
      ? emptyHtml
      : `
      <!-- Mobile: card stack -->
      <div class="md:hidden space-y-3">${mobileCards.join('')}</div>
      <!-- Desktop: data table -->
      <div class="hidden md:block overflow-x-auto rounded-xl border border-dark-700">
        <table class="w-full text-sm">
          <thead class="bg-dark-800/80">
            <tr class="text-dark-300 text-xs uppercase tracking-wider">
              <th class="py-3 px-4 text-left">Name</th>
              <th class="py-3 px-4 text-left">Code</th>
              <th class="py-3 px-4 text-left">Teacher</th>
              <th class="py-3 px-4 text-left">Students</th>
              <th class="py-3 px-4 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>${tableRows.join('')}</tbody>
        </table>
      </div>`;

  renderTemplate(
    container!,
    `<div class="space-y-6">
      ${sectionHeader('Classes', createBtn)}
      ${listContent}
    </div>`
  );
}

// ─── Roster helpers ─────────────────────────────────────────────────────────

function buildRosterHtml(
  courseId: string,
  roster: Student[],
  available: Student[],
  actionPrefix: 'teacher' | 'admin'
): string {
  const removeAction = `${actionPrefix}-remove-student`;
  const addAction = `${actionPrefix}-add-student-select`;
  return `
    <div class="space-y-3">
      <p class="text-dark-300 font-medium text-sm">Enrolled (${roster.length})</p>
      ${
        roster.length === 0
          ? '<p class="text-dark-500 text-sm">None</p>'
          : `<ul class="space-y-1.5">${roster.map((s) => `<li class="flex items-center justify-between gap-2"><span class="text-dark-200 text-sm truncate">${esc(safeStudentDisplayName(s.name))}</span><button type="button" data-action="${removeAction}" data-course-id="${esc(courseId)}" data-student-id="${esc(s.id)}" class="shrink-0 min-h-[32px] px-2.5 py-1 rounded-lg text-red-400 text-xs font-medium hover:bg-red-500/10 transition-colors touch-manipulation">Remove</button></li>`).join('')}</ul>`
      }
      <div>
        <p class="text-dark-300 font-medium text-sm mb-1">Add student</p>
        <select data-course-id="${esc(courseId)}" data-action="${addAction}" class="w-full max-w-xs px-3 py-2.5 rounded-xl bg-dark-700 border border-dark-600 text-white text-sm">
          <option value="">— Select student —</option>
          ${available.map((s) => `<option value="${esc(s.id)}">${esc(safeStudentDisplayName(s.name))}</option>`).join('')}
        </select>
      </div>
    </div>`;
}

async function loadTeacherRoster(courseId: string): Promise<void> {
  const targets = document.querySelectorAll<HTMLElement>(`[data-roster-content="teacher-${courseId}"]`);
  if (targets.length === 0) return;
  const course = cachedTeacherCourses.find((c) => c.id === courseId);
  if (!course) return;
  try {
    const roster = await fetchClassRoster(courseId);
    const enrolledIds = new Set(course.studentIds ?? []);
    const available = cachedAllStudents.filter((s) => !enrolledIds.has(s.id));
    const html = buildRosterHtml(courseId, roster, available, 'teacher');
    targets.forEach((el) => renderTemplate(el, html));
  } catch {
    targets.forEach((el) => {
      const p = document.createElement('p');
      p.className = 'text-red-400 text-sm';
      p.textContent = 'Failed to load roster.';
      el.replaceChildren(p);
    });
  }
}

async function loadAdminRoster(courseId: string): Promise<void> {
  const course = (await fetchAllClasses()).find((c) => c.id === courseId);
  if (!course) return;
  const roster = await fetchClassRoster(courseId);
  const enrolledIds = new Set(course.studentIds ?? []);
  const available = cachedAllStudents.filter((s) => !enrolledIds.has(s.id));

  const targets = document.querySelectorAll<HTMLElement>(`[data-roster-content="admin-${courseId}"]`);
  if (targets.length === 0) return;
  const html = buildRosterHtml(courseId, roster, available, 'admin');
  targets.forEach((el) => renderTemplate(el, html));
}

// ─── Event delegation (container only – no modals here) ─────────────────────

function handleClick(e: Event): void {
  const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
  if (!target) {
    const link = (e.target as HTMLElement).closest('.classes-quick-link');
    if (link) {
      e.preventDefault();
      const tab = (link as HTMLElement).getAttribute('data-tab');
      if (
        tab &&
        typeof (window as unknown as { switchToTab?: (t: string) => void }).switchToTab ===
          'function'
      ) {
        (window as unknown as { switchToTab: (t: string) => void }).switchToTab(tab);
      }
    }
    return;
  }
  const action = target.getAttribute('data-action');
  const courseId = target.getAttribute('data-course-id') || '';

  switch (action) {
    case 'teacher-toggle-roster': {
      const rows = document.querySelectorAll(`[data-roster-panel="teacher-${courseId}"]`);
      if (rows.length === 0) return;
      const isHidden = (rows[0] as HTMLElement).classList.contains('hidden');
      rows.forEach((r) => (r as HTMLElement).classList.toggle('hidden', !isHidden));
      if (isHidden) loadTeacherRoster(courseId);
      return;
    }
    case 'teacher-edit-class':
      openTeacherClassFormModalForEdit(courseId);
      return;
    case 'teacher-delete-class':
      if (!confirm('Delete this class? This does not delete students.')) return;
      showLoading();
      deleteClass(courseId)
        .then(() => loadClasses())
        .catch((err: unknown) =>
          showAppToast(formatErrorForUserToast(err, 'Could not delete the class.'), 'error')
        )
        .finally(hideLoading);
      return;
    case 'admin-toggle-roster': {
      const rows = document.querySelectorAll(`[data-roster-panel="admin-${courseId}"]`);
      if (rows.length === 0) return;
      const isHidden = (rows[0] as HTMLElement).classList.contains('hidden');
      rows.forEach((r) => (r as HTMLElement).classList.toggle('hidden', !isHidden));
      if (isHidden) loadAdminRoster(courseId);
      return;
    }
    case 'admin-create-class':
      openClassFormModal();
      return;
    case 'admin-edit-class':
      openClassFormModal(courseId);
      return;
    case 'admin-delete-class':
      if (!confirm('Delete this class? This does not delete students.')) return;
      showLoading();
      deleteClass(courseId)
        .then(() => loadClasses())
        .catch((err: unknown) =>
          showAppToast(formatErrorForUserToast(err, 'Could not delete the class.'), 'error')
        )
        .finally(hideLoading);
      return;
    case 'teacher-create-class':
      openTeacherClassFormModal();
      return;
    case 'teacher-remove-student': {
      const studentId = target.getAttribute('data-student-id');
      if (!studentId) return;
      showLoading();
      removeStudentsFromClass(courseId, [studentId])
        .then(() => loadTeacherRoster(courseId))
        .catch((err: unknown) =>
          showAppToast(
            formatErrorForUserToast(err, 'Could not remove the student from this class.'),
            'error'
          )
        )
        .finally(hideLoading);
      return;
    }
    case 'admin-remove-student': {
      const studentId = target.getAttribute('data-student-id');
      if (!studentId) return;
      showLoading();
      removeStudentsFromClass(courseId, [studentId])
        .then(() => loadAdminRoster(courseId))
        .catch((err: unknown) =>
          showAppToast(
            formatErrorForUserToast(err, 'Could not remove the student from this class.'),
            'error'
          )
        )
        .finally(hideLoading);
      return;
    }
  }
}

function handleChange(e: Event): void {
  const target = e.target as HTMLSelectElement;
  const action = target.getAttribute('data-action');
  if (action === 'admin-add-student-select') {
    const value = target.value;
    if (!value) return;
    const courseId = target.getAttribute('data-course-id') || '';
    showLoading();
    addStudentsToClass(courseId, [value])
      .then(() => {
        target.value = '';
        return loadAdminRoster(courseId);
      })
      .catch((err: unknown) =>
        showAppToast(
          formatErrorForUserToast(err, 'Could not add the student to this class.'),
          'error'
        )
      )
      .finally(hideLoading);
  } else if (action === 'teacher-add-student-select') {
    const value = target.value;
    if (!value) return;
    const courseId = target.getAttribute('data-course-id') || '';
    showLoading();
    addStudentsToClass(courseId, [value])
      .then(() => {
        target.value = '';
        return loadTeacherRoster(courseId);
      })
      .catch((err: unknown) =>
        showAppToast(
          formatErrorForUserToast(err, 'Could not add the student to this class.'),
          'error'
        )
      )
      .finally(hideLoading);
  }
}

// ─── Form submit handlers (bound directly on the portaled modals) ───────────

async function handleAdminFormSubmit(e: Event): Promise<void> {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const formData = new FormData(form);
  const name = (formData.get('courseName') as string)?.trim();
  if (!name) return;

  const courseId = form.getAttribute('data-course-id') || '';
  const teacherId = (formData.get('teacherId') as string)?.trim() || '';

  // Collect selected student IDs from the custom checkbox dropdown
  const selectedStudentIds = getSelectedStudentIds('admin');

  showLoading();
  try {
    if (courseId) {
      await updateClass(courseId, {
        courseName: name,
        courseCode: (formData.get('courseCode') as string)?.trim() || '',
        schedule: (formData.get('schedule') as string)?.trim() || '',
        description: (formData.get('description') as string)?.trim() || '',
        studentIds: selectedStudentIds,
      });
      if (teacherId) await assignTeacherToClass(courseId, teacherId);
    } else {
      const payload = {
        courseName: name,
        courseCode: (formData.get('courseCode') as string)?.trim() || '',
        schedule: (formData.get('schedule') as string)?.trim() || '',
        description: (formData.get('description') as string)?.trim() || '',
        teacherId,
        studentIds: selectedStudentIds,
        createdAt: new Date().toISOString(),
      };
      const id = await createClass(payload);
      if (teacherId) await assignTeacherToClass(id, teacherId);
    }
    closeClassFormModal();
    await loadClasses();
  } catch (err: unknown) {
    showAppToast(formatErrorForUserToast(err, 'Could not save the class.'), 'error');
  } finally {
    hideLoading();
  }
}

async function handleTeacherFormSubmit(e: Event): Promise<void> {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const formData = new FormData(form);
  const name = (formData.get('courseName') as string)?.trim();
  if (!name) return;
  const user = getCurrentUser();
  if (!user) return;

  // Collect selected student IDs from the custom checkbox dropdown
  const selectedStudentIds = getSelectedStudentIds('teacher');
  const courseId = form.getAttribute('data-course-id') || '';

  showLoading();
  try {
    if (courseId) {
      await updateClass(courseId, {
        courseName: name,
        courseCode: (formData.get('courseCode') as string)?.trim() || '',
        schedule: (formData.get('schedule') as string)?.trim() || '',
        description: (formData.get('description') as string)?.trim() || '',
        studentIds: selectedStudentIds,
      });
    } else {
      await createClass({
        courseName: name,
        courseCode: (formData.get('courseCode') as string)?.trim() || '',
        schedule: (formData.get('schedule') as string)?.trim() || '',
        description: (formData.get('description') as string)?.trim() || '',
        teacherId: user.uid,
        studentIds: selectedStudentIds,
        createdAt: new Date().toISOString(),
      });
    }
    closeTeacherClassFormModal();
    await loadClasses();
  } catch (err: unknown) {
    showAppToast(formatErrorForUserToast(err, 'Could not save the class.'), 'error');
  } finally {
    hideLoading();
  }
}
