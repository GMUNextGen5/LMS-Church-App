/**
 * Classes tab UI – role-adaptive views (student, teacher, admin).
 * Renders into #classes-content; uses classes-data for all Firestore operations.
 *
 * Modals are portaled to <body> so they always sit above the sticky header
 * and sidebar. Body scroll is locked while a modal is open.
 */

import { getCurrentUser } from '../core/auth';
import { fetchStudents, fetchAllUsers, fetchAllStudentProfiles } from '../data/data';
import { showLoading, hideLoading } from './ui';
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
} from '../data/classes-data';
import type { Course, Student, User } from '../core/types';

let container: HTMLElement | null = null;

// Admin: cached for teacher dropdown and "available students" in roster
let cachedTeachers: User[] = [];
let cachedAllStudents: Student[] = [];
// Teacher: cached courses so roster panel can compute enrolled/available
let cachedTeacherCourses: Course[] = [];

// ─── helpers ────────────────────────────────────────────────────────────────

function esc(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function sectionHeader(title: string, rightHtml?: string): string {
  return `
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-bold text-white">${title}</h2>
      <div class="flex items-center gap-2">${rightHtml || ''}</div>
    </div>`;
}

function emptyState(title: string, subtitle?: string): string {
  return `
    <div class="text-center py-16">
      <div class="text-4xl mb-3 opacity-30">📚</div>
      <h3 class="text-white font-semibold text-lg">${title}</h3>
      ${subtitle ? `<p class="text-dark-400 text-sm mt-1">${subtitle}</p>` : ''}
    </div>`;
}

function errorHtml(msg: string): string {
  return `
    <div class="text-center py-16">
      <div class="text-4xl mb-3 opacity-30">⚠️</div>
      <h3 class="text-red-400 font-semibold">${esc(msg)}</h3>
    </div>`;
}

// ─── Custom student checkbox-dropdown helpers ────────────────────────────────

/**
 * Populate a .student-dropdown with checkboxes for the given students.
 * `owner` is "admin" or "teacher" so we can find the right dropdown.
 */
function populateStudentDropdown(owner: 'admin' | 'teacher', students: { id: string; name: string }[], preselected?: Set<string>): void {
  const modal = owner === 'admin'
    ? document.getElementById('class-form-modal')
    : document.getElementById('teacher-class-form-modal');
  if (!modal) return;
  const dd = modal.querySelector(`.student-dropdown[data-owner="${owner}"]`) as HTMLElement | null;
  if (!dd) return;

  const menu = dd.querySelector('.student-dropdown-menu') as HTMLElement;
  menu.innerHTML = students.length === 0
    ? '<p class="px-3 py-2 text-dark-500 text-sm">No students available</p>'
    : students.map(s => {
        const checked = preselected?.has(s.id) ? 'checked' : '';
        return `<label class="student-dropdown-item flex items-center gap-2 px-3 py-1.5 hover:bg-dark-600/60 cursor-pointer text-sm text-white">
          <input type="checkbox" value="${s.id}" ${checked} class="accent-primary-500" /> ${esc(s.name)}
        </label>`;
      }).join('');

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
    label.textContent = count === 0 ? '— Select students —' : `${count} student${count !== 1 ? 's' : ''} selected`;
  }
}

// Close student dropdown when clicking outside
document.addEventListener('click', (e) => {
  document.querySelectorAll('.student-dropdown').forEach(dd => {
    if (!dd.contains(e.target as Node)) {
      dd.querySelector('.student-dropdown-menu')?.classList.add('hidden');
    }
  });
});

/** Get the IDs of all checked students from the custom dropdown. */
function getSelectedStudentIds(owner: 'admin' | 'teacher'): string[] {
  const modal = owner === 'admin'
    ? document.getElementById('class-form-modal')
    : document.getElementById('teacher-class-form-modal');
  if (!modal) return [];
  const checks = modal.querySelectorAll(`.student-dropdown[data-owner="${owner}"] input[type="checkbox"]:checked`);
  return Array.from(checks).map(cb => (cb as HTMLInputElement).value);
}

// ─── Modal portal system ────────────────────────────────────────────────────
// Modals live in <body> so z-index is never trapped by parent stacking contexts.

let adminModalEl: HTMLElement | null = null;
let teacherModalEl: HTMLElement | null = null;

