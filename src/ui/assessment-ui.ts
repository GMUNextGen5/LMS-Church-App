/**
 * Assessment UI. Renders into #assessments-content. Views: list, builder, take, submissions, grade, results. Event delegation on container.
 */
import { getCurrentUser } from '../core/auth';
import { fetchStudents, fetchCourses } from '../data/data';
import { showLoading, hideLoading, showAppToast, formatErrorForUserToast } from './ui';
import {
  escapeHtmlText as esc,
  renderTemplate,
  renderErrorPanel,
  appendParsedHtml,
} from './dom-render';
import { safeCourseDisplayName, safeStudentDisplayName } from '../core/display-fallbacks';
import {
  fetchTeacherAssessments,
  fetchStudentAssessments,
  isStudentAssessmentUpcoming,
  fetchAssessment,
  createAssessment,
  updateAssessment,
  deleteAssessment,
  addQuestion,
  deleteQuestion,
  fetchQuestions,
  startSubmission,
  saveProgress,
  submitAssessment as submitAssessmentData,
  fetchSubmission,
  fetchSubmissions,
  fetchStudentsInCourse,
  gradeQuestion,
  finalizeGrading,
  releaseGrades,
  reopenSubmission,
  type StudentAssessmentRow,
} from '../data/assessment-data';
import type {
  Assessment,
  AssessmentQuestion,
  Submission,
  QuestionAnswer,
  QuestionType,
  Course,
  Student,
  UserRole,
} from '../types';

type ViewState =
  | { view: 'list' }
  | { view: 'builder'; classId?: string; assessmentId?: string }
  | { view: 'take'; classId: string; assessmentId: string; studentProfileId: string }
  | { view: 'submissions'; classId: string; assessmentId: string }
  | { view: 'grade'; classId: string; assessmentId: string; studentProfileId: string }
  | { view: 'results'; classId: string; assessmentId: string; studentProfileId: string };

let viewState: ViewState = { view: 'list' };
let container: HTMLElement | null = null;

// Cached data for current view
let cachedCourses: Course[] = [];
let cachedStudentProfiles: Student[] = [];

function submissionStudentDisplayName(sub: {
  studentName?: string;
  studentProfileId: string;
}): string {
  const n = sub.studentName?.trim();
  if (n) return safeStudentDisplayName(n);
  const fromCache = cachedStudentProfiles.find((s) => s.id === sub.studentProfileId)?.name;
  return safeStudentDisplayName(fromCache);
}
// Builder questions are collected from DOM at save time via collectQuestionsFromDOM()

type TeacherAssessmentRow = Assessment & { courseName: string };
type CacheEntry<T> = { ts: number; data: T };
const CACHE_TTL_MS = 60_000;
let teacherAssessmentsCache: CacheEntry<TeacherAssessmentRow[]> | null = null;
let teacherAssessmentsInFlight: Promise<TeacherAssessmentRow[]> | null = null;
let studentAssessmentsCache: CacheEntry<StudentAssessmentRow[]> | null = null;
let studentAssessmentsInFlight: Promise<StudentAssessmentRow[]> | null = null;

let assessmentsTabLoadPromise: Promise<void> | null = null;
let teacherListLimit = 30;
let studentListLimit = 20;
let studentListMode: 'upcoming' | 'all' = 'upcoming';

/** Value for `datetime-local` in the user's local timezone (avoids UTC `.toISOString().slice` skew). */
function toDatetimeLocalValue(isoStr: string): string {
  const d = new Date(isoStr);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function syncBuilderAssignedIdsFromCheckboxes(): void {
  const hidden = document.getElementById('builder-assigned-ids-hidden') as HTMLInputElement | null;
  if (!hidden) return;
  const ids = Array.from(
    document.querySelectorAll('#builder-student-assign-list input[data-assignee-cb]:checked')
  ).map((el) => (el as HTMLInputElement).value);
  hidden.value = ids.join(', ');
}

/**
 * Loads the class roster into the builder assignee list (checkboxes). `selectedIds` are profile document IDs.
 */
async function refreshBuilderStudentRoster(courseId: string, selectedIds: string[]): Promise<void> {
  const listEl = document.getElementById('builder-student-assign-list');
  if (!listEl) return;

  const selected = new Set(selectedIds.filter(Boolean));
  if (!courseId.trim()) {
    listEl.innerHTML =
      '<p class="text-sm text-dark-400 px-1 py-2">Select a class to load the roster.</p>';
    syncBuilderAssignedIdsFromCheckboxes();
    return;
  }

  listEl.innerHTML = '<p class="text-sm text-dark-400 px-1 py-2">Loading roster…</p>';
  try {
    const students = await fetchStudentsInCourse(courseId);
    if (students.length === 0) {
      listEl.innerHTML =
        '<p class="text-sm text-dark-400 px-1 py-2">No students enrolled in this class.</p>';
      syncBuilderAssignedIdsFromCheckboxes();
      return;
    }
    students.sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );
    listEl.innerHTML = students
      .map((s) => {
        const name = safeStudentDisplayName(s.name);
        const mid = (s.memberId || '').trim();
        const em = (s.contactEmail || '').trim();
        const sub = [mid && `ID ${mid}`, em].filter(Boolean).join(' · ');
        const hay = `${name} ${mid} ${em}`.toLowerCase();
        const checked = selected.has(s.id);
        return `
        <label data-assignee-row class="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer" data-filter-text="${esc(hay)}">
          <input type="checkbox" value="${esc(s.id)}" data-assignee-cb class="accent-primary-500 mt-0.5 shrink-0" ${checked ? 'checked' : ''} />
          <span class="min-w-0 text-sm text-slate-100 leading-snug">
            <span class="font-medium">${esc(name)}</span>
            ${sub ? `<span class="block text-xs text-slate-400 mt-0.5">${esc(sub)}</span>` : ''}
          </span>
        </label>`;
      })
      .join('');
    syncBuilderAssignedIdsFromCheckboxes();
    filterBuilderAssigneeRows(
      (document.getElementById('builder-student-assign-search') as HTMLInputElement | null)
        ?.value ?? ''
    );
  } catch (err: unknown) {
    listEl.innerHTML =
      '<p class="text-sm text-red-400 px-1 py-2">Could not load roster. Check your connection and permissions.</p>';
    showAppToast(formatErrorForUserToast(err, 'Could not load class roster.'), 'error');
    syncBuilderAssignedIdsFromCheckboxes();
  }
}

function filterBuilderAssigneeRows(raw: string): void {
  const q = raw.toLowerCase().trim();
  document.querySelectorAll('#builder-student-assign-list [data-assignee-row]').forEach((row) => {
    const hay = (row as HTMLElement).dataset.filterText || '';
    (row as HTMLElement).classList.toggle('hide', q.length > 0 && !hay.includes(q));
  });
}

// ────────────────────────────────────────────────────────────────────────────
//  PUBLIC API
// ────────────────────────────────────────────────────────────────────────────

/** Called once at app boot. */
export function initAssessments(): void {
  container = document.getElementById('assessments-content');
  if (!container) {
    return;
  }
  // Delegate all clicks inside the container
  container.addEventListener('click', handleClick);
  container.addEventListener('change', handleChange);
  container.addEventListener('input', handleInput);
  container.addEventListener('submit', handleSubmit as unknown as EventListener);
}

/** Called when user switches to the Assessments tab. */
export async function loadAssessments(): Promise<void> {
  if (assessmentsTabLoadPromise) return assessmentsTabLoadPromise;
  assessmentsTabLoadPromise = (async () => {
    viewState = { view: 'list' };
    teacherListLimit = 30;
    studentListLimit = 20;
    studentListMode = 'upcoming';
    await renderCurrentView();
  })().finally(() => {
    assessmentsTabLoadPromise = null;
  });
  return assessmentsTabLoadPromise;
}

// ────────────────────────────────────────────────────────────────────────────
//  ROUTER – renders the active view
// ────────────────────────────────────────────────────────────────────────────

async function renderCurrentView(): Promise<void> {
  if (!container) return;
  showLoading();
  try {
    switch (viewState.view) {
      case 'list':
        await renderList();
        break;
      case 'builder':
        await renderBuilder();
        break;
      case 'take':
        await renderTake();
        break;
      case 'submissions':
        await renderSubmissionsList();
        break;
      case 'grade':
        await renderGradeView();
        break;
      case 'results':
        await renderResultsView();
        break;
    }
  } catch (err: unknown) {
    renderErrorPanel(container, 'This assessments view could not be loaded.', {
      showBackToList: true,
    });
    showAppToast(formatErrorForUserToast(err, 'Could not load assessments.'), 'error');
  } finally {
    hideLoading();
  }
}

function navigate(next: ViewState) {
  viewState = next;
  renderCurrentView();
}

// ────────────────────────────────────────────────────────────────────────────
//  VIEW: ASSESSMENT LIST
// ────────────────────────────────────────────────────────────────────────────

async function renderList(): Promise<void> {
  if (!container) return;
  const user = getCurrentUser();
  if (!user) {
    renderErrorPanel(container, 'Not authenticated', { showBackToList: true });
    return;
  }

  if (user.role === 'student') {
    await renderStudentList(user.uid);
  } else {
    await renderTeacherList(user.role);
  }
}