/** Create (once) or return the admin Create/Edit Class modal overlay. */
function getAdminModal(): HTMLElement {
  if (adminModalEl && document.body.contains(adminModalEl)) return adminModalEl;
  adminModalEl = document.createElement('div');
  adminModalEl.id = 'class-form-modal';
  adminModalEl.className = 'classes-modal-overlay is-hidden';
  adminModalEl.innerHTML = `
    <div class="classes-modal-box">
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
    </div>`;
  document.body.appendChild(adminModalEl);

  // Backdrop click → close
  adminModalEl.addEventListener('click', (ev) => {
    if (ev.target === adminModalEl) closeClassFormModal();
  });
  // Cancel button
  adminModalEl.querySelector('#admin-modal-cancel')!.addEventListener('click', () => closeClassFormModal());
  // Form submit
  adminModalEl.querySelector('#class-form')!.addEventListener('submit', handleAdminFormSubmit as EventListener);
  // Escape key
  adminModalEl.addEventListener('keydown', (ev) => {
    if ((ev as KeyboardEvent).key === 'Escape') closeClassFormModal();
  });

  return adminModalEl;
}

/** Create (once) or return the teacher Create Class modal overlay. */
function getTeacherModal(): HTMLElement {
  if (teacherModalEl && document.body.contains(teacherModalEl)) return teacherModalEl;
  teacherModalEl = document.createElement('div');
  teacherModalEl.id = 'teacher-class-form-modal';
  teacherModalEl.className = 'classes-modal-overlay is-hidden';
  teacherModalEl.innerHTML = `
    <div class="classes-modal-box">
      <h3 class="text-lg font-bold text-white mb-4">Create Class</h3>
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
    </div>`;
  document.body.appendChild(teacherModalEl);

  teacherModalEl.addEventListener('click', (ev) => {
    if (ev.target === teacherModalEl) closeTeacherClassFormModal();
  });
  teacherModalEl.querySelector('#teacher-modal-cancel')!.addEventListener('click', () => closeTeacherClassFormModal());
  teacherModalEl.querySelector('#teacher-class-form')!.addEventListener('submit', handleTeacherFormSubmit as EventListener);
  teacherModalEl.addEventListener('keydown', (ev) => {
    if ((ev as KeyboardEvent).key === 'Escape') closeTeacherClassFormModal();
  });

  return teacherModalEl;
}

function lockScroll(): void { document.body.classList.add('modal-scroll-lock'); }
function unlockScroll(): void { document.body.classList.remove('modal-scroll-lock'); }

function openClassFormModal(editCourseId?: string): void {
  const modal = getAdminModal();
  const form = modal.querySelector('#class-form') as HTMLFormElement;
  const titleEl = modal.querySelector('#class-form-title')!;

  // Refresh teacher dropdown
  const sel = form.querySelector('[name="teacherId"]') as HTMLSelectElement;
  sel.innerHTML = '<option value="">— Select —</option>' +
    cachedTeachers.map(t => `<option value="${t.uid}">${esc((t as User & { name?: string }).name || t.email)}</option>`).join('');

  form.setAttribute('data-course-id', editCourseId || '');
  titleEl.textContent = editCourseId ? 'Edit Class' : 'Create Class';

  if (editCourseId) {
    (async () => {
      const courses = await fetchAllClasses();
      const c = courses.find(x => x.id === editCourseId);
      if (c) {
        (form.querySelector('[name="courseName"]') as HTMLInputElement).value = c.courseName;
        (form.querySelector('[name="courseCode"]') as HTMLInputElement).value = c.courseCode || '';
        (form.querySelector('[name="schedule"]') as HTMLInputElement).value = c.schedule || '';
        (form.querySelector('[name="description"]') as HTMLTextAreaElement).value = c.description || '';
        sel.value = c.teacherId || '';
        // Populate student dropdown with pre-selected enrolled students
        const enrolledIds = new Set(c.studentIds ?? []);
        populateStudentDropdown('admin', cachedAllStudents.map(s => ({ id: s.id, name: s.name })), enrolledIds);
      }
    })();
  } else {
    form.reset();
    form.setAttribute('data-course-id', '');
    // Populate student dropdown with no pre-selection
    populateStudentDropdown('admin', cachedAllStudents.map(s => ({ id: s.id, name: s.name })));
  }

  modal.classList.remove('is-hidden');
  lockScroll();
}

function closeClassFormModal(): void {
  const modal = document.getElementById('class-form-modal');
  if (modal) modal.classList.add('is-hidden');
  unlockScroll();
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
    populateStudentDropdown('teacher', students.map(s => ({ id: s.id, name: s.name })));
  } catch {
    // Fallback: empty dropdown
    populateStudentDropdown('teacher', []);
  }

  modal.classList.remove('is-hidden');
  lockScroll();
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
    (form.querySelector('[name="description"]') as HTMLTextAreaElement).value = course.description || '';
  }

  // Populate dropdown with pre-selected enrolled students
  try {
    const students = await fetchAllStudentProfiles();
    const enrolled = new Set(course?.studentIds ?? []);
    populateStudentDropdown('teacher', students.map(s => ({ id: s.id, name: s.name })), enrolled);
  } catch {
    populateStudentDropdown('teacher', []);
  }

  modal.classList.remove('is-hidden');
  lockScroll();
}

function closeTeacherClassFormModal(): void {
  const modal = document.getElementById('teacher-class-form-modal');
  if (modal) modal.classList.add('is-hidden');
  unlockScroll();
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
    container.innerHTML = errorHtml('Not authenticated');
    return;
  }
  showLoading();
  try {
    if (user.role === 'student') await renderStudentView();
    else if (user.role === 'teacher') await renderTeacherView();
    else if (user.role === 'admin') await renderAdminView();
    else container.innerHTML = emptyState('No access', 'Your role cannot view classes.');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    container.innerHTML = errorHtml(msg);
  } finally {
    hideLoading();
  }
}

// ─── Student view ───────────────────────────────────────────────────────────

async function renderStudentView(): Promise<void> {
  const profiles = await fetchStudents();
  const profileIds = profiles.map(s => s.id);
  const courses = await fetchStudentClasses(profileIds);

  const teacherNames: Record<string, string> = {};
  await Promise.all(
    [...new Set(courses.map(c => c.teacherId))].map(async uid => {
      teacherNames[uid] = await getUserDisplayName(uid);
    })
  );

  const cards = courses.map(c => `
    <div class="bg-dark-800 rounded-xl border border-dark-700 p-5 hover:border-dark-500 transition-all">
      <h3 class="text-white font-semibold text-lg">${esc(c.courseName)}</h3>
      <p class="text-dark-400 text-sm mt-1">${esc(teacherNames[c.teacherId] || 'Teacher')}</p>
      ${c.schedule ? `<p class="text-dark-300 text-sm mt-2">${esc(c.schedule)}</p>` : ''}
      ${c.description ? `<p class="text-dark-300 text-sm mt-2 line-clamp-2">${esc(c.description)}</p>` : ''}
      <div class="mt-4 flex gap-2">
        <a href="#" data-tab="assessments" class="classes-quick-link px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-500/20 text-primary-400 hover:bg-primary-500/30">Assessments</a>
        <a href="#" data-tab="grades" class="classes-quick-link px-3 py-1.5 rounded-lg text-xs font-medium bg-dark-600 text-dark-300 hover:bg-dark-500">Grades</a>
      </div>
    </div>`);

  container!.innerHTML = `
    <div class="space-y-6">
      ${sectionHeader('My Classes')}
      ${courses.length === 0 ? emptyState('No classes', 'You are not enrolled in any classes yet.') : `<div class="grid gap-4">${cards.join('')}</div>`}
    </div>`;
}

// ─── Teacher view ───────────────────────────────────────────────────────────

async function renderTeacherView(): Promise<void> {
  const [courses, students] = await Promise.all([fetchTeacherClasses(), fetchAllStudentProfiles()]);
  cachedTeacherCourses = courses;
  cachedAllStudents = students;
  const teacherNames: Record<string, string> = {};
  await Promise.all(
    [...new Set(courses.map(c => c.teacherId))].map(async uid => {
      teacherNames[uid] = await getUserDisplayName(uid);
    })
  );

  const rows = courses.map(c => `
    <tr class="border-b border-dark-700 hover:bg-dark-800/50">
      <td class="py-3 px-4 text-white font-medium">${esc(c.courseName)}</td>
      <td class="py-3 px-4 text-dark-300 text-sm">${esc(c.courseCode || '—')}</td>
      <td class="py-3 px-4 text-dark-300 text-sm">${esc(teacherNames[c.teacherId] || c.teacherId)}</td>
      <td class="py-3 px-4 text-dark-300 text-sm">${c.studentIds?.length ?? 0}</td>
      <td class="py-3 px-4 flex gap-1">
        <button data-action="teacher-edit-class" data-course-id="${c.id}" class="px-2 py-1 rounded text-xs bg-primary-500/20 text-primary-400 hover:bg-primary-500/30">Edit</button>
        <button data-action="teacher-delete-class" data-course-id="${c.id}" class="px-2 py-1 rounded text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30">Delete</button>
        <button data-action="teacher-toggle-roster" data-course-id="${c.id}" class="px-2 py-1 rounded text-xs bg-dark-600 text-dark-300 hover:bg-dark-500">Roster</button>
      </td>
    </tr>
    <tr id="teacher-roster-row-${c.id}" class="hidden border-b border-dark-700 bg-dark-900/30">
      <td colspan="5" class="py-4 px-4">
        <div id="teacher-roster-${c.id}" class="text-dark-400 text-sm">Loading roster…</div>
      </td>
    </tr>`);

  container!.innerHTML = `
    <div class="space-y-6">
      ${sectionHeader('My Classes', `<button type="button" data-action="teacher-create-class" class="px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600">+ Create Class</button>`)}
      ${courses.length === 0 ? emptyState('No classes yet', 'Create a class or ask an admin to assign you one.') : `
        <div class="overflow-x-auto rounded-xl border border-dark-700">
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
            <tbody>${rows.join('')}</tbody>
          </table>
        </div>
      `}
    </div>`;
}