async function renderTeacherList(_role: UserRole): Promise<void> {
  renderTemplate(container!, teacherListSkeletonHtml());

  const allAssessments = await fetchTeacherAssessmentsCached();
  const hasMore = allAssessments.length > teacherListLimit;
  const assessments = allAssessments.slice(0, teacherListLimit);

  const rows = assessments
    .map((a) => {
      const isPast = new Date(a.dueDateTime) < new Date();
      const statusBadge =
        a.status === 'published'
          ? '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-500/20 text-green-400">Published</span>'
          : '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-500/20 text-yellow-400">Draft</span>';
      const dueBadge = isPast
        ? `<span class="text-red-400 text-xs">Past due</span>`
        : `<span class="text-on-surface-muted dark:text-dark-300 text-xs">${formatDate(a.dueDateTime)}</span>`;

      return `
      <tr class="border-b border-slate-200/90 dark:border-dark-700 hover:bg-slate-50/90 dark:hover:bg-white/5 transition-colors"
          style="content-visibility:auto; contain: content; contain-intrinsic-size: 56px;">
        <td class="py-3 px-4 text-on-surface font-medium">${esc(a.title)}</td>
        <td class="py-3 px-4 text-on-surface-muted text-sm">${esc(safeCourseDisplayName(a.courseName))}</td>
        <td class="py-3 px-4 text-center">${statusBadge}</td>
        <td class="py-3 px-4 text-center">${dueBadge}</td>
        <td class="py-3 px-4 text-center text-on-surface-muted tabular-nums">${a.questionCount}</td>
        <td class="py-3 px-4 text-center text-on-surface-muted tabular-nums">${a.totalPoints}</td>
        <td class="py-3 px-4 text-center">
          <div class="inline-flex items-center gap-1 flex-nowrap overflow-x-auto max-w-full align-middle" style="scrollbar-width: none;">
          <button data-action="edit-assessment" data-class-id="${esc(a.classId)}" data-id="${esc(a.id)}"
                  class="inline-flex items-center justify-center min-h-11 px-3 rounded-lg text-xs font-semibold bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 whitespace-nowrap transition-all duration-200">Edit</button>
          <button data-action="view-submissions" data-class-id="${esc(a.classId)}" data-id="${esc(a.id)}"
                  class="inline-flex items-center justify-center min-h-11 px-3 rounded-lg text-xs font-semibold bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 whitespace-nowrap transition-all duration-200">Submissions</button>
          <button data-action="delete-assessment" data-class-id="${esc(a.classId)}" data-id="${esc(a.id)}"
                  class="inline-flex items-center justify-center min-h-11 px-3 rounded-lg text-xs font-semibold bg-red-500/20 text-red-400 hover:bg-red-500/30 whitespace-nowrap transition-all duration-200">Delete</button>
          </div>
        </td>
      </tr>`;
    })
    .join('');

  const cards = assessments
    .map((a) => {
      const isPast = new Date(a.dueDateTime) < new Date();
      const statusBadge =
        a.status === 'published'
          ? '<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-green-500/20 text-green-400 whitespace-nowrap">Published</span>'
          : '<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-500/20 text-yellow-400 whitespace-nowrap">Draft</span>';
      const dueBadge = isPast
        ? `<span class="text-red-400 text-xs whitespace-nowrap">Past due</span>`
        : `<span class="text-on-surface-muted dark:text-dark-300 text-xs whitespace-nowrap">${formatDate(a.dueDateTime)}</span>`;
      return `
      <div class="rounded-xl border border-surface-default bg-surface-container dark:bg-dark-800 dark:border-dark-700 p-5 hover:border-primary-500/25 dark:hover:border-dark-500 transition-all shadow-sm dark:shadow-none"
           style="content-visibility:auto; contain: content; contain-intrinsic-size: 180px;">
        <div class="flex items-start justify-between gap-3 mb-2">
          <div class="min-w-0">
            <h3 class="text-on-surface font-semibold text-base truncate">${esc(a.title)}</h3>
            <p class="text-on-surface-muted text-sm mt-0.5 truncate">${esc(safeCourseDisplayName(a.courseName))}</p>
          </div>
          ${statusBadge}
        </div>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-on-surface-muted mb-4">
          <span>${dueBadge}</span>
          <span>${a.questionCount} questions</span>
          <span>${a.totalPoints} pts</span>
        </div>
        <div class="flex items-center gap-2 overflow-x-auto pb-1" style="scrollbar-width: none;">
          <button data-action="edit-assessment" data-class-id="${esc(a.classId)}" data-id="${esc(a.id)}"
                  class="inline-flex items-center justify-center min-h-11 px-3 rounded-lg text-xs font-semibold bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 whitespace-nowrap transition-all duration-200">Edit</button>
          <button data-action="view-submissions" data-class-id="${esc(a.classId)}" data-id="${esc(a.id)}"
                  class="inline-flex items-center justify-center min-h-11 px-3 rounded-lg text-xs font-semibold bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 whitespace-nowrap transition-all duration-200">Submissions</button>
          <button data-action="delete-assessment" data-class-id="${esc(a.classId)}" data-id="${esc(a.id)}"
                  class="inline-flex items-center justify-center min-h-11 px-3 rounded-lg text-xs font-semibold bg-red-500/20 text-red-400 hover:bg-red-500/30 whitespace-nowrap transition-all duration-200">Delete</button>
        </div>
      </div>`;
    })
    .join('');

  renderTemplate(
    container!,
    `
    <div class="space-y-6">
      ${sectionHeader(
        'Assessments',
        `
          <button data-action="create-assessment"
                class="inline-flex items-center justify-center min-h-11 px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-all duration-200">
          + Create Assessment
        </button>
      `
      )}
      ${
        assessments.length === 0
          ? emptyState(
              'No assessments yet',
              'Create your first assessment to get started.',
              `<button data-action="create-assessment" type="button" class="inline-flex items-center justify-center min-h-11 px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-all duration-200">+ Create assessment</button>`
            )
          : `<div class="md:hidden grid gap-4">${cards}</div>
          <div class="hidden md:block overflow-x-auto rounded-xl border border-slate-200/90 dark:border-dark-700">
            <table class="w-full text-sm">
              <thead class="bg-surface-glass border-b border-surface-default dark:bg-dark-800/80 dark:border-dark-700">
                <tr class="text-on-surface-muted text-xs uppercase tracking-wider">
                  <th class="py-3 px-4 text-left">Title</th>
                  <th class="py-3 px-4 text-left">Class</th>
                  <th class="py-3 px-4 text-center">Status</th>
                  <th class="py-3 px-4 text-center">Due</th>
                  <th class="py-3 px-4 text-center">Questions</th>
                  <th class="py-3 px-4 text-center">Points</th>
                  <th class="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody class="bg-surface-container dark:bg-slate-900/80">${rows}</tbody>
            </table>
          </div>`
      }
      ${
        hasMore
          ? `
        <div class="flex justify-center pt-2">
          <button data-action="load-more-teacher"
                  class="px-4 py-2 rounded-lg bg-dark-700 text-dark-200 text-sm font-semibold hover:bg-dark-600 transition-colors">
            Load more
          </button>
        </div>
      `
          : ''
      }
    </div>`
  );
}

async function renderStudentList(_uid: string): Promise<void> {
  // Get student profiles
  renderTemplate(container!, studentListSkeletonHtml());
  cachedStudentProfiles = await fetchStudents();
  const profileIds = cachedStudentProfiles.map((s) => s.id);
  const allRows = await fetchStudentAssessmentsCached(profileIds);
  const nowMs = Date.now();
  const upcomingRows = allRows.filter((r) => isStudentAssessmentUpcoming(r, nowMs));
  const baseRows = studentListMode === 'upcoming' ? upcomingRows : allRows;
  const hasMoreInMode = baseRows.length > studentListLimit;
  const rows = baseRows.slice(0, studentListLimit);

  const cards = rows
    .map((r) => {
      const a = r.assessment;
      const sub = r.submission;
      const isPast = new Date(a.dueDateTime) < new Date();
      const status = getStudentStatus(a, sub, isPast);

      return `
      <div class="rounded-xl border border-surface-default bg-surface-container dark:bg-dark-800 dark:border-dark-700 p-5 shadow-sm shadow-slate-900/5 dark:shadow-none hover:border-primary-500/30 dark:hover:border-dark-500 transition-all">
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="min-w-0">
            <h3 class="text-on-surface font-semibold text-lg">${esc(a.title)}</h3>
            <p class="text-on-surface-muted text-sm mt-0.5">${esc(safeCourseDisplayName(r.courseName))}</p>
          </div>
          <div class="shrink-0">${statusBadgeHtml(status)}</div>
        </div>
        <p class="text-on-surface-muted text-sm mb-4 line-clamp-2">${esc(a.description)}</p>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-xs text-on-surface-muted">
          <div class="flex flex-wrap gap-x-4 gap-y-1">
            <span>Due: ${formatDate(a.dueDateTime)}</span>
            <span>${a.questionCount} questions</span>
            <span>${a.totalPoints} pts</span>
            ${a.timeLimit ? `<span>${a.timeLimit} min</span>` : ''}
          </div>
          <div class="shrink-0">
            ${renderStudentAction(a, r, sub)}
          </div>
        </div>
      </div>`;
    })
    .join('');

  const tableRows = rows
    .map((r) => {
      const a = r.assessment;
      const sub = r.submission;
      const isPast = new Date(a.dueDateTime) < new Date();
      const status = getStudentStatus(a, sub, isPast);
      return `
      <tr class="border-b border-slate-200 hover:bg-slate-50/90 dark:border-dark-700 dark:hover:bg-white/5 transition-colors">
        <td class="py-3 px-4 text-on-surface font-medium">${esc(a.title)}</td>
        <td class="py-3 px-4 text-on-surface-muted text-sm">${esc(safeCourseDisplayName(r.courseName))}</td>
        <td class="py-3 px-4 text-center">${statusBadgeHtml(status)}</td>
        <td class="py-3 px-4 text-on-surface-muted text-sm whitespace-nowrap">${formatDate(a.dueDateTime)}</td>
        <td class="py-3 px-4 text-right">${renderStudentAction(a, r, sub)}</td>
      </tr>`;
    })
    .join('');

  renderTemplate(
    container!,
    `
    <div class="space-y-6">
      ${sectionHeader(
        'My Assessments',
        `<div class="inline-flex items-center gap-2 rounded-xl border border-slate-200/90 dark:border-dark-700 bg-white/70 dark:bg-dark-800/60 p-1">
          <button type="button" data-action="student-mode-upcoming"
            class="px-3 py-2 rounded-lg text-xs font-semibold min-h-[44px] ${
              studentListMode === 'upcoming'
                ? 'bg-primary-500/15 text-primary-800 dark:text-primary-200'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-white/5'
            }">Upcoming (${upcomingRows.length})</button>
          <button type="button" data-action="student-mode-all"
            class="px-3 py-2 rounded-lg text-xs font-semibold min-h-[44px] ${
              studentListMode === 'all'
                ? 'bg-primary-500/15 text-primary-800 dark:text-primary-200'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-white/5'
            }">All</button>
        </div>`
      )}
      ${
        rows.length === 0
          ? emptyState(
              studentListMode === 'upcoming'
                ? 'No upcoming assessments'
                : 'No assessments assigned',
              studentListMode === 'upcoming'
                ? 'Upcoming assessments match the dashboard list: published, due in the future, and still actionable.'
                : 'Assessments will appear here when your teacher publishes them.',
              `<button type="button" data-action="goto-classes-tab" class="px-4 py-2 rounded-lg bg-primary-500/20 text-primary-400 text-sm font-semibold hover:bg-primary-500/30 border border-primary-500/30">View my classes</button>`
            )
          : `<div class="md:hidden grid gap-4">${cards}</div>
          <div class="hidden md:block overflow-x-auto rounded-xl border border-slate-200/90 dark:border-dark-700">
            <table class="w-full text-sm">
              <thead class="bg-slate-50/95 dark:bg-dark-800/80">
                <tr class="text-slate-700 dark:text-dark-300 text-xs uppercase tracking-wider">
                  <th class="py-3 px-4 text-left">Title</th>
                  <th class="py-3 px-4 text-left">Class</th>
                  <th class="py-3 px-4 text-center">Status</th>
                  <th class="py-3 px-4 text-left">Due</th>
                  <th class="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>`
      }
      ${
        hasMoreInMode
          ? `
        <div class="flex justify-center pt-2">
          <button data-action="load-more-student"
                  class="px-4 py-2 rounded-lg bg-dark-700 text-dark-200 text-sm font-semibold hover:bg-dark-600 transition-colors">
            Load more
          </button>
        </div>
      `
          : ''
      }
    </div>`
  );
}

function getStudentStatus(_a: Assessment, sub: Submission | undefined, isPast: boolean): string {
  if (sub) {
    if (sub.status === 'graded' && sub.released) return 'Graded';
    if (sub.status === 'graded') return 'Graded (Pending Release)';
    if (sub.status === 'submitted' || sub.status === 'late_submitted') return 'Submitted';
    if (sub.status === 'in_progress') return isPast ? 'Overdue' : 'In Progress';
  }
  if (isPast) return 'Overdue';
  return 'Not Started';
}

function statusBadgeHtml(status: string): string {
  const colors: Record<string, string> = {
    'Not Started': 'bg-dark-800/90 text-dark-300 border border-dark-600/90',
    'In Progress': 'bg-blue-900/30 text-blue-400 border border-blue-500/25',
    Submitted: 'bg-amber-900/30 text-amber-400 border border-amber-500/25',
    Graded: 'bg-green-900/30 text-green-400 border border-green-500/25',
    'Graded (Pending Release)': 'bg-purple-900/30 text-purple-400 border border-purple-500/25',
    Overdue: 'bg-red-900/30 text-red-400 border border-red-500/30',
  };
  const cls = colors[status] || 'bg-dark-800 text-dark-300 border border-dark-600';
  return `<span class="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-tight ${cls}">${esc(status)}</span>`;
}

function renderStudentAction(
  a: Assessment,
  r: StudentAssessmentRow,
  sub: Submission | undefined
): string {
  const spId = r.activeStudentProfileId || '';
  if (sub?.status === 'graded' && sub.released) {
    return `<button data-action="view-results" data-class-id="${esc(r.courseId)}" data-id="${esc(a.id)}" data-sp="${esc(spId)}"
              class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500/20 text-green-400 hover:bg-green-500/30">View Grade</button>`;
  }
  if (sub?.status === 'submitted' || sub?.status === 'late_submitted' || sub?.status === 'graded') {
    return `<span class="text-dark-400 text-xs">Awaiting grade</span>`;
  }
  const isPast = new Date(a.dueDateTime) < new Date();
  if (isPast && !a.allowLate) {
    return `<span class="text-red-400 text-xs">Closed</span>`;
  }
  const label = sub?.status === 'in_progress' ? 'Resume' : 'Start';
  return `<button data-action="take-assessment" data-class-id="${esc(r.courseId)}" data-id="${esc(a.id)}" data-sp="${esc(spId)}"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary-500 text-white hover:bg-primary-600">${label}</button>`;
}

// ────────────────────────────────────────────────────────────────────────────
//  VIEW: ASSESSMENT BUILDER
// ────────────────────────────────────────────────────────────────────────────

async function renderBuilder(): Promise<void> {
  if (!container || viewState.view !== 'builder') return;
  const { classId, assessmentId } = viewState;

  // Load courses for dropdown
  cachedCourses = await fetchCourses();
  if (cachedCourses.length === 0) {
    renderErrorPanel(
      container,
      'No classes found. Create a class/course first before building assessments.',
      {
        showBackToList: true,
      }
    );
    return;
  }

  let existing: Assessment | null = null;
  let existingQuestions: AssessmentQuestion[] = [];
  if (classId && assessmentId) {
    existing = await fetchAssessment(classId, assessmentId);
    existingQuestions = await fetchQuestions(classId, assessmentId);
  }

  const isEdit = !!existing;
  const title = isEdit ? 'Edit Assessment' : 'Create Assessment';

  const courseOptions = cachedCourses
    .map(
      (c) =>
        `<option value="${esc(c.id)}" ${existing?.classId === c.id ? 'selected' : ''}>${esc(safeCourseDisplayName(c.courseName))}${c.courseCode ? ` (${esc(c.courseCode)})` : ''}</option>`
    )
    .join('');

  // Build questions HTML
  const questionsHtml = existingQuestions.map((q, i) => questionCardHtml(q, i)).join('');

  const dueVal = existing?.dueDateTime ? toDatetimeLocalValue(existing.dueDateTime) : '';

  renderTemplate(
    container,
    `
    <div class="space-y-6 max-w-4xl">
      ${sectionHeader(title, `<button data-action="back-to-list" class="px-3 py-1.5 rounded-lg text-xs bg-dark-700 text-dark-300 hover:bg-dark-600">&larr; Back</button>`)}

      <form id="assessment-form" class="space-y-6">
        <input type="hidden" name="assessmentId" value="${esc(assessmentId || '')}">
        <input type="hidden" name="existingClassId" value="${esc(classId || '')}">

        <!-- Settings Card -->
        <div class="bg-dark-800 rounded-xl border border-dark-700 p-6 space-y-4">
          <h3 class="text-slate-100 font-semibold text-base mb-2">Assessment Details</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="md:col-span-2">
              <label class="block text-dark-300 text-sm mb-1">Title *</label>
              <input name="title" type="text" required value="${esc(existing?.title || '')}"
                     class="w-full px-3 py-2 rounded-lg bg-dark-900 border border-dark-600 text-white text-sm focus:border-primary-500 focus:outline-none">
            </div>
            <div class="md:col-span-2">
              <label class="block text-dark-300 text-sm mb-1">Description</label>
              <textarea name="description" rows="2"
                        class="w-full px-3 py-2 rounded-lg bg-dark-900 border border-dark-600 text-white text-sm focus:border-primary-500 focus:outline-none">${esc(existing?.description || '')}</textarea>
            </div>
            <div>
              <label class="block text-dark-300 text-sm mb-1">Class *</label>
              <select name="classId" id="builder-class-select" required ${isEdit ? 'disabled' : ''}
                      class="w-full px-3 py-2 rounded-lg bg-dark-900 border border-dark-600 text-white text-sm focus:border-primary-500 focus:outline-none">
                <option value="">Select class...</option>
                ${courseOptions}
              </select>
            </div>
            <div>
              <label class="block text-dark-300 text-sm mb-1">Allow Late Submissions</label>
              <select name="allowLate"
                      class="w-full px-3 py-2 rounded-lg bg-dark-900 border border-dark-600 text-white text-sm">
                <option value="false" ${existing && !existing.allowLate ? 'selected' : ''}>No</option>
                <option value="true" ${existing?.allowLate ? 'selected' : ''}>Yes</option>
              </select>
            </div>
            <div class="min-w-0 w-full md:col-span-2">
              <label class="block text-dark-300 text-sm mb-1" for="builder-due-datetime">Due Date & Time *</label>
              <div class="lms-assessment-datetime-field focus-within:ring-2 focus-within:ring-primary-500/50 focus-within:border-primary-500 transition-shadow">
                <input id="builder-due-datetime" name="dueDateTime" type="datetime-local" required value="${esc(dueVal)}"
                       class="w-full min-w-0 max-w-full px-3 py-2.5 sm:py-3 text-sm text-slate-900 bg-transparent border-0 focus:outline-none focus:ring-0 dark:text-white" />
              </div>
            </div>
            <div>
              <label class="block text-dark-300 text-sm mb-1">Late Policy</label>
              <input name="latePolicy" type="text" placeholder="e.g. -10% per day" value="${esc(existing?.latePolicy || '')}"
                     class="w-full px-3 py-2 rounded-lg bg-dark-900 border border-dark-600 text-white text-sm focus:border-primary-500 focus:outline-none">
            </div>
            <div>
              <label class="block text-dark-300 text-sm mb-1">Time Limit (minutes, 0 = none)</label>
              <input name="timeLimit" type="number" min="0" value="${existing?.timeLimit || 0}"
                     class="w-full px-3 py-2 rounded-lg bg-dark-900 border border-dark-600 text-white text-sm focus:border-primary-500 focus:outline-none">
            </div>
            <div>
              <label class="block text-dark-300 text-sm mb-1">Grade Release Policy</label>
              <select name="releasePolicy"
                      class="w-full px-3 py-2 rounded-lg bg-dark-900 border border-dark-600 text-white text-sm">
                <option value="auto" ${existing?.releasePolicy === 'auto' ? 'selected' : ''}>Auto (show immediately)</option>
                <option value="manual" ${existing?.releasePolicy === 'manual' ? 'selected' : ''}>Manual (teacher releases)</option>
              </select>
            </div>
            <div>
              <label class="block text-dark-300 text-sm mb-1">Assign To</label>
              <select name="assignedMode" id="builder-assigned-mode"
                      class="w-full px-3 py-2 rounded-lg bg-dark-900 border border-dark-600 text-white text-sm">
                <option value="class" ${existing?.assignedMode !== 'individual' ? 'selected' : ''}>Entire Class</option>
                <option value="individual" ${existing?.assignedMode === 'individual' ? 'selected' : ''}>Specific Students</option>
              </select>
            </div>
            <div id="individual-students-wrapper" class="md:col-span-2 space-y-2 ${existing?.assignedMode !== 'individual' ? 'hide' : ''}">
              <label class="block text-dark-300 text-sm mb-1">Assign to students</label>
              <p class="text-xs text-dark-500 leading-relaxed">Search by name, membership ID, or email. Only selected learners receive this assessment.</p>
              <input type="text" id="builder-student-assign-search" autocomplete="off" placeholder="Filter roster…"
                     class="w-full px-3 py-2 rounded-lg bg-dark-900 border border-dark-600 text-white text-sm placeholder-dark-500 focus:border-primary-500 focus:outline-none" />
              <input type="hidden" name="assignedStudentIds" id="builder-assigned-ids-hidden" value="${esc((existing?.assignedStudentIds || []).join(', '))}" />
              <div id="builder-student-assign-list" class="max-h-52 min-h-[2.5rem] overflow-y-auto rounded-lg border border-dark-600 bg-dark-900/80 p-2 space-y-0.5" role="group" aria-label="Students in selected class"></div>
            </div>
          </div>
        </div>

        <!-- Questions Section -->
        <div class="bg-dark-800 rounded-xl border border-dark-700 p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-slate-100 font-semibold text-base">Questions</h3>
            <button type="button" data-action="add-question"
                    class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary-500 text-white hover:bg-primary-600">
              + Add Question
            </button>
          </div>
          <div id="questions-container" class="space-y-4">
            ${questionsHtml || '<p class="text-dark-400 text-sm text-center py-8">No questions yet. Click "Add Question" to start.</p>'}
          </div>
        </div>

        <!-- Actions -->
        <div class="flex gap-3">
          <button type="submit" name="saveAction" value="draft"
                  class="px-5 py-2.5 rounded-lg bg-dark-700 text-white text-sm font-semibold hover:bg-dark-600 transition-colors">
            Save as Draft
          </button>
          <button type="submit" name="saveAction" value="publish"
                  class="px-5 py-2.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors">
            Save & Publish
          </button>
        </div>
      </form>
    </div>`
  );

  if (existing?.assignedMode === 'individual' && existing.classId) {
    await refreshBuilderStudentRoster(existing.classId, existing.assignedStudentIds ?? []);
  }
}