// ─── Admin view ─────────────────────────────────────────────────────────────

async function renderAdminView(): Promise<void> {
  const [courses, teachers, students] = await Promise.all([
    fetchAllClasses(),
    fetchAllUsers().then(u => u.filter(x => x.role === 'teacher')),
    fetchStudents(),
  ]);
  cachedTeachers = teachers;
  cachedAllStudents = students;

  const teacherNames: Record<string, string> = {};
  teachers.forEach(t => {
    teacherNames[t.uid] = (t as User & { name?: string }).name || t.email || t.uid;
  });

  const rows = courses.map(c => `
    <tr class="border-b border-dark-700 hover:bg-dark-800/50">
      <td class="py-3 px-4 text-white font-medium">${esc(c.courseName)}</td>
      <td class="py-3 px-4 text-dark-300 text-sm">${esc(c.courseCode || '—')}</td>
      <td class="py-3 px-4 text-dark-300 text-sm">${esc(teacherNames[c.teacherId] || c.teacherId)}</td>
      <td class="py-3 px-4 text-dark-300 text-sm">${c.studentIds?.length ?? 0}</td>
      <td class="py-3 px-4 flex gap-1">
        <button data-action="admin-edit-class" data-course-id="${c.id}" class="px-2 py-1 rounded text-xs bg-primary-500/20 text-primary-400 hover:bg-primary-500/30">Edit</button>
        <button data-action="admin-delete-class" data-course-id="${c.id}" class="px-2 py-1 rounded text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30">Delete</button>
        <button data-action="admin-toggle-roster" data-course-id="${c.id}" class="px-2 py-1 rounded text-xs bg-dark-600 text-dark-300 hover:bg-dark-500">Roster</button>
      </td>
    </tr>
    <tr id="admin-roster-row-${c.id}" class="hidden border-b border-dark-700 bg-dark-900/30">
      <td colspan="5" class="py-4 px-4">
        <div id="admin-roster-${c.id}" class="text-dark-400 text-sm">Loading roster…</div>
      </td>
    </tr>`);

  container!.innerHTML = `
    <div class="space-y-6">
      ${sectionHeader('Classes', `<button type="button" data-action="admin-create-class" class="px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600">+ Create Class</button>`)}
      ${courses.length === 0 ? emptyState('No classes', 'Create a class to get started.') : `
        <div class="overflow-x-auto rounded-xl border border-dark-700">
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
            <tbody>${rows.join('')}</tbody>
          </table>
        </div>
      `}
    </div>`;
}

// ─── Roster helpers ─────────────────────────────────────────────────────────

async function loadTeacherRoster(courseId: string): Promise<void> {
  const el = document.getElementById(`teacher-roster-${courseId}`);
  if (!el) return;
  const course = cachedTeacherCourses.find(c => c.id === courseId);
  if (!course) return;
  try {
    const roster = await fetchClassRoster(courseId);
    const enrolledIds = new Set(course.studentIds ?? []);
    const available = cachedAllStudents.filter(s => !enrolledIds.has(s.id));
    el.innerHTML = `
      <div class="space-y-3">
        <p class="text-dark-300 font-medium">Enrolled (${roster.length})</p>
        ${roster.length === 0
          ? '<p class="text-dark-500 text-sm">None</p>'
          : `<ul class="space-y-1">${roster.map(s => `<li class="flex items-center justify-between"><span class="text-dark-200">${esc(s.name)}</span><button type="button" data-action="teacher-remove-student" data-course-id="${courseId}" data-student-id="${s.id}" class="text-red-400 text-xs hover:underline">Remove</button></li>`).join('')}</ul>`}
        <div>
          <p class="text-dark-300 font-medium mb-1">Add student</p>
          <select data-course-id="${courseId}" data-action="teacher-add-student-select" class="w-full max-w-xs px-3 py-2 rounded-lg bg-dark-700 border border-dark-600 text-white text-sm">
            <option value="">— Select student —</option>
            ${available.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
          </select>
        </div>
      </div>`;
  } catch (err) {
    console.error('[Classes] Failed to load roster:', err);
    el.innerHTML = '<p class="text-red-400 text-sm">Failed to load roster.</p>';
  }
}

async function loadAdminRoster(courseId: string): Promise<void> {
  const course = (await fetchAllClasses()).find(c => c.id === courseId);
  if (!course) return;
  const roster = await fetchClassRoster(courseId);
  const enrolledIds = new Set(course.studentIds ?? []);
  const available = cachedAllStudents.filter(s => !enrolledIds.has(s.id));

  const el = document.getElementById(`admin-roster-${courseId}`);
  if (!el) return;
  el.innerHTML = `
    <div class="space-y-3">
      <p class="text-dark-300 font-medium">Enrolled (${roster.length})</p>
      ${roster.length === 0
        ? '<p class="text-dark-500 text-sm">None</p>'
        : `<ul class="space-y-1">${roster.map(s => `<li class="flex items-center justify-between"><span class="text-dark-200">${esc(s.name)}</span><button type="button" data-action="admin-remove-student" data-course-id="${courseId}" data-student-id="${s.id}" class="text-red-400 text-xs hover:underline">Remove</button></li>`).join('')}</ul>`}
      <div>
        <p class="text-dark-300 font-medium mb-1">Add student</p>
        <select data-course-id="${courseId}" data-action="admin-add-student-select" class="w-full max-w-xs px-3 py-2 rounded-lg bg-dark-700 border border-dark-600 text-white text-sm">
          <option value="">— Select student —</option>
          ${available.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
        </select>
      </div>
    </div>`;
}

// ─── Event delegation (container only – no modals here) ─────────────────────

function handleClick(e: Event): void {
  const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
  if (!target) {
    const link = (e.target as HTMLElement).closest('.classes-quick-link');
    if (link) {
      e.preventDefault();
      const tab = (link as HTMLElement).getAttribute('data-tab');
      if (tab && typeof (window as unknown as { switchToTab?: (t: string) => void }).switchToTab === 'function') {
        (window as unknown as { switchToTab: (t: string) => void }).switchToTab(tab);
      }
    }
    return;
  }
  const action = target.getAttribute('data-action');
  const courseId = target.getAttribute('data-course-id') || '';

  switch (action) {
    case 'teacher-toggle-roster': {
      const row = document.getElementById(`teacher-roster-row-${courseId}`);
      if (!row) return;
      if (row.classList.contains('hidden')) { row.classList.remove('hidden'); loadTeacherRoster(courseId); }
      else row.classList.add('hidden');
      return;
    }
    case 'teacher-edit-class':
      openTeacherClassFormModalForEdit(courseId);
      return;
    case 'teacher-delete-class':
      if (!confirm('Delete this class? This does not delete students.')) return;
      showLoading();
      deleteClass(courseId).then(() => loadClasses()).catch(err => alert(err.message)).finally(hideLoading);
      return;
    case 'admin-toggle-roster': {
      const row = document.getElementById(`admin-roster-row-${courseId}`);
      if (!row) return;
      if (row.classList.contains('hidden')) { row.classList.remove('hidden'); loadAdminRoster(courseId); }
      else row.classList.add('hidden');
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
      deleteClass(courseId).then(() => loadClasses()).catch(err => alert(err.message)).finally(hideLoading);
      return;
    case 'teacher-create-class':
      openTeacherClassFormModal();
      return;
    case 'teacher-remove-student': {
      const studentId = target.getAttribute('data-student-id');
      if (!studentId) return;
      showLoading();
      removeStudentsFromClass(courseId, [studentId]).then(() => loadTeacherRoster(courseId)).catch(err => alert(err.message)).finally(hideLoading);
      return;
    }
    case 'admin-remove-student': {
      const studentId = target.getAttribute('data-student-id');
      if (!studentId) return;
      showLoading();
      removeStudentsFromClass(courseId, [studentId]).then(() => loadAdminRoster(courseId)).catch(err => alert(err.message)).finally(hideLoading);
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
      .then(() => { target.value = ''; return loadAdminRoster(courseId); })
      .catch(err => alert(err.message))
      .finally(hideLoading);
  } else if (action === 'teacher-add-student-select') {
    const value = target.value;
    if (!value) return;
    const courseId = target.getAttribute('data-course-id') || '';
    showLoading();
    addStudentsToClass(courseId, [value])
      .then(() => { target.value = ''; return loadTeacherRoster(courseId); })
      .catch(err => alert(err.message))
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
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err));
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
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err));
  } finally {
    hideLoading();
  }
}