function questionCardHtml(q: Partial<AssessmentQuestion> & { id?: string }, index: number): string {
  const types: { val: QuestionType; label: string }[] = [
    { val: 'multiple_choice', label: 'Multiple Choice' },
    { val: 'checkbox', label: 'Checkbox (Multi-select)' },
    { val: 'short_answer', label: 'Short Answer' },
    { val: 'paragraph', label: 'Paragraph' },
    { val: 'numeric', label: 'Numeric' },
  ];
  const typeOpts = types
    .map(
      (t) => `<option value="${t.val}" ${q.type === t.val ? 'selected' : ''}>${t.label}</option>`
    )
    .join('');

  const showOptions = q.type === 'multiple_choice' || q.type === 'checkbox';
  const optionsHtml = (q.options || ['', ''])
    .map(
      (opt, oi) => `
    <div class="flex items-center gap-2 mb-1.5">
      <input type="${q.type === 'checkbox' ? 'checkbox' : 'radio'}" name="q${index}_correct" value="${oi}"
             ${(q.correctAnswers || []).includes(String(oi)) ? 'checked' : ''}
             class="accent-primary-500">
      <input type="text" value="${esc(opt)}" placeholder="Option ${oi + 1}"
             data-role="option-text" data-qi="${index}" data-oi="${oi}"
             class="flex-1 px-2 py-1 rounded bg-dark-900 border border-dark-600 text-white text-sm">
      <button type="button" data-action="remove-option" data-qi="${index}" data-oi="${oi}"
              class="text-red-400 hover:text-red-300 text-xs">✕</button>
    </div>`
    )
    .join('');

  return `
    <div class="bg-dark-900 rounded-lg border border-dark-600 p-4 question-card" data-qi="${index}" data-qid="${esc(q.id || '')}">
      <div class="flex items-start justify-between mb-3">
        <span class="text-primary-400 font-semibold text-sm">Q${index + 1}</span>
        <button type="button" data-action="remove-question" data-qi="${index}"
                class="text-red-400 hover:text-red-300 text-xs">Remove</button>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div class="md:col-span-2">
          <input type="text" placeholder="Question prompt *" value="${esc(q.prompt || '')}"
                 data-role="q-prompt" data-qi="${index}" required
                 class="w-full px-3 py-2 rounded-lg bg-dark-800 border border-dark-600 text-white text-sm">
        </div>
        <div class="flex gap-2">
          <select data-role="q-type" data-qi="${index}"
                  class="flex-1 px-2 py-2 rounded-lg bg-dark-800 border border-dark-600 text-white text-sm">
            ${typeOpts}
          </select>
          <input type="number" min="1" value="${q.points || 10}" data-role="q-points" data-qi="${index}"
                 class="w-20 px-2 py-2 rounded-lg bg-dark-800 border border-dark-600 text-white text-sm text-center"
                 title="Points">
        </div>
      </div>
      <div data-role="options-area" data-qi="${index}" class="${showOptions ? '' : 'hide'}">
        <div class="text-dark-400 text-xs mb-1">Options (mark correct answer):</div>
        <div data-role="options-list" data-qi="${index}">
          ${optionsHtml}
        </div>
        <button type="button" data-action="add-option" data-qi="${index}"
                class="text-primary-400 text-xs hover:text-primary-300 mt-1">+ Add Option</button>
      </div>
      <div data-role="correct-text-area" data-qi="${index}" class="${q.type === 'numeric' || q.type === 'short_answer' ? 'mt-2' : 'mt-2 hide'}">
        <label class="text-dark-400 text-xs">Correct Answer:</label>
        <input type="text" data-role="q-correct-text" data-qi="${index}"
               value="${esc((q.correctAnswers || [])[0] || '')}"
               class="ml-2 px-2 py-1 rounded bg-dark-800 border border-dark-600 text-white text-sm w-48">
      </div>
      <div class="flex items-center gap-4 mt-3 text-xs text-dark-400">
        <label class="flex items-center gap-1">
          <input type="checkbox" data-role="q-required" data-qi="${index}" ${q.required !== false ? 'checked' : ''}
                 class="accent-primary-500"> Required
        </label>
        ${
          showOptions
            ? `
        <label class="flex items-center gap-1">
          <input type="checkbox" data-role="q-shuffle" data-qi="${index}" ${q.shuffleOptions ? 'checked' : ''}
                 class="accent-primary-500"> Shuffle options
        </label>`
            : ''
        }
      </div>
    </div>`;
}

// ────────────────────────────────────────────────────────────────────────────
//  VIEW: TAKE ASSESSMENT (Student)
// ────────────────────────────────────────────────────────────────────────────

async function renderTake(): Promise<void> {
  if (!container || viewState.view !== 'take') return;
  const { classId, assessmentId, studentProfileId } = viewState;

  const assessment = await fetchAssessment(classId, assessmentId);
  if (!assessment) {
    renderErrorPanel(container, 'Assessment not found', { showBackToList: true });
    return;
  }

  const questions = await fetchQuestions(classId, assessmentId);
  const studentName = cachedStudentProfiles.find((s) => s.id === studentProfileId)?.name || '';

  // Start or resume submission
  let submission: Submission;
  try {
    submission = await startSubmission(classId, assessmentId, studentProfileId, studentName);
  } catch (err: unknown) {
    renderErrorPanel(
      container,
      'Could not start this assessment. Return to the list and try again.',
      {
        showBackToList: true,
      }
    );
    showAppToast(formatErrorForUserToast(err, 'Could not open the assessment.'), 'error');
    return;
  }

  const isPast = new Date(assessment.dueDateTime) < new Date();

  const questionsHtml = questions
    .map((q, i) => {
      const ans = submission.answers[q.id];
      return `
      <div class="bg-dark-800 rounded-xl border border-dark-700 p-5 mb-4">
        <div class="flex items-start justify-between mb-2">
          <span class="text-primary-400 font-semibold text-sm">Question ${i + 1}${q.required ? ' *' : ''}</span>
          <span class="text-dark-400 text-xs">${q.points} pts</span>
        </div>
        <p class="text-white text-sm mb-3">${esc(q.prompt)}</p>
        ${renderAnswerInput(q, i, ans)}
      </div>`;
    })
    .join('');

  renderTemplate(
    container,
    `
    <div class="max-w-3xl space-y-6">
      ${sectionHeader(
        assessment.title,
        `
        <button data-action="back-to-list" class="px-3 py-1.5 rounded-lg text-xs bg-dark-700 text-dark-300 hover:bg-dark-600">&larr; Back</button>
      `
      )}
      <div class="text-dark-300 text-sm">
        ${esc(assessment.description)}
        <div class="flex gap-4 mt-2 text-xs text-dark-400">
          <span>Due: ${formatDate(assessment.dueDateTime)}</span>
          <span>Total: ${assessment.totalPoints} pts</span>
          ${assessment.timeLimit ? `<span>Time limit: ${assessment.timeLimit} min</span>` : ''}
          ${isPast ? '<span class="text-red-400">Past due</span>' : ''}
        </div>
      </div>

      <form id="take-assessment-form" data-class-id="${esc(classId)}" data-id="${esc(assessmentId)}" data-sp="${esc(studentProfileId)}">
        ${questionsHtml}
        <div class="flex gap-3 pt-2">
          <button type="button" data-action="save-progress" data-class-id="${esc(classId)}" data-id="${esc(assessmentId)}" data-sp="${esc(studentProfileId)}"
                  class="px-4 py-2.5 rounded-lg bg-dark-700 text-white text-sm font-semibold hover:bg-dark-600">
            Save Progress
          </button>
          <button type="submit"
                  class="px-5 py-2.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700">
            Submit Assessment
          </button>
        </div>
      </form>
    </div>`
  );
}

function renderAnswerInput(q: AssessmentQuestion, _qi: number, ans?: QuestionAnswer): string {
  switch (q.type) {
    case 'multiple_choice':
      return (q.options || [])
        .map(
          (opt, oi) => `
        <label class="flex items-center gap-2 p-2 rounded hover:bg-dark-700 cursor-pointer">
          <input type="radio" name="ans_${esc(q.id)}" value="${oi}"
                 ${ans?.selectedOptions?.[0] === oi ? 'checked' : ''}
                 class="accent-primary-500">
          <span class="text-dark-200 text-sm">${esc(opt)}</span>
        </label>`
        )
        .join('');
    case 'checkbox':
      return (q.options || [])
        .map(
          (opt, oi) => `
        <label class="flex items-center gap-2 p-2 rounded hover:bg-dark-700 cursor-pointer">
          <input type="checkbox" name="ans_${esc(q.id)}" value="${oi}"
                 ${(ans?.selectedOptions || []).includes(oi) ? 'checked' : ''}
                 class="accent-primary-500">
          <span class="text-dark-200 text-sm">${esc(opt)}</span>
        </label>`
        )
        .join('');
    case 'short_answer':
      return `<input type="text" name="ans_${esc(q.id)}" value="${esc(ans?.value || '')}"
                     class="w-full px-3 py-2 rounded-lg bg-dark-900 border border-dark-600 text-white text-sm">`;
    case 'paragraph':
      return `<textarea name="ans_${esc(q.id)}" rows="4"
                        class="w-full px-3 py-2 rounded-lg bg-dark-900 border border-dark-600 text-white text-sm">${esc(ans?.value || '')}</textarea>`;
    case 'numeric':
      return `<input type="number" step="any" name="ans_${esc(q.id)}" value="${esc(ans?.value || '')}"
                     class="w-full px-3 py-2 rounded-lg bg-dark-900 border border-dark-600 text-white text-sm">`;
    default:
      return '';
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  VIEW: SUBMISSIONS LIST (Teacher)
// ────────────────────────────────────────────────────────────────────────────

async function renderSubmissionsList(): Promise<void> {
  if (!container || viewState.view !== 'submissions') return;
  const { classId, assessmentId } = viewState;

  const assessment = await fetchAssessment(classId, assessmentId);
  if (!assessment) {
    renderErrorPanel(container, 'Assessment not found', { showBackToList: true });
    return;
  }

  if (cachedStudentProfiles.length === 0) {
    try {
      cachedStudentProfiles = await fetchStudents();
    } catch {
      /* roster names fall back to "Student" */
    }
  }

  const submissions = await fetchSubmissions(classId, assessmentId);

  const rows = submissions
    .map((sub) => {
      const statusCls: Record<string, string> = {
        submitted: 'bg-yellow-500/20 text-yellow-400',
        late_submitted: 'bg-orange-500/20 text-orange-400',
        graded: 'bg-green-500/20 text-green-400',
        in_progress: 'bg-blue-500/20 text-blue-400',
      };
      const cls = statusCls[sub.status] || 'bg-dark-600 text-dark-300';
      return `
      <tr class="border-b border-slate-200/90 dark:border-dark-700 hover:bg-slate-50/90 dark:hover:bg-white/5 transition-colors"
          style="content-visibility:auto; contain: content; contain-intrinsic-size: 56px;">
        <td class="py-3 px-4 text-on-surface font-medium">${esc(submissionStudentDisplayName(sub))}</td>
        <td class="py-3 px-4 text-center"><span class="px-2 py-0.5 rounded-full text-xs font-semibold ${cls}">${sub.status.replace('_', ' ')}</span></td>
        <td class="py-3 px-4 text-center text-on-surface-muted text-xs">${sub.submittedAt ? formatDate(sub.submittedAt) : '—'}</td>
        <td class="py-3 px-4 text-center text-on-surface-muted tabular-nums">${sub.autoScore}/${sub.totalPoints}</td>
        <td class="py-3 px-4 text-center text-on-surface font-semibold tabular-nums">${sub.finalScore}/${sub.totalPoints}</td>
        <td class="py-3 px-4 text-center">${sub.needsGrading ? '<span class="text-yellow-400 text-xs">Needs grading</span>' : '<span class="text-green-400 text-xs">Complete</span>'}</td>
        <td class="py-3 px-4 text-center">${sub.released ? '<span class="text-green-400 text-xs">Yes</span>' : '<span class="text-dark-400 text-xs">No</span>'}</td>
        <td class="py-3 px-4 text-center">
          <div class="inline-flex items-center gap-1 flex-nowrap overflow-x-auto max-w-full align-middle" style="scrollbar-width: none;">
            <button data-action="grade-submission" data-class-id="${esc(classId)}" data-id="${esc(assessmentId)}" data-sp="${esc(sub.studentProfileId)}"
                    class="px-2 py-1 rounded text-xs bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 whitespace-nowrap">Grade</button>
            ${
              !sub.released
                ? `<button data-action="release-single" data-class-id="${esc(classId)}" data-id="${esc(assessmentId)}" data-sp="${esc(sub.studentProfileId)}"
                    class="px-2 py-1 rounded text-xs bg-green-500/20 text-green-400 hover:bg-green-500/30 whitespace-nowrap">Release</button>`
                : ''
            }
            <button data-action="reopen-submission" data-class-id="${esc(classId)}" data-id="${esc(assessmentId)}" data-sp="${esc(sub.studentProfileId)}"
                    class="px-2 py-1 rounded text-xs bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 whitespace-nowrap">Reopen</button>
          </div>
        </td>
      </tr>`;
    })
    .join('');

  renderTemplate(
    container,
    `
    <div class="space-y-6">
      ${sectionHeader(
        `Submissions: ${assessment.title}`,
        `
        <div class="flex gap-2">
          <button data-action="release-all" data-class-id="${esc(classId)}" data-id="${esc(assessmentId)}"
                  class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700">Release All Grades</button>
          <button data-action="back-to-list" class="px-3 py-1.5 rounded-lg text-xs bg-dark-700 text-dark-300 hover:bg-dark-600">&larr; Back</button>
        </div>
      `
      )}
      ${
        submissions.length === 0
          ? emptyState(
              'No submissions yet',
              "Students haven't started this assessment.",
              `<button data-action="back-to-list" type="button" class="px-4 py-2 rounded-lg bg-dark-700 text-dark-200 text-sm font-semibold hover:bg-dark-600 transition-colors">&larr; Back to assessments</button>`
            )
          : `<div class="overflow-x-auto rounded-xl border border-slate-200/90 dark:border-dark-700">
            <table class="w-full text-sm">
              <thead class="bg-surface-glass border-b border-surface-default dark:bg-dark-800/80 dark:border-dark-700">
                <tr class="text-on-surface-muted text-xs uppercase tracking-wider">
                  <th class="py-3 px-4 text-left">Student</th>
                  <th class="py-3 px-4 text-center">Status</th>
                  <th class="py-3 px-4 text-center">Submitted</th>
                  <th class="py-3 px-4 text-center">Auto Score</th>
                  <th class="py-3 px-4 text-center">Final Score</th>
                  <th class="py-3 px-4 text-center">Grading</th>
                  <th class="py-3 px-4 text-center">Released</th>
                  <th class="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody class="bg-surface-container dark:bg-slate-900/80">${rows}</tbody>
            </table>
          </div>`
      }
    </div>`
  );
}

// ────────────────────────────────────────────────────────────────────────────
//  VIEW: GRADING (Teacher)
// ────────────────────────────────────────────────────────────────────────────

async function renderGradeView(): Promise<void> {
  if (!container || viewState.view !== 'grade') return;
  const { classId, assessmentId, studentProfileId } = viewState;

  if (cachedStudentProfiles.length === 0) {
    try {
      cachedStudentProfiles = await fetchStudents();
    } catch {
      /* display name falls back to submission.studentName or "Student" */
    }
  }

  const assessment = await fetchAssessment(classId, assessmentId);
  const questions = await fetchQuestions(classId, assessmentId);
  const submission = await fetchSubmission(classId, assessmentId, studentProfileId);
  if (!assessment || !submission) {
    renderErrorPanel(container, 'Data not found', { showBackToList: true });
    return;
  }

  const questionsHtml = questions
    .map((q, i) => {
      const ans = submission.answers[q.id];
      const grade = submission.questionGrades[q.id];
      const isAuto = grade?.autoGraded ?? false;

      let answerDisplay = '';
      if (q.type === 'multiple_choice' || q.type === 'checkbox') {
        const selected = ans?.selectedOptions || [];
        answerDisplay = (q.options || [])
          .map((opt, oi) => {
            const isSelected = selected.includes(oi);
            const isCorrect = (q.correctAnswers || []).includes(String(oi));
            const icon = isSelected ? (isCorrect ? '✅' : '❌') : isCorrect ? '🟢' : '';
            return `<div class="flex items-center gap-2 text-sm ${isSelected ? 'text-white' : 'text-dark-400'}">
          ${icon} ${esc(opt)}
        </div>`;
          })
          .join('');
      } else {
        answerDisplay = `<p class="text-white text-sm">${esc(ans?.value || '(no answer)')}</p>`;
        if (q.correctAnswers?.length) {
          answerDisplay += `<p class="text-dark-400 text-xs mt-1">Expected: ${esc(q.correctAnswers[0])}</p>`;
        }
      }

      return `
      <div class="bg-dark-800 rounded-xl border border-dark-700 p-5">
        <div class="flex items-start justify-between mb-2">
          <span class="text-primary-400 font-semibold text-sm">Q${i + 1}: ${esc(q.prompt)}</span>
          <span class="text-dark-400 text-xs">${q.points} pts · ${q.type.replace('_', ' ')}</span>
        </div>
        <div class="mb-3 pl-2 border-l-2 border-dark-600">
          ${answerDisplay}
        </div>
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <label class="text-dark-300 text-xs">Points:</label>
            <input type="number" min="0" max="${q.points}" step="0.5"
                   value="${grade?.points ?? 0}"
                   data-role="grade-points" data-qid="${esc(q.id)}" data-max="${esc(String(q.points ?? 0))}"
                   class="w-20 px-2 py-1 rounded bg-dark-900 border border-dark-600 text-white text-sm text-center ${isAuto ? 'border-green-500/30' : ''}">
            <span class="text-dark-400 text-xs">/ ${q.points}</span>
          </div>
          <div class="flex-1">
            <input type="text" placeholder="Feedback (optional)"
                   value="${esc(grade?.feedback || '')}"
                   data-role="grade-feedback" data-qid="${esc(q.id)}"
                   class="w-full px-2 py-1 rounded bg-dark-900 border border-dark-600 text-white text-sm">
          </div>
          ${isAuto ? '<span class="text-green-400 text-xs whitespace-nowrap">Auto-graded</span>' : '<span class="text-yellow-400 text-xs whitespace-nowrap">Manual</span>'}
        </div>
      </div>`;
    })
    .join('');

  renderTemplate(
    container,
    `
    <div class="max-w-4xl space-y-6">
      ${sectionHeader(
        `Grade: ${submissionStudentDisplayName(submission)}`,
        `
        <button data-action="view-submissions" data-class-id="${esc(classId)}" data-id="${esc(assessmentId)}"
                class="px-3 py-1.5 rounded-lg text-xs bg-dark-700 text-dark-300 hover:bg-dark-600">&larr; Back to Submissions</button>
      `
      )}
      <div class="bg-dark-800/50 rounded-lg p-4 text-sm text-dark-300 flex gap-6">
        <span>Assessment: ${esc(assessment.title)}</span>
        <span>Submitted: ${submission.submittedAt ? formatDate(submission.submittedAt) : '—'}</span>
        <span>Auto Score: ${submission.autoScore}/${submission.totalPoints}</span>
        ${submission.isLate ? '<span class="text-orange-400">Late submission</span>' : ''}
      </div>

      <div class="space-y-4" id="grading-questions"
           data-class-id="${esc(classId)}" data-id="${esc(assessmentId)}" data-sp="${esc(studentProfileId)}">
        ${questionsHtml}
      </div>

      <div class="flex items-center gap-3">
        <div class="flex-1">
          <input type="text" id="grading-feedback-summary" placeholder="Overall feedback (optional)"
                 value="${esc(submission.feedbackSummary || '')}"
                 class="w-full px-3 py-2 rounded-lg bg-dark-900 border border-dark-600 text-white text-sm">
        </div>
        <button data-action="save-grades" data-class-id="${esc(classId)}" data-id="${esc(assessmentId)}" data-sp="${esc(studentProfileId)}"
                class="px-5 py-2.5 rounded-lg bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600">
          Save Grades
        </button>
        <button data-action="save-and-release" data-class-id="${esc(classId)}" data-id="${esc(assessmentId)}" data-sp="${esc(studentProfileId)}"
                class="px-5 py-2.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700">
          Save & Release
        </button>
      </div>
    </div>`
  );
}

// ────────────────────────────────────────────────────────────────────────────
//  VIEW: RESULTS (Student)
// ────────────────────────────────────────────────────────────────────────────

async function renderResultsView(): Promise<void> {
  if (!container || viewState.view !== 'results') return;
  const { classId, assessmentId, studentProfileId } = viewState;

  const assessment = await fetchAssessment(classId, assessmentId);
  const questions = await fetchQuestions(classId, assessmentId);
  const submission = await fetchSubmission(classId, assessmentId, studentProfileId);
  if (!assessment || !submission) {
    renderErrorPanel(container, 'Data not found', { showBackToList: true });
    return;
  }

  if (!submission.released) {
    renderTemplate(
      container,
      `
      <div class="space-y-6">
        ${sectionHeader(assessment.title, `<button data-action="back-to-list" class="px-3 py-1.5 rounded-lg text-xs bg-dark-700 text-dark-300 hover:bg-dark-600">&larr; Back</button>`)}
        ${emptyState(
          'Grades not yet released',
          'Your teacher has not released the grades for this assessment yet.',
          `<button data-action="back-to-list" type="button" class="px-4 py-2 rounded-lg bg-dark-700 text-dark-200 text-sm font-semibold hover:bg-dark-600 transition-colors">&larr; Back to assessments</button>`
        )}
      </div>`
    );
    return;
  }

  const pct =
    submission.totalPoints > 0
      ? Math.round((submission.finalScore / submission.totalPoints) * 100)
      : 0;
  const letter = pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 70 ? 'C' : pct >= 60 ? 'D' : 'F';

  const questionsHtml = questions
    .map((q, i) => {
      const ans = submission.answers[q.id];
      const grade = submission.questionGrades[q.id];

      let answerDisplay = '';
      if (q.type === 'multiple_choice' || q.type === 'checkbox') {
        const selected = ans?.selectedOptions || [];
        answerDisplay = (q.options || [])
          .map((opt, oi) => {
            const isSelected = selected.includes(oi);
            const isCorrect = (q.correctAnswers || []).includes(String(oi));
            let bg = '';
            if (isSelected && isCorrect) bg = 'bg-green-500/10 border-green-500/30';
            else if (isSelected && !isCorrect) bg = 'bg-red-500/10 border-red-500/30';
            else if (isCorrect) bg = 'bg-green-500/5';
            return `<div class="flex items-center gap-2 text-sm p-1.5 rounded border border-transparent ${bg}">
          <span class="${isSelected ? 'text-white' : 'text-dark-400'}">${esc(opt)}</span>
        </div>`;
          })
          .join('');
      } else {
        answerDisplay = `<p class="text-white text-sm">${esc(ans?.value || '(no answer)')}</p>`;
      }

      const ptColor = grade
        ? grade.points === grade.maxPoints
          ? 'text-green-400'
          : grade.points > 0
            ? 'text-yellow-400'
            : 'text-red-400'
        : 'text-dark-400';

      return `
      <div class="bg-dark-800 rounded-xl border border-dark-700 p-5">
        <div class="flex items-start justify-between mb-2">
          <span class="text-dark-200 font-medium text-sm">Q${i + 1}: ${esc(q.prompt)}</span>
          <span class="${ptColor} font-semibold text-sm">${grade?.points ?? '?'}/${q.points}</span>
        </div>
        <div class="pl-2 border-l-2 border-dark-600 mb-2">${answerDisplay}</div>
        ${grade?.feedback ? `<p class="text-dark-300 text-xs italic mt-1">Feedback: ${esc(grade.feedback)}</p>` : ''}
      </div>`;
    })
    .join('');

  renderTemplate(
    container,
    `
    <div class="max-w-3xl space-y-6">
      ${sectionHeader(assessment.title, `<button data-action="back-to-list" class="px-3 py-1.5 rounded-lg text-xs bg-dark-700 text-dark-300 hover:bg-dark-600">&larr; Back</button>`)}

      <!-- Score Summary -->
      <div class="bg-dark-800 rounded-xl border border-dark-700 p-6 text-center">
        <div class="text-5xl font-bold text-white mb-1">${letter}</div>
        <div class="text-2xl text-primary-400 font-semibold">${submission.finalScore} / ${submission.totalPoints}</div>
        <div class="text-dark-300 text-sm mt-1">${pct}%</div>
        ${submission.isLate ? '<div class="text-orange-400 text-xs mt-2">Late submission</div>' : ''}
        ${submission.feedbackSummary ? `<p class="text-dark-300 text-sm mt-4 italic">"${esc(submission.feedbackSummary)}"</p>` : ''}
      </div>

      <!-- Questions -->
      <div class="space-y-4">
        ${questionsHtml}
      </div>
    </div>`
  );
}

// ────────────────────────────────────────────────────────────────────────────
//  EVENT HANDLERS (delegated)
// ────────────────────────────────────────────────────────────────────────────

async function handleClick(e: Event): Promise<void> {
  const target = e.target as HTMLElement;
  const btn = target.closest('[data-action]') as HTMLElement | null;
  if (!btn) return;

  const action = btn.dataset.action!;
  const classId = btn.dataset.classId || '';
  const id = btn.dataset.id || '';
  const sp = btn.dataset.sp || '';
  const qi = parseInt(btn.dataset.qi || '-1');

  try {
    switch (action) {
      // Navigation
      case 'back-to-list':
        navigate({ view: 'list' });
        break;
      case 'student-mode-upcoming':
        studentListMode = 'upcoming';
        await renderCurrentView();
        break;
      case 'student-mode-all':
        studentListMode = 'all';
        await renderCurrentView();
        break;
      case 'goto-classes-tab': {
        const w = window as unknown as { switchToTab?: (t: string) => void };
        w.switchToTab?.('classes');
        break;
      }
      case 'create-assessment':
        navigate({ view: 'builder' });
        break;
      case 'load-more-teacher':
        teacherListLimit += 30;
        await renderCurrentView();
        break;
      case 'load-more-student':
        studentListLimit += 20;
        await renderCurrentView();
        break;
      case 'edit-assessment':
        navigate({ view: 'builder', classId, assessmentId: id });
        break;
      case 'view-submissions':
        navigate({ view: 'submissions', classId, assessmentId: id });
        break;
      case 'grade-submission':
        navigate({ view: 'grade', classId, assessmentId: id, studentProfileId: sp });
        break;
      case 'take-assessment':
        navigate({ view: 'take', classId, assessmentId: id, studentProfileId: sp });
        break;
      case 'view-results':
        navigate({ view: 'results', classId, assessmentId: id, studentProfileId: sp });
        break;

      // Assessment CRUD
      case 'delete-assessment':
        if (confirm('Delete this assessment and all its data?')) {
          showLoading();
          await deleteAssessment(classId, id);
          hideLoading();
          navigate({ view: 'list' });
        }
        break;

      // Builder: question management
      case 'add-question':
        addQuestionToBuilder();
        break;
      case 'remove-question':
        removeQuestionFromBuilder(qi);
        break;
      case 'add-option':
        addOptionToBuilder(qi);
        break;
      case 'remove-option':
        removeOptionFromBuilder(qi, parseInt(btn.dataset.oi || '0'));
        break;

      // Submission actions (student)
      case 'save-progress':
        await handleSaveProgress(classId, id, sp);
        break;

      // Grading actions (teacher)
      case 'save-grades':
        await handleSaveGrades(classId, id, sp, false);
        break;
      case 'save-and-release':
        await handleSaveGrades(classId, id, sp, true);
        break;
      case 'release-single':
        showLoading();
        await releaseGrades(classId, id, [sp]);
        hideLoading();
        navigate({ view: 'submissions', classId, assessmentId: id });
        break;
      case 'release-all': {
        showLoading();
        const subs = await fetchSubmissions(classId, id);
        await releaseGrades(
          classId,
          id,
          subs.map((s) => s.studentProfileId)
        );
        hideLoading();
        navigate({ view: 'submissions', classId, assessmentId: id });
        break;
      }
      case 'reopen-submission':
        if (confirm('Reopen this submission? The student will be able to edit and resubmit.')) {
          showLoading();
          await reopenSubmission(classId, id, sp);
          hideLoading();
          navigate({ view: 'submissions', classId, assessmentId: id });
        }
        break;
    }
  } catch (err: unknown) {
    hideLoading();
    showAppToast(
      formatErrorForUserToast(err, 'That assessment action could not be completed.'),
      'error'
    );
  }
}

function handleInput(e: Event): void {
  const target = e.target as HTMLElement;
  if (target.id === 'builder-student-assign-search') {
    filterBuilderAssigneeRows((target as HTMLInputElement).value);
  }
}

function handleChange(e: Event): void {
  const target = e.target as HTMLElement;

  // Toggle individual students visibility
  if (target.id === 'builder-assigned-mode') {
    const wrapper = document.getElementById('individual-students-wrapper');
    if (wrapper) {
      const isInd = (target as HTMLSelectElement).value === 'individual';
      wrapper.classList.toggle('hide', !isInd);
      if (isInd) {
        const classSel = document.getElementById(
          'builder-class-select'
        ) as HTMLSelectElement | null;
        const existingClass = (
          document.querySelector(
            '#assessment-form input[name="existingClassId"]'
          ) as HTMLInputElement | null
        )?.value?.trim();
        const courseId = classSel?.value?.trim() || existingClass || '';
        const hidden = document.getElementById(
          'builder-assigned-ids-hidden'
        ) as HTMLInputElement | null;
        const prev = (hidden?.value || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        void refreshBuilderStudentRoster(courseId, prev);
      }
    }
  }

  if (target.id === 'builder-class-select') {
    const mode = (document.getElementById('builder-assigned-mode') as HTMLSelectElement | null)
      ?.value;
    if (mode === 'individual') {
      void refreshBuilderStudentRoster((target as HTMLSelectElement).value, []);
    }
  }

  if (
    target instanceof HTMLInputElement &&
    target.matches('input[data-assignee-cb]') &&
    target.closest('#builder-student-assign-list')
  ) {
    syncBuilderAssignedIdsFromCheckboxes();
  }

  // Change question type → show/hide options and correct-text areas
  if (target.getAttribute('data-role') === 'q-type') {
    const qi = target.getAttribute('data-qi');
    const val = (target as HTMLSelectElement).value;
    const optionsArea = document.querySelector(
      `[data-role="options-area"][data-qi="${qi}"]`
    ) as HTMLElement;
    const correctTextArea = document.querySelector(
      `[data-role="correct-text-area"][data-qi="${qi}"]`
    ) as HTMLElement;
    if (optionsArea) {
      optionsArea.classList.toggle('hide', val !== 'multiple_choice' && val !== 'checkbox');
    }
    if (correctTextArea) {
      correctTextArea.classList.toggle('hide', val !== 'numeric' && val !== 'short_answer');
    }
  }
}

async function handleSubmit(e: SubmitEvent): Promise<void> {
  e.preventDefault();
  const form = e.target as HTMLFormElement;

  // Take-assessment form
  if (form.id === 'take-assessment-form') {
    await handleSubmitAssessment(form);
    return;
  }

  // Assessment builder form
  if (form.id === 'assessment-form') {
    const submitter = e.submitter as HTMLButtonElement;
    await handleSaveAssessment(form, submitter?.value === 'publish');
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  BUILDER LOGIC
// ────────────────────────────────────────────────────────────────────────────

function addQuestionToBuilder(): void {
  const qc = document.getElementById('questions-container');
  if (!qc) return;

  // Remove "no questions" message if present
  const noMsg = qc.querySelector('p.text-dark-400');
  if (noMsg) noMsg.remove();

  const index = qc.querySelectorAll('.question-card').length;
  const newQ: Partial<AssessmentQuestion> = {
    type: 'multiple_choice',
    prompt: '',
    required: true,
    points: 10,
    options: ['', ''],
    correctAnswers: [],
    order: index + 1,
    shuffleOptions: false,
  };
  appendParsedHtml(qc, questionCardHtml(newQ, index));
}

function removeQuestionFromBuilder(qi: number): void {
  const card = document.querySelector(`.question-card[data-qi="${qi}"]`);
  if (card) card.remove();
  // Re-index remaining cards
  document.querySelectorAll('.question-card').forEach((card, i) => {
    card.setAttribute('data-qi', String(i));
    const label = card.querySelector('.text-primary-400');
    if (label) label.textContent = `Q${i + 1}`;
  });
}

function addOptionToBuilder(qi: number): void {
  const list = document.querySelector(`[data-role="options-list"][data-qi="${qi}"]`);
  if (!list) return;
  const oi = list.children.length;
  const typeSelect = document.querySelector(
    `[data-role="q-type"][data-qi="${qi}"]`
  ) as HTMLSelectElement;
  const inputType = typeSelect?.value === 'checkbox' ? 'checkbox' : 'radio';

  const row = document.createElement('div');
  row.className = 'flex items-center gap-2 mb-1.5';
  const marker = document.createElement('input');
  marker.type = inputType;
  marker.setAttribute('name', `q${qi}_correct`);
  marker.value = String(oi);
  marker.className = 'accent-primary-500';
  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.placeholder = `Option ${oi + 1}`;
  textInput.setAttribute('data-role', 'option-text');
  textInput.setAttribute('data-qi', String(qi));
  textInput.setAttribute('data-oi', String(oi));
  textInput.className =
    'flex-1 px-2 py-1 rounded bg-dark-900 border border-dark-600 text-white text-sm';
  const rm = document.createElement('button');
  rm.type = 'button';
  rm.setAttribute('data-action', 'remove-option');
  rm.setAttribute('data-qi', String(qi));
  rm.setAttribute('data-oi', String(oi));
  rm.className = 'text-red-400 hover:text-red-300 text-xs';
  rm.textContent = '✕';
  row.append(marker, textInput, rm);
  list.appendChild(row);
}

function removeOptionFromBuilder(qi: number, oi: number): void {
  const list = document.querySelector(`[data-role="options-list"][data-qi="${qi}"]`);
  if (!list || list.children.length <= 2) return; // Keep at least 2 options
  // Find the specific option row by its data attribute instead of child index
  const btn = list.querySelector(`[data-action="remove-option"][data-qi="${qi}"][data-oi="${oi}"]`);
  const optionRow = btn?.parentElement;
  if (optionRow) optionRow.remove();
}

/** Collect question data from the builder DOM. */
function collectQuestionsFromDOM(): Omit<AssessmentQuestion, 'id'>[] {
  const cards = document.querySelectorAll('.question-card');
  const questions: Omit<AssessmentQuestion, 'id'>[] = [];

  cards.forEach((card, i) => {
    const prompt = (card.querySelector(`[data-role="q-prompt"]`) as HTMLInputElement)?.value || '';
    const type =
      ((card.querySelector(`[data-role="q-type"]`) as HTMLSelectElement)?.value as QuestionType) ||
      'multiple_choice';
    const points = parseFloat(
      (card.querySelector(`[data-role="q-points"]`) as HTMLInputElement)?.value || '10'
    );
    const required =
      (card.querySelector(`[data-role="q-required"]`) as HTMLInputElement)?.checked ?? true;
    const shuffle =
      (card.querySelector(`[data-role="q-shuffle"]`) as HTMLInputElement)?.checked ?? false;

    let options: string[] | undefined;
    let correctAnswers: string[] | undefined;

    if (type === 'multiple_choice' || type === 'checkbox') {
      options = [];
      correctAnswers = [];
      const optionsList = card.querySelector('[data-role="options-list"]');
      if (optionsList) {
        const optInputs = optionsList.querySelectorAll('[data-role="option-text"]');
        optInputs.forEach((inp) => {
          options!.push((inp as HTMLInputElement).value);
        });
        // Get checked correct answers using type-agnostic selector within the options list
        const correctInputs = optionsList.querySelectorAll(
          'input[type="radio"]:checked, input[type="checkbox"]:checked'
        );
        correctInputs.forEach((inp) => {
          correctAnswers!.push((inp as HTMLInputElement).value);
        });
      }
    } else if (type === 'numeric' || type === 'short_answer') {
      const correctText =
        (card.querySelector(`[data-role="q-correct-text"]`) as HTMLInputElement)?.value || '';
      correctAnswers = correctText ? [correctText] : [];
    }
    // Firestore does not allow undefined; use empty arrays when not applicable
    const optionsSafe = options ?? [];
    const correctAnswersSafe = correctAnswers ?? [];

    questions.push({
      type,
      prompt,
      required,
      points,
      options: optionsSafe,
      correctAnswers: correctAnswersSafe,
      order: i + 1,
      shuffleOptions: shuffle,
    });
  });

  return questions;
}

async function handleSaveAssessment(form: HTMLFormElement, publish: boolean): Promise<void> {
  const fd = new FormData(form);
  const existingId = fd.get('assessmentId') as string;
  const existingClassId = fd.get('existingClassId') as string;
  const classId = existingClassId || (fd.get('classId') as string);

  if (!classId) {
    showAppToast('Please select a class.', 'info');
    return;
  }

  const questions = collectQuestionsFromDOM();
  if (questions.length === 0) {
    showAppToast('Please add at least one question.', 'info');
    return;
  }
  if (questions.some((q) => !q.prompt.trim())) {
    showAppToast('All questions must have a prompt.', 'info');
    return;
  }

  const totalPoints = questions.reduce((s, q) => s + q.points, 0);
  const dueRaw = fd.get('dueDateTime') as string;
  const dueDateTime = dueRaw ? new Date(dueRaw).toISOString() : new Date().toISOString();

  const assignedMode = fd.get('assignedMode') as 'class' | 'individual';
  const hiddenAssign = (
    document.getElementById('builder-assigned-ids-hidden') as HTMLInputElement | null
  )?.value;
  const assignedStudentIds =
    assignedMode === 'individual'
      ? (hiddenAssign ?? (fd.get('assignedStudentIds') as string) ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  if (assignedMode === 'individual' && assignedStudentIds.length === 0) {
    showAppToast('Select at least one student, or choose Entire Class.', 'info');
    return;
  }

  const assessmentData = {
    title: fd.get('title') as string,
    description: (fd.get('description') as string) || '',
    status: publish ? ('published' as const) : ('draft' as const),
    dueDateTime,
    allowLate: fd.get('allowLate') === 'true',
    latePolicy: (fd.get('latePolicy') as string) || '',
    timeLimit: parseInt((fd.get('timeLimit') as string) || '0') || 0,
    releasePolicy: fd.get('releasePolicy') as 'auto' | 'manual',
    assignedMode,
    assignedStudentIds,
    totalPoints,
    questionCount: questions.length,
  };

  showLoading();
  try {
    let aId: string;
    if (existingId) {
      // Update existing
      await updateAssessment(classId, existingId, assessmentData);
      aId = existingId;

      // Delete old questions and re-create (simplest approach for reordering)
      const oldQuestions = await fetchQuestions(classId, existingId);
      for (const oq of oldQuestions) {
        await deleteQuestion(classId, existingId, oq.id);
      }
    } else {
      aId = await createAssessment(classId, assessmentData);
    }

    // Save questions
    for (const q of questions) {
      await addQuestion(classId, aId, q);
    }

    navigate({ view: 'list' });
  } catch (err: unknown) {
    showAppToast(formatErrorForUserToast(err, 'Could not save the assessment.'), 'error');
  } finally {
    hideLoading();
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  STUDENT SUBMISSION LOGIC
// ────────────────────────────────────────────────────────────────────────────

function collectAnswersFromDOM(
  form: HTMLFormElement,
  questions: AssessmentQuestion[]
): Record<string, QuestionAnswer> {
  const answers: Record<string, QuestionAnswer> = {};
  for (const q of questions) {
    if (q.type === 'multiple_choice') {
      const checked = form.querySelector(
        `input[name="ans_${q.id}"]:checked`
      ) as HTMLInputElement | null;
      answers[q.id] = { selectedOptions: checked ? [parseInt(checked.value)] : [] };
    } else if (q.type === 'checkbox') {
      const checked = form.querySelectorAll(`input[name="ans_${q.id}"]:checked`);
      answers[q.id] = {
        selectedOptions: Array.from(checked).map((c) => parseInt((c as HTMLInputElement).value)),
      };
    } else {
      const input = form.querySelector(`[name="ans_${q.id}"]`) as
        | HTMLInputElement
        | HTMLTextAreaElement
        | null;
      answers[q.id] = { value: input?.value || '' };
    }
  }
  return answers;
}

async function handleSaveProgress(
  classId: string,
  assessmentId: string,
  studentProfileId: string
): Promise<void> {
  const form = document.getElementById('take-assessment-form') as HTMLFormElement;
  if (!form) return;

  const questions = await fetchQuestions(classId, assessmentId);
  const answers = collectAnswersFromDOM(form, questions);

  showLoading();
  try {
    await saveProgress(classId, assessmentId, studentProfileId, answers);
    showAppToast('Progress saved!', 'success');
  } catch (err: unknown) {
    showAppToast(formatErrorForUserToast(err, 'Could not save your progress.'), 'error');
  } finally {
    hideLoading();
  }
}

async function handleSubmitAssessment(form: HTMLFormElement): Promise<void> {
  const classId = form.dataset.classId || '';
  const assessmentId = form.dataset.id || '';
  const sp = form.dataset.sp || '';

  if (
    !confirm(
      'Submit this assessment? You will not be able to change your answers after submitting.'
    )
  )
    return;

  const questions = await fetchQuestions(classId, assessmentId);
  const answers = collectAnswersFromDOM(form, questions);

  showLoading();
  try {
    const submission = await submitAssessmentData(classId, assessmentId, sp, answers);

    if (submission.released) {
      navigate({ view: 'results', classId, assessmentId, studentProfileId: sp });
    } else {
      showAppToast('Assessment submitted successfully!', 'success');
      navigate({ view: 'list' });
    }
  } catch (err: unknown) {
    showAppToast(formatErrorForUserToast(err, 'Could not submit the assessment.'), 'error');
  } finally {
    hideLoading();
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  GRADING LOGIC
// ────────────────────────────────────────────────────────────────────────────

async function handleSaveGrades(
  classId: string,
  assessmentId: string,
  studentProfileId: string,
  release: boolean
): Promise<void> {
  const gradingContainer = document.getElementById('grading-questions');
  if (!gradingContainer) return;

  showLoading();
  try {
    // Collect grades from DOM
    const pointInputs = gradingContainer.querySelectorAll('[data-role="grade-points"]');

    for (const input of Array.from(pointInputs)) {
      const el = input as HTMLInputElement;
      const qid = el.dataset.qid || '';
      const max = parseFloat(el.dataset.max || '0');
      const pts = parseFloat(el.value) || 0;
      const feedbackEl = gradingContainer.querySelector(
        `[data-role="grade-feedback"][data-qid="${qid}"]`
      ) as HTMLInputElement;
      const feedback = feedbackEl?.value || '';
      await gradeQuestion(classId, assessmentId, studentProfileId, qid, pts, max, feedback);
    }

    // Finalize
    const summaryEl = document.getElementById('grading-feedback-summary') as HTMLInputElement;
    await finalizeGrading(classId, assessmentId, studentProfileId, summaryEl?.value || '');

    if (release) {
      await releaseGrades(classId, assessmentId, [studentProfileId]);
    }

    navigate({ view: 'submissions', classId, assessmentId });
  } catch (err: unknown) {
    showAppToast(formatErrorForUserToast(err, 'Could not save grades.'), 'error');
  } finally {
    hideLoading();
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  UI HELPERS
// ────────────────────────────────────────────────────────────────────────────

/** Locale-formatted date safe to embed in HTML templates. */
function formatDate(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return esc(isoStr);
    const s = d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    return esc(s);
  } catch {
    return esc(isoStr);
  }
}

function sectionHeader(title: string, rightHtml?: string): string {
  return `
    <div class="flex items-center justify-between gap-3 transition-all duration-200">
      <h2 class="text-xl font-bold text-on-surface font-display">${esc(title)}</h2>
      <div class="flex items-center gap-2 shrink-0">${rightHtml || ''}</div>
    </div>`;
}

function emptyState(title: string, subtitle?: string, ctaHtml?: string): string {
  const cta = ctaHtml
    ? `<div class="mt-6 flex flex-wrap justify-center gap-3">${ctaHtml}</div>`
    : '';
  return `
    <div class="lms-empty-state-panel text-center py-14 px-4 rounded-xl border border-surface-default bg-surface-container shadow-sm dark:shadow-none max-w-lg mx-auto">
      <p class="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-on-surface-subtle mb-2">DSKM LMS</p>
      <div class="text-4xl mb-3 opacity-30" aria-hidden="true">📋</div>
      <h3 class="text-on-surface font-semibold text-lg">${esc(title)}</h3>
      ${subtitle ? `<p class="text-on-surface-muted text-sm mt-1 max-w-md mx-auto leading-relaxed">${esc(subtitle)}</p>` : ''}
      ${cta}
    </div>`;
}

async function fetchTeacherAssessmentsCached(): Promise<TeacherAssessmentRow[]> {
  const now = Date.now();
  if (teacherAssessmentsCache && now - teacherAssessmentsCache.ts < CACHE_TTL_MS) {
    return teacherAssessmentsCache.data;
  }
  if (teacherAssessmentsInFlight) return teacherAssessmentsInFlight;
  teacherAssessmentsInFlight = fetchTeacherAssessments()
    .then((data) => {
      teacherAssessmentsCache = { ts: Date.now(), data };
      return data;
    })
    .finally(() => {
      teacherAssessmentsInFlight = null;
    });
  return teacherAssessmentsInFlight;
}

async function fetchStudentAssessmentsCached(
  profileIds: string[]
): Promise<StudentAssessmentRow[]> {
  const now = Date.now();
  if (studentAssessmentsCache && now - studentAssessmentsCache.ts < CACHE_TTL_MS) {
    return studentAssessmentsCache.data;
  }
  if (studentAssessmentsInFlight) return studentAssessmentsInFlight;
  studentAssessmentsInFlight = fetchStudentAssessments(profileIds)
    .then((data) => {
      studentAssessmentsCache = { ts: Date.now(), data };
      return data;
    })
    .finally(() => {
      studentAssessmentsInFlight = null;
    });
  return studentAssessmentsInFlight;
}

function teacherListSkeletonHtml(): string {
  const card = `
      <div class="rounded-xl border border-surface-default bg-surface-container dark:bg-dark-800 dark:border-dark-700 p-5 shadow-sm dark:shadow-none">
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="min-w-0 flex-1">
            <div class="skeleton skeleton-text !w-[70%]"></div>
            <div class="skeleton skeleton-text short mt-2 !w-[45%]"></div>
          </div>
          <div class="skeleton skeleton-pill !w-16 !h-6"></div>
        </div>
        <div class="flex gap-3 mb-4">
          <div class="skeleton skeleton-text short !w-24"></div>
          <div class="skeleton skeleton-text short !w-24"></div>
          <div class="skeleton skeleton-text short !w-20"></div>
        </div>
        <div class="flex gap-2 overflow-hidden">
          <div class="skeleton skeleton-btn !w-24 !h-9"></div>
          <div class="skeleton skeleton-btn !w-28 !h-9"></div>
          <div class="skeleton skeleton-btn !w-24 !h-9"></div>
        </div>
      </div>`;
  const row = `
    <tr class="border-b border-slate-200/90 dark:border-dark-700">
      <td class="py-3 px-4"><div class="skeleton skeleton-text !w-[65%]"></div></td>
      <td class="py-3 px-4"><div class="skeleton skeleton-text short !w-[55%]"></div></td>
      <td class="py-3 px-4 text-center"><div class="skeleton skeleton-pill mx-auto !w-20 !h-6"></div></td>
      <td class="py-3 px-4 text-center"><div class="skeleton skeleton-text short mx-auto !w-24"></div></td>
      <td class="py-3 px-4 text-center"><div class="skeleton skeleton-text short mx-auto !w-10"></div></td>
      <td class="py-3 px-4 text-center"><div class="skeleton skeleton-text short mx-auto !w-10"></div></td>
      <td class="py-3 px-4 text-center"><div class="skeleton skeleton-btn mx-auto !w-40 !h-7"></div></td>
    </tr>`;
  return `
    <div class="space-y-6">
      ${sectionHeader(
        'Assessments',
        `
          <button data-action="create-assessment"
                class="inline-flex items-center justify-center min-h-11 px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-all duration-200">
          + Create Assessment
        </button>
      `
      )}
      <div class="md:hidden grid gap-4">${card.repeat(6)}</div>
      <div class="hidden md:block overflow-x-auto rounded-xl border border-slate-200/90 dark:border-dark-700">
        <table class="w-full text-sm">
          <thead class="bg-surface-glass border-b border-surface-default dark:bg-dark-800/80 dark:border-dark-700">
            <tr class="text-on-surface-muted text-xs uppercase tracking-wider">
              <th class="py-3 px-4 text-left">Title</th>
              <th class="py-3 px-4 text-left">Class</th>
              <th class="py-3 px-4 text-center">Status</th>
              <th class="py-3 px-4 text-center">Due</th>
              <th class="py-3 px-4 text-center">Questions</th>
              <th class="py-3 px-4 text-center">Points</th>
              <th class="py-3 px-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-surface-container dark:bg-slate-900/80">${row.repeat(8)}</tbody>
        </table>
      </div>
    </div>`;
}

function studentListSkeletonHtml(): string {
  const card = `
    <div class="rounded-xl border border-slate-200/90 bg-white/95 dark:border-dark-700 dark:bg-dark-800 p-5">
      <div class="flex items-start justify-between mb-3">
        <div class="min-w-0 flex-1">
          <div class="skeleton skeleton-text !w-[65%]"></div>
          <div class="skeleton skeleton-text short mt-2 !w-[40%]"></div>
        </div>
        <div class="skeleton skeleton-pill !w-20 !h-6"></div>
      </div>
      <div class="skeleton skeleton-text !w-[85%]"></div>
      <div class="skeleton skeleton-text short mt-2 !w-[55%]"></div>
      <div class="flex items-center justify-between text-xs text-dark-400 mt-4">
        <div class="flex gap-3">
          <div class="skeleton skeleton-text short !w-24"></div>
          <div class="skeleton skeleton-text short !w-24"></div>
          <div class="skeleton skeleton-text short !w-20"></div>
        </div>
        <div class="skeleton skeleton-btn !w-20 !h-7"></div>
      </div>
    </div>`;
  return `
    <div class="space-y-6">
      ${sectionHeader('My Assessments')}
      <div class="grid gap-4">${card.repeat(6)}</div>
    </div>`;
}
