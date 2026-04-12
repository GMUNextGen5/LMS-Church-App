/** Application bootstrap: auth, shell state, and tab wiring. */

import './assets/styles/tailwind.css';
import './core/shims/chart-bridge';
import './core/shims/jspdf-bridge';
import { reportClientFault } from './core/client-errors';
import { isFirebasePermissionDenied } from './core/firestore-errors';
import {
  setGradesFirestoreAccessDeniedHandler,
  notifyGradesFirestoreAccessDenied,
} from './core/firestore-ui-bridge';
import { registerSessionTeardown } from './core/session-teardown';
import {
  auth,
  db,
  functions,
  httpsCallable,
  ensureFirebaseClient,
  ensureAuthPersistence,
  signOut,
  doc,
  getDoc,
  collection,
  getDocs,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from './core/firebase';
import { agentDebugLog } from './core/debug-ingest';
import {
  getAppTheme,
  installThemeChangeBridge,
  registerThemeRefreshHandler,
} from './core/theme-events';
import {
  initAuth,
  signUp,
  signIn,
  logout,
  userLegalAcceptanceIncomplete,
  getCurrentUser,
  reloadCurrentUserFromFirestore,
} from './core/auth';
import { ParticleSystem } from './ui/particles';
import {
  initUI,
  showAuthContainer,
  showAppContainer,
  configureUIForRole,
  hideAllRoleRegionsForAuthHandshake,
  showError,
  clearError,
  showModal,
  showLoading,
  hideLoading,
  loginForm,
  signupForm,
  logoutBtn,
  loginError,
  signupError,
  getCurrentUserRole,
  sanitizeHTML,
  showFirebaseConfigurationError,
  showBootstrapError,
  showAppToast,
  formatErrorForUserToast,
} from './ui/ui';
import {
  fetchStudents,
  addGrade,
  updateGrade,
  deleteGrade,
  listenToGrades,
  exportGradesToCSV,
  fetchAttendance,
  markAttendance,
  createStudent,
  deleteStudent,
  updateStudent,
  fetchAllUsers,
  updateUserRoleDirect,
  createTeacher,
  saveUserSelfServiceProfile,
  fetchGradesForManyStudents,
  calculateStudentCumulativeGPA,
  invalidateStudentGpaSessionCache,
  invalidateStudentGpaSessionCacheIfUserChanged,
  seedStudentGpaSessionCache,
  computeCumulativeGpaFromGrades,
  studentHasCountableGradesForGpa,
  assertLearnerMayAccessStudentProfile,
} from './data/data';
import {
  countPendingSubmissionsForTeacher,
  fetchTeacherAssessmentDashboardRows,
  fetchTeacherGradingQueueRows,
  type TeacherAssessmentDashboardRow,
  type TeacherGradingQueueRow,
} from './data/assessment-data';
import {
  markAllStudentsPresent,
  pickActiveSessionClassId,
  localDateKey,
} from './data/attendance-data';
import { User, UserRole, Student, Grade, Attendance, Course } from './types';
import { userProfileDisplayLabel, fetchTeacherClasses } from './data/classes-data';
import { Chart } from 'chart.js';
import type { ChartConfiguration, TooltipItem } from 'chart.js';

type AnyChartInstance = InstanceType<typeof Chart>;
import { initAssessments, loadAssessments } from './ui/assessment-ui';
import { initClasses, loadClasses } from './ui/classes-ui';
import {
  initAttendanceBulkUI,
  refreshAttendanceBulkRoster,
  renderAttendanceHistoryRows,
  attendanceHistoryEmptyRowHtml,
} from './ui/attendance-ui';
import {
  clearGradesMobilePending,
  initGradesMobileUI,
  renderGradesMobile,
} from './ui/grades-mobile-ui';
import { initLegalModals } from './ui/legal';
import { setupSignupPasswordStrengthMeter } from './ui/signup-password-strength';
import { setupProfilePasswordStrengthMeter } from './ui/profile-password-strength';
import { evaluatePasswordStrength } from './core/password-strength';
import { LEGAL_PRIVACY_VERSION, LEGAL_TERMS_VERSION } from './core/legal-versions';
import { LMS_SEARCH_DEBOUNCE_MS } from './core/input-timing';
import {
  finiteToFixed,
  initialsForAvatarLabel,
  pickAvatarDiscPalette,
  safeAssignmentTitle,
  safeCourseChromeTitle,
  safeCourseDisplayName,
  safeCourseListLabel,
  safeStudentDisplayName,
} from './core/display-fallbacks';
import {
  emptyStateBlockHtml,
  emptyStateTableRowHtml,
  escapeHtmlText,
  renderTemplate,
} from './ui/dom-render';

let currentStudents: Student[] = [];
let currentGrades: Grade[] = [];
let currentAttendance: Attendance[] = [];
let selectedStudentId: string | null = null;
let attendanceRollCourses: Course[] = [];
let gradesUnsubscribe: (() => void) | null = null;
let particleSystem: ParticleSystem | null = null;
/** Last UID session data was bound to; when it changes, in-memory caches must reset before new loads. */
let sessionDataBoundUid: string | null = null;
let sessionFirestoreTeardownRegistered = false;
let gradesAccessDeniedUiWired = false;

const LMS_LAST_ATTENDANCE_CLASS_KEY = 'lms-attendance-last-class-id';
const GO_LIVE_BUTTON_LABEL = 'GO LIVE';

type LmsGlobalWindow = Window & {
  handleEditStudent?: (id: string) => void;
  handleDeleteStudent?: (id: string) => Promise<void>;
  handleDeleteTeacher?: (id: string) => Promise<void>;
  handleChangeRole?: (id: string, role: string) => Promise<void>;
  handleDeleteGrade?: (sid: string, gid: string) => Promise<void>;
  updateSidebarUserInfo?: (label: string, role: string, email?: string) => void;
  askAISuggestion?: (q: string) => void;
  /** Clears in-memory AI thread and restores the static welcome block (privacy on role change). */
  resetLmsAiAdvisorSession?: () => void;
};

type TabSwitchedDetail = { tab?: string };

type MobileBottomNavItem = { tab: string; label: string; icon: string };

const MOBILE_NAV_TEACHER: MobileBottomNavItem[] = [
  { tab: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { tab: 'attendance', label: 'Attendance', icon: 'check_circle' },
  { tab: 'grades', label: 'Grades', icon: 'grading' },
  { tab: 'student-profile', label: 'Profile', icon: 'person' },
];

const MOBILE_NAV_STUDENT: MobileBottomNavItem[] = [
  { tab: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { tab: 'classes', label: 'Classes', icon: 'school' },
  { tab: 'grades', label: 'Grades', icon: 'analytics' },
  { tab: 'student-profile', label: 'Profile', icon: 'person' },
];

const MOBILE_NAV_ADMIN: MobileBottomNavItem[] = [
  { tab: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { tab: 'users', label: 'Users', icon: 'manage_accounts' },
  { tab: 'classes', label: 'Classes', icon: 'class' },
  { tab: 'student-profile', label: 'Profile', icon: 'person' },
];

/** Theme-aware mobile bottom nav (light glass bar vs dark bar). */
const LMS_MOBILE_NAV_INACTIVE_CLASSES = [
  'text-slate-700',
  'dark:text-slate-300',
  'hover:text-slate-950',
  'dark:hover:text-white',
] as const;

const LMS_MOBILE_NAV_ACTIVE_CLASSES = [
  'bg-primary-100',
  'dark:bg-primary-500/15',
  'text-primary-900',
  'dark:text-primary-300',
  'ring-1',
  'ring-primary-300/55',
  'dark:ring-primary-400/35',
] as const;

function applyMobileNavBtnVisualState(btn: Element, active: boolean): void {
  const el = btn as HTMLElement;
  for (const c of LMS_MOBILE_NAV_INACTIVE_CLASSES) {
    el.classList.toggle(c, !active);
  }
  for (const c of LMS_MOBILE_NAV_ACTIVE_CLASSES) {
    el.classList.toggle(c, active);
  }
}

let lastRenderedMobileNavRole: UserRole | null | undefined;

function getActiveMainTabFromDom(): string {
  const el = document.querySelector('#app-container .tab-content:not(.hide)');
  if (!el?.id) return 'dashboard';
  const m = el.id.match(/^(.+)-content$/);
  return m?.[1] ?? 'dashboard';
}

/**
 * Updates teal “pill” active styles on mobile bottom nav buttons (kept in sync with `switchToTab`).
 */
function syncMobileBottomNavActiveState(tabName: string): void {
  document.querySelectorAll('.lms-mobile-nav-btn[data-tab]').forEach((btn) => {
    const id = btn.getAttribute('data-tab');
    const on = id === tabName;
    applyMobileNavBtnVisualState(btn, on);
    btn.setAttribute('aria-current', on ? 'page' : 'false');
  });
}

/**
 * Rebuilds the fixed mobile bottom bar from `index.html`’s `#lms-mobile-bottom-nav-slot` via `replaceChildren`.
 * Mapping: Teacher → Dashboard / Attendance / Grades / Profile; Student → Dashboard / Classes / Grades / Profile;
 * Admin → Dashboard / Users / Classes / Profile. (Sign out stays in the mobile menu / desktop chrome.)
 */
function renderRoleBasedBottomNav(role: UserRole | null): void {
  const slot = document.getElementById('lms-mobile-bottom-nav-slot');
  if (!slot) return;

  if (role == null) {
    lastRenderedMobileNavRole = undefined;
    slot.replaceChildren();
    return;
  }

  const items: MobileBottomNavItem[] =
    role === 'teacher'
      ? MOBILE_NAV_TEACHER
      : role === 'student'
        ? MOBILE_NAV_STUDENT
        : role === 'admin'
          ? MOBILE_NAV_ADMIN
          : [];

  if (items.length === 0) {
    lastRenderedMobileNavRole = undefined;
    slot.replaceChildren();
    return;
  }

  const win = window as unknown as { switchToTab?: (t: string) => void };
  let activeTab = getActiveMainTabFromDom();
  if (!items.some((i) => i.tab === activeTab)) {
    activeTab = 'dashboard';
    win.switchToTab?.('dashboard');
  }

  const sameRole = lastRenderedMobileNavRole === role;
  lastRenderedMobileNavRole = role;

  if (sameRole) {
    syncMobileBottomNavActiveState(getActiveMainTabFromDom());
    return;
  }

  const frag = document.createDocumentFragment();
  for (const item of items) {
    const on = item.tab === activeTab;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = [
      'lms-mobile-nav-btn',
      'flex flex-col items-center justify-center gap-1',
      'flex-1 min-h-[48px] min-w-[48px]',
      'rounded-2xl px-2 py-2 transition-colors touch-manipulation',
      ...(on ? LMS_MOBILE_NAV_ACTIVE_CLASSES : LMS_MOBILE_NAV_INACTIVE_CLASSES),
    ].join(' ');
    btn.setAttribute('data-tab', item.tab);
    btn.setAttribute('data-lms-action', 'switch-tab');
    btn.setAttribute('data-lms-tab', item.tab);
    btn.setAttribute('aria-label', item.label);
    btn.setAttribute('aria-current', on ? 'page' : 'false');

    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined text-[26px] leading-none shrink-0 select-none';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = item.icon;

    const lab = document.createElement('span');
    lab.className = 'text-[9px] font-bold uppercase tracking-wide truncate max-w-full text-center';
    lab.textContent = item.label;

    btn.append(icon, lab);
    frag.appendChild(btn);
  }

  slot.replaceChildren(frag);
  syncMobileBottomNavActiveState(activeTab);
}

function installRoleBasedMobileNavBridge(): void {
  const w = window as unknown as {
    syncMobileBottomNavActiveState?: (tab: string) => void;
    renderRoleBasedBottomNav?: (role: UserRole | null) => void;
  };
  w.syncMobileBottomNavActiveState = syncMobileBottomNavActiveState;
  w.renderRoleBasedBottomNav = renderRoleBasedBottomNav;

  const onRole = (ev: Event): void => {
    const role = (ev as CustomEvent<{ role: UserRole | null }>).detail?.role ?? null;
    renderRoleBasedBottomNav(role);
  };
  document.addEventListener('lms-role-configured', onRole);
}

/** True after the first auth-driven shell update finishes (or bootstrap gave up / config failed). */
let authShellReady = false;
let bootstrapWatchdogId: number | undefined;

function markAuthShellReady(): void {
  authShellReady = true;
  if (bootstrapWatchdogId !== undefined) {
    window.clearTimeout(bootstrapWatchdogId);
    bootstrapWatchdogId = undefined;
  }
}

/**
 * Defers DOM writes until after the next paint so layout exists (reduces DevTools-only race symptoms).
 * Callbacks must not synchronously call `scheduleDomPaint` in a tight self-retriggering loop; current
 * call sites only enqueue one paint batch per user/auth event.
 */
function scheduleDomPaint(fn: () => void): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        fn();
      } catch {
        /* host DOM not ready */
      }
    });
  });
}

/** Returns a debounced wrapper that invokes `fn` after `ms` milliseconds of inactivity. */
function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  ms: number
): (...args: Args) => void {
  let timer: number;
  return (...args: Args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), ms);
  };
}

/** Delegated clicks for dashboard tables (avoids inline onclick / quoted-ID XSS issues). */
function setupLmsDelegatedActions(): void {
  const app = document.getElementById('app-container');
  if (!app || (app as HTMLElement & { __lmsDel?: boolean }).__lmsDel) return;
  (app as HTMLElement & { __lmsDel?: boolean }).__lmsDel = true;
  const gw = window as LmsGlobalWindow;
  app.addEventListener('click', async (e) => {
    if ((e.target as HTMLElement).closest('#assessments-content')) return;
    const el = (e.target as HTMLElement).closest('[data-lms-action]') as HTMLElement | null;
    if (!el) return;
    const action = el.dataset.lmsAction;
    if (action === 'edit-student') {
      const id = el.dataset.studentId;
      if (id) gw.handleEditStudent?.(id);
      return;
    }
    if (action === 'delete-student') {
      const id = el.dataset.studentId;
      if (id) await gw.handleDeleteStudent?.(id);
      return;
    }
    if (action === 'delete-teacher') {
      const id = el.dataset.userId;
      if (id) await gw.handleDeleteTeacher?.(id);
      return;
    }
    if (action === 'change-role') {
      const id = el.dataset.userId;
      const role = el.dataset.userRole ?? '';
      if (id) await gw.handleChangeRole?.(id, role);
      return;
    }
    if (action === 'delete-grade') {
      const sid = el.dataset.studentId;
      const gid = el.dataset.gradeId;
      if (sid && gid) await gw.handleDeleteGrade?.(sid, gid);
      return;
    }
    if (action === 'dashboard-open-assessments') {
      const w = window as unknown as { switchToTab?: (t: string) => void };
      w.switchToTab?.('assessments');
      return;
    }
    if (action === 'switch-tab') {
      const tab = el.dataset.lmsTab?.trim();
      if (tab) {
        const w = window as unknown as { switchToTab?: (t: string) => void };
        w.switchToTab?.(tab);
      }
      return;
    }
  });
}

/** Bootstraps UI, auth, forms, feature modules, and the centralized theme refresh bridge. */
async function init(): Promise<void> {
  /**
   * Critical-path resilience:
   * - Show a boot overlay immediately to avoid a blank/half-rendered shell.
   * - Guarantee the overlay is cleared even if auth never resolves (watchdog) or a handler throws (finally).
   *
   * Rationale: if Firebase fails to initialize cleanly or network/auth stalls, `onAuthStateChanged` can
   * appear to "never fire" from the user's perspective, leaving the app stuck on "Loading..." forever.
   */
  try {
    showLoading();
  } catch {
    /* overlay not mounted yet */
  }

  try {
    initUI();
    hideAllRoleRegionsForAuthHandshake();
  } catch {
    // UI boot should not block Firebase init; fall through to banner-based error handling if needed.
  }

  if (!sessionFirestoreTeardownRegistered) {
    sessionFirestoreTeardownRegistered = true;
    registerSessionTeardown(() => {
      if (gradesUnsubscribe) {
        gradesUnsubscribe();
        gradesUnsubscribe = null;
      }
    });
  }

  if (!gradesAccessDeniedUiWired) {
    gradesAccessDeniedUiWired = true;
    setGradesFirestoreAccessDeniedHandler(() => {
      if (gradesUnsubscribe) {
        gradesUnsubscribe();
        gradesUnsubscribe = null;
      }
      currentGrades = [];
      const chartsSection = document.getElementById('grade-charts-section');
      chartsSection?.classList.add('hide');
      const gradesTableBody = document.getElementById('grades-table-body');
      if (gradesTableBody) {
        const userRole = getCurrentUserRole();
        const colspan = userRole === 'teacher' || userRole === 'admin' ? 5 : 4;
        renderTemplate(
          gradesTableBody,
          emptyStateTableRowHtml(
            colspan,
            'Access denied',
            'This account cannot load grade data under the current security rules. Sign out and sign in again, or contact your administrator.',
            ''
          )
        );
      }
      renderGradesMobile([], selectedStudentId, getCurrentUserRole() ?? 'student');
      showAppToast(
        'Grade data is blocked by security rules. If this is unexpected, contact support.',
        'error'
      );
    });
  }

  try {
    installRoleBasedMobileNavBridge();
  } catch {
    /* mobile nav bridge */
  }

  (
    window as Window & { lmsShowToast?: (m: string, k?: 'success' | 'error' | 'info') => void }
  ).lmsShowToast = (message: string, kind?: 'success' | 'error' | 'info') => {
    showAppToast(message, kind ?? 'info');
  };
  const docWithToast = document as Document & { __lmsToastBridge?: boolean };
  if (!docWithToast.__lmsToastBridge) {
    docWithToast.__lmsToastBridge = true;
    document.addEventListener('lms-toast', (ev: Event) => {
      const d = (ev as CustomEvent<{ message?: string; kind?: 'success' | 'error' | 'info' }>)
        .detail;
      if (d?.message) showAppToast(d.message, d.kind ?? 'info');
    });
  }

  // Auth forms (login/signup + password strength) must wire even when Firebase config is missing,
  // so the early return below does not skip them.
  try {
    setupAuthForms();
  } catch {
    /* auth form wiring */
  }

  const firebaseErr = ensureFirebaseClient();
  if (firebaseErr) {
    // #region agent log
    agentDebugLog({
      sessionId: 'ecf1fb',
      hypothesisId: 'E',
      runId: 'pre',
      location: 'main.ts:init',
      message: 'firebase client missing — early return',
      data: { errLen: firebaseErr.message.length },
    });
    // #endregion
    scheduleDomPaint(() => {
      showFirebaseConfigurationError(firebaseErr.message);
      try {
        hideLoading();
      } catch {
        /* ignore */
      }
    });
    markAuthShellReady();
    return;
  }

  try {
    await ensureAuthPersistence();
  } catch {
    /* IndexedDB / persistence denied: in-memory fallback attempted in ensureAuthPersistence */
  }

  try {
    setupAIAgentChat();
  } catch {
    /* AI advisor wiring */
  }

  /**
   * Watchdog: if `onAuthStateChanged` never delivers a callback, clear the overlay and show an error
   * (distinct from the 5s entry-point spinner guard in `runInit`).
   */
  let authSettled = false;
  /** Secondary guard if `onAuthStateChanged` never fires (blocked third-party scripts, etc.). */
  const authWatchdog = window.setTimeout(() => {
    if (authSettled) return;
    authSettled = true;
    scheduleDomPaint(() => {
      try {
        hideLoading();
      } catch {
        /* ignore */
      }
    });
    showBootstrapError(
      'Connection error: the app could not confirm your sign-in state. Please refresh. ' +
        'If this keeps happening, verify your Firebase config and Firestore rules.'
    );
    markAuthShellReady();
  }, 12_000);

  async function handleAuthStateChangeBootstrapCore(user: User | null): Promise<void> {
    if (!authSettled) {
      authSettled = true;
      window.clearTimeout(authWatchdog);
    }
    try {
      await handleAuthStateChange(user);
    } catch (e) {
      reportClientFault(e);
      scheduleDomPaint(() => {
        showBootstrapError(
          'Dashboard load was interrupted. Please refresh the page. ' +
            'If this keeps happening, check your network connection and Firebase configuration.'
        );
        showAppToast(
          'We could not finish loading the dashboard after sign-in. Refresh the page to try again.',
          'error'
        );
      });
    } finally {
      scheduleDomPaint(() => {
        try {
          hideLoading();
        } catch {
          /* ignore */
        }
      });
      markAuthShellReady();
    }
  }

  const handleAuthStateChangeBootstrap = (user: User | null): void => {
    scheduleDomPaint(() => {
      void handleAuthStateChangeBootstrapCore(user);
    });
  };

  try {
    initAuth(handleAuthStateChangeBootstrap);
  } catch {
    /* auth listener init */
  }
  try {
    setupAppForms();
  } catch {
    /* app wiring */
  }
  try {
    setupLmsDelegatedActions();
  } catch {
    /* delegated actions */
  }
  try {
    initAssessments();
  } catch {
    /* assessments init */
  }
  try {
    initClasses();
  } catch {
    /* classes init */
  }

  try {
    installThemeChangeBridge();
  } catch {
    /* theme bridge */
  }
  try {
    initLegalModals();
  } catch {
    /* legal modals */
  }
  try {
    initAccountIdUi();
  } catch {
    /* account id UI */
  }
  registerThemeRefreshHandler(() => {
    try {
      /* Always re-run so scales/point borders match theme even when the series is empty. */
      renderGradeCharts(currentGrades);
      particleSystem?.refreshForTheme();
      // #region agent log
      agentDebugLog({
        sessionId: 'ecf1fb',
        hypothesisId: 'B',
        runId: 'pre',
        location: 'main.ts:themeRefreshHandler',
        message: 'theme refresh handler completed',
        data: {
          gradesLen: currentGrades.length,
          hasParticles: !!particleSystem,
        },
      });
      // #endregion
    } catch (e) {
      // #region agent log
      agentDebugLog({
        sessionId: 'ecf1fb',
        hypothesisId: 'B',
        runId: 'pre',
        location: 'main.ts:themeRefreshHandler',
        message: 'theme refresh handler catch',
        data: { err: e instanceof Error ? e.message : String(e) },
      });
      // #endregion
      /* theme refresh */
    }
  });

  document.addEventListener('tab-switched', async (e: Event) => {
    const tab = (e as CustomEvent<TabSwitchedDetail>).detail?.tab;
    if (tab === 'classes') await loadClasses();
    else if (tab === 'attendance') {
      refreshAttendanceBulkRoster();
      if (selectedStudentId) await loadStudentAttendance(selectedStudentId);
    } else if (tab === 'dashboard') {
      await refreshInstitutionalDashboardMetrics();
      await loadRecentActivity();
    } else if (tab === 'assessments') await loadAssessments();
    else if (tab === 'users') await loadAllUsers();
    else if (tab === 'student-profile') void loadUserProfile();
    else if (tab === 'teacher-registration') {
      await Promise.all([loadRegisteredTeachers(), populateTeacherAccountDropdown()]);
    }
  });

  startParticleSystemWhenReady();
}

/**
 * Starts the login canvas after `load` so layout and dimensions are stable (avoids racing the DOM).
 */
function startParticleSystemWhenReady(): void {
  const boot = (): void => {
    if (particleSystem) return;
    if (!document.getElementById('background-canvas')) return;
    try {
      particleSystem = new ParticleSystem('background-canvas');
    } catch {
      particleSystem = null;
    }
  };
  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot, { once: true });
}

// --- Auth state & form handlers ---

/** Main LMS entry URL (avoids staying on static legal pages after a successful session). */
function getDashboardUrl(_role: User['role']): string {
  return new URL('/', window.location.origin).href;
}

/**
 * Removes privileged admin/teacher DOM and in-session AI transcript before student data loads
 * (mitigates stale markup and memory from a prior session on shared devices).
 */
function purgePrivilegedDashboardDomForStudent(): void {
  const mountIds = [
    'dashboard-institutional-mount',
    'dashboard-mobile-shell',
    'recent-activity',
    'student-gpa-metric-root',
    'dashboard-student-mastery-row',
    'grades-table-body',
    'grades-mobile-cards',
    'grades-mobile-progress-inner',
    'users-table-body',
    'registered-teachers-table-body',
    'registered-students-table-body',
    'attendance-history-body',
    'attendance-roster-table-body',
    'attendance-roll-call-root',
  ];
  for (const id of mountIds) {
    document.getElementById(id)?.replaceChildren();
  }
  const rollEmpty = document.getElementById('roll-call-filter-empty-mount');
  if (rollEmpty) {
    rollEmpty.replaceChildren();
    rollEmpty.classList.add('hidden');
  }
  (window as LmsGlobalWindow).resetLmsAiAdvisorSession?.();
}

/** Routes Firebase auth changes into UI visibility, role configuration, and data loads. */
async function handleAuthStateChange(user: User | null): Promise<void> {
  const isValidProfile =
    !!user &&
    typeof user.uid === 'string' &&
    !!user.uid &&
    typeof user.email === 'string' &&
    typeof user.role === 'string' &&
    (user.role === 'admin' || user.role === 'teacher' || user.role === 'student');

  // Safety Gate: never attempt to boot role-specific UI unless profile is confirmed valid.
  if (isValidProfile) {
    if (sessionDataBoundUid !== user.uid) {
      sessionDataBoundUid = user.uid;
      if (gradesUnsubscribe) {
        gradesUnsubscribe();
        gradesUnsubscribe = null;
      }
      clearGradesMobilePending();
      currentStudents = [];
      currentGrades = [];
      currentAttendance = [];
      selectedStudentId = null;
      attendanceRollCourses = [];
      institutionalSnapshot = { role: 'student' };
      purgePrivilegedDashboardDomForStudent();
    }
    const incomplete = userLegalAcceptanceIncomplete(user);
    if (incomplete) {
      sessionDataBoundUid = null;
      scheduleDomPaint(() => {
        try {
          hideLoading();
        } catch {
          /* ignore */
        }
        showAuthContainer();
        resetAppState();
        showBootstrapError(
          'Your account must acknowledge the current Terms of Service (version ' +
            LEGAL_TERMS_VERSION +
            '). Please contact an administrator to update your profile, or create a new student account through signup.'
        );
      });
      markAuthShellReady();
      void Promise.race([
        signOut(auth),
        new Promise<void>((resolve) => {
          window.setTimeout(() => resolve(), 5000);
        }),
      ]).catch(() => {
        /* sign-out best-effort; InPrivate must not block the shell */
      });
      return;
    }
    const dashboardUrl = getDashboardUrl(user.role);
    const here = window.location.href.split('#')[0];
    const there = dashboardUrl.split('#')[0];
    if (here !== there) {
      markAuthShellReady();
      window.location.href = dashboardUrl;
      return;
    }
    scheduleDomPaint(() => {
      showAppContainer();
      configureUIForRole(user);
      const userRole = getCurrentUserRole();
      const gw = window as LmsGlobalWindow;
      const sidebarLabel = userProfileDisplayLabel(user);
      gw.updateSidebarUserInfo?.(
        sidebarLabel === '—' ? user.email || '' : sidebarLabel,
        userRole ?? 'student',
        user.email || ''
      );
    });
    markAuthShellReady();

    if (user.role === 'student') {
      const studentSelectContainer = document.getElementById('student-select-container');
      if (studentSelectContainer) studentSelectContainer.remove();
      document.getElementById('dashboard-educator-student-picker')?.remove();
      const goLiveBtn = document.getElementById('lms-go-live-btn');
      if (goLiveBtn) goLiveBtn.remove();
      const headerSearch = document.getElementById('lms-header-search-wrap');
      if (headerSearch) headerSearch.remove();
    }

    invalidateStudentGpaSessionCacheIfUserChanged(user.uid);

    await initDashboard();
    void loadUserProfile();

    scheduleDomPaint(() => {
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.add('hide'));
      document.getElementById('dashboard-content')?.classList.remove('hide');

      document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.classList.remove('tab-active');
        btn.classList.add('text-dark-300');
      });
      const dashBtn = document.querySelector('.tab-btn[data-tab="dashboard"]');
      if (dashBtn) {
        dashBtn.classList.add('tab-active');
        dashBtn.classList.remove('text-dark-300');
      }

      document
        .querySelectorAll('.lms-nav-item[data-tab]')
        .forEach((item) => item.classList.remove('active'));
      document.querySelector('.lms-nav-item[data-tab="dashboard"]')?.classList.add('active');

      const breadcrumb = document.getElementById('breadcrumb-current');
      if (breadcrumb) breadcrumb.textContent = 'Dashboard';

      if (user.role === 'student' && user.studentProfile === null) {
        showBootstrapError(
          'Your student profile is not linked yet. Share your Account ID with your teacher or administrator ' +
            'so they can finish enrollment; you can still use the dashboard meanwhile.'
        );
      }
    });
  } else {
    sessionDataBoundUid = null;
    scheduleDomPaint(() => {
      hideAllRoleRegionsForAuthHandshake();
      showAuthContainer();
      resetAppState();
    });
    markAuthShellReady();
  }
}

function setupAuthForms(): void {
  const lf = loginForm ?? (document.getElementById('login-form') as HTMLFormElement | null);
  const sf = signupForm ?? (document.getElementById('signup-form') as HTMLFormElement | null);
  if (!lf || !sf) return;

  setupSignupPasswordStrengthMeter(sf);

  lf.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearError(loginError);
    const formData = new FormData(lf);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    if (!email || !password) {
      showError(loginError, 'Please fill in all fields');
      return;
    }
    const loginSubmit = lf.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    if (loginSubmit) loginSubmit.disabled = true;
    try {
      await signIn(email, password);
      lf.reset();
    } catch (error: unknown) {
      showError(
        loginError,
        error instanceof Error ? error.message : 'Login failed. Please try again.'
      );
    } finally {
      if (loginSubmit) loginSubmit.disabled = false;
    }
  });

  sf.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearError(signupError);
    const formData = new FormData(sf);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;
    if (!email || !password || !confirmPassword) {
      showError(signupError, 'Please fill in all fields');
      return;
    }
    if (password !== confirmPassword) {
      showError(signupError, 'Passwords do not match');
      return;
    }
    if (password.length < 6) {
      showError(signupError, 'Password must be at least 6 characters');
      return;
    }
    const acceptLegal = sf.querySelector('#signup-accept-legal') as HTMLInputElement | null;
    const legalField = document.getElementById('signup-legal-field');
    if (!acceptLegal?.checked) {
      showError(
        signupError,
        'Please agree to the Terms of Service and Privacy Policy before creating an account.'
      );
      if (legalField) {
        legalField.classList.remove('signup-legal-shake');
        void legalField.offsetWidth;
        legalField.classList.add('signup-legal-shake');
        const removeShake = (): void => legalField.classList.remove('signup-legal-shake');
        legalField.addEventListener('animationend', removeShake, { once: true });
      }
      acceptLegal?.focus();
      return;
    }
    const signupSubmit = sf.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    if (signupSubmit) signupSubmit.disabled = true;
    try {
      const uid = await signUp(email, password, {
        termsVersion: LEGAL_TERMS_VERSION,
        privacyVersion: LEGAL_PRIVACY_VERSION,
        userAgent: navigator.userAgent || '',
      });
      showUidModal(uid, email);
      sf.reset();
    } catch (error: unknown) {
      showError(
        signupError,
        error instanceof Error ? error.message : 'Signup failed. Please try again.'
      );
    } finally {
      if (signupSubmit) signupSubmit.disabled = false;
    }
  });

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await logout();
      } catch {
        showAppToast('Logout failed. Please try again.', 'error');
      }
    });
  }
}

// --- App form setup (student/teacher reg, grades, attendance, dashboard) ---
/** Attaches listeners for dashboard, grades, attendance, AI tools, and admin flows after login. */
function setupAppForms(): void {
  const studentRegForm = document.getElementById('student-registration-form') as HTMLFormElement;
  if (studentRegForm) {
    studentRegForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const regSubmitBtn = studentRegForm.querySelector(
        'button[type="submit"]'
      ) as HTMLButtonElement | null;
      const errorEl = document.getElementById('registration-error');
      const successEl = document.getElementById('registration-success');
      errorEl?.classList.add('hide');
      successEl?.classList.add('hide');
      const formData = new FormData(studentRegForm);
      const studentData = {
        name: formData.get('studentName') as string,
        memberId: (formData.get('memberId') as string) || '',
        yearOfBirth: parseInt(formData.get('yearOfBirth') as string),
        contactPhone: formData.get('contactPhone') as string,
        contactEmail: formData.get('contactEmail') as string,
        studentUid: formData.get('studentUid') as string,
        parentUid: formData.get('studentUid') as string,
        notes: (formData.get('notes') as string) || '',
      };
      if (regSubmitBtn) regSubmitBtn.disabled = true;
      try {
        showLoading();
        const studentId = await createStudent(studentData);
        if (successEl) {
          successEl.textContent = `Student "${studentData.name}" registered successfully. (ID: ${studentId})`;
          successEl.classList.remove('hide');
        }
        studentRegForm.reset();
        const studentDropdownValue = document.querySelector(
          '#student-account-dropdown .account-dropdown-value'
        );
        if (studentDropdownValue)
          studentDropdownValue.textContent = '-- Select Registered Account --';
        await Promise.all([initDashboard(), loadRegisteredStudents()]);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Registration failed';
        if (errorEl) {
          errorEl.textContent = 'Failed to register student: ' + msg;
          errorEl.classList.remove('hide');
        }
      } finally {
        hideLoading();
        if (regSubmitBtn) regSubmitBtn.disabled = false;
      }
    });
  }

  const teacherRegForm = document.getElementById('teacher-registration-form') as HTMLFormElement;
  if (teacherRegForm) {
    teacherRegForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const teacherSubmitBtn = teacherRegForm.querySelector(
        'button[type="submit"]'
      ) as HTMLButtonElement | null;
      const errorEl = document.getElementById('teacher-registration-error');
      const successEl = document.getElementById('teacher-registration-success');
      const finalUidEl = document.getElementById('final-teacher-uid') as HTMLInputElement;
      errorEl?.classList.add('hide');
      successEl?.classList.add('hide');
      const teacherUid = (
        finalUidEl?.value ||
        (teacherRegForm.querySelector('[name="teacherUid"]') as HTMLInputElement | null)?.value
      )?.trim();
      if (!teacherUid) {
        if (errorEl) {
          errorEl.textContent =
            'Link to Teacher Account is required. Select an account or enter UID manually.';
          errorEl.classList.remove('hide');
        }
        return;
      }
      const formData = new FormData(teacherRegForm);
      const teacherName = (formData.get('teacherName') as string)?.trim();
      const yearVal = formData.get('teacherYearOfBirth');
      const parsedYear = yearVal ? parseInt(String(yearVal), 10) : NaN;
      const yearOfBirth = Number.isNaN(parsedYear) ? undefined : parsedYear;
      if (teacherSubmitBtn) teacherSubmitBtn.disabled = true;
      try {
        showLoading();
        await createTeacher({
          teacherUid,
          name: teacherName || undefined,
          email: (formData.get('teacherEmail') as string)?.trim() || undefined,
          phone: (formData.get('teacherPhone') as string)?.trim() || undefined,
          memberId: (formData.get('teacherMemberId') as string)?.trim() || undefined,
          yearOfBirth,
          notes: (formData.get('teacherNotes') as string)?.trim() || undefined,
        });
        if (successEl) {
          successEl.textContent = `Teacher "${teacherName || 'registered'}" registered successfully.`;
          successEl.classList.remove('hide');
        }
        teacherRegForm.reset();
        if (finalUidEl) finalUidEl.value = '';
        const teacherDropdownValue = document.querySelector(
          '#teacher-account-dropdown .account-dropdown-value'
        );
        if (teacherDropdownValue)
          teacherDropdownValue.textContent = '-- Select Registered Account --';
        await loadRegisteredTeachers();
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        if (errorEl) {
          errorEl.textContent = 'Failed to register teacher: ' + msg;
          errorEl.classList.remove('hide');
        }
      } finally {
        hideLoading();
        if (teacherSubmitBtn) teacherSubmitBtn.disabled = false;
      }
    });
  }

  const useManualTeacherBtn = document.getElementById('use-manual-teacher-uid-btn');
  const useDropdownTeacherBtn = document.getElementById('use-dropdown-teacher-btn');
  const teacherDropdownMethod = document.getElementById('teacher-dropdown-method');
  const teacherManualMethod = document.getElementById('teacher-manual-method');
  if (
    useManualTeacherBtn &&
    useDropdownTeacherBtn &&
    teacherDropdownMethod &&
    teacherManualMethod
  ) {
    useManualTeacherBtn.addEventListener('click', () => {
      teacherDropdownMethod.classList.add('hide');
      teacherManualMethod.classList.remove('hide');
    });
    useDropdownTeacherBtn.addEventListener('click', () => {
      teacherDropdownMethod.classList.remove('hide');
      teacherManualMethod.classList.add('hide');
    });
  }
  setupAccountDropdown(
    'teacher-account-dropdown',
    'final-teacher-uid',
    populateTeacherAccountDropdown
  );
  const manualTeacherUidInput = document.getElementById('manual-teacher-uid') as HTMLInputElement;
  const finalTeacherUidInput = document.getElementById('final-teacher-uid') as HTMLInputElement;
  if (manualTeacherUidInput && finalTeacherUidInput) {
    manualTeacherUidInput.addEventListener('input', () => {
      finalTeacherUidInput.value = manualTeacherUidInput.value.trim();
    });
  }
  const refreshTeacherAccountsBtn = document.getElementById('refresh-teacher-accounts-btn');
  if (refreshTeacherAccountsBtn) {
    refreshTeacherAccountsBtn.addEventListener('click', () => populateTeacherAccountDropdown());
  }

  const usersSearch = document.getElementById('users-search') as HTMLInputElement;
  if (usersSearch) {
    const runUsersFilter = debounce((q: string) => {
      const tbody = document.getElementById('users-table-body');
      if (!tbody) return;
      tbody.querySelectorAll('.user-management-row').forEach((row) => {
        const el = row as HTMLElement;
        const email = (el.getAttribute('data-email') || '').toLowerCase();
        const name = (el.getAttribute('data-name') || '').toLowerCase();
        const show = !q || email.includes(q) || name.includes(q);
        el.style.display = show ? '' : 'none';
      });
    }, LMS_SEARCH_DEBOUNCE_MS);
    usersSearch.addEventListener('input', () => {
      runUsersFilter((usersSearch.value || '').toLowerCase().trim());
    });
  }

  const registeredStudentsSearch = document.getElementById(
    'registered-students-search'
  ) as HTMLInputElement;
  if (registeredStudentsSearch) {
    const runRegStudentsFilter = debounce((q: string) => {
      const tbody = document.getElementById('registered-students-table-body');
      if (!tbody) return;
      tbody.querySelectorAll('.registered-student-row').forEach((row) => {
        const el = row as HTMLElement;
        const memberId = (el.getAttribute('data-member-id') || '').toLowerCase();
        const name = (el.getAttribute('data-name') || '').toLowerCase();
        const email = (el.getAttribute('data-email') || '').toLowerCase();
        const show = !q || memberId.includes(q) || name.includes(q) || email.includes(q);
        el.style.display = show ? '' : 'none';
      });
    }, LMS_SEARCH_DEBOUNCE_MS);
    registeredStudentsSearch.addEventListener('input', () => {
      runRegStudentsFilter((registeredStudentsSearch.value || '').toLowerCase().trim());
    });
  }
  const registeredTeachersSearch = document.getElementById(
    'registered-teachers-search'
  ) as HTMLInputElement;
  if (registeredTeachersSearch) {
    const runRegTeachersFilter = debounce((q: string) => {
      const tbody = document.getElementById('registered-teachers-table-body');
      if (!tbody) return;
      tbody.querySelectorAll('.registered-teacher-row').forEach((row) => {
        const el = row as HTMLElement;
        const memberId = (el.getAttribute('data-member-id') || '').toLowerCase();
        const name = (el.getAttribute('data-name') || '').toLowerCase();
        const email = (el.getAttribute('data-email') || '').toLowerCase();
        const show = !q || memberId.includes(q) || name.includes(q) || email.includes(q);
        el.style.display = show ? '' : 'none';
      });
    }, LMS_SEARCH_DEBOUNCE_MS);
    registeredTeachersSearch.addEventListener('input', () => {
      runRegTeachersFilter((registeredTeachersSearch.value || '').toLowerCase().trim());
    });
  }

  const editStudentModal = document.getElementById('edit-student-modal');
  const editStudentForm = document.getElementById('edit-student-form') as HTMLFormElement;
  const editStudentModalClose = document.getElementById('edit-student-modal-close');
  const editStudentCancel = document.getElementById('edit-student-cancel');
  if (editStudentForm && editStudentModal) {
    editStudentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const studentId = (document.getElementById('edit-student-id') as HTMLInputElement)?.value;
      if (!studentId) return;
      const submitBtn = editStudentForm.querySelector(
        'button[type="submit"]'
      ) as HTMLButtonElement | null;
      const formData = new FormData(editStudentForm);
      const yearVal = formData.get('yearOfBirth');
      const yearOfBirth = yearVal ? parseInt(String(yearVal), 10) : undefined;
      if (submitBtn) submitBtn.disabled = true;
      try {
        showLoading();
        await updateStudent(studentId, {
          name: (formData.get('name') as string)?.trim() ?? '',
          memberId: (formData.get('memberId') as string)?.trim() ?? '',
          yearOfBirth: Number.isNaN(yearOfBirth) ? undefined : yearOfBirth,
          contactPhone: (formData.get('contactPhone') as string)?.trim() ?? '',
          contactEmail: (formData.get('contactEmail') as string)?.trim() ?? '',
          notes: (formData.get('notes') as string)?.trim() ?? '',
        });
        editStudentModal.classList.add('hide');
        await Promise.all([initDashboard(), loadRegisteredStudents()]);
        showAppToast('Student updated successfully.', 'success');
      } catch (err: unknown) {
        showAppToast(formatErrorForUserToast(err, 'Could not update this student.'), 'error');
      } finally {
        hideLoading();
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
  if (editStudentModalClose && editStudentModal) {
    editStudentModalClose.addEventListener('click', () => editStudentModal.classList.add('hide'));
  }
  if (editStudentCancel && editStudentModal) {
    editStudentCancel.addEventListener('click', () => editStudentModal.classList.add('hide'));
  }

  const studentSelect = document.getElementById('student-select') as HTMLSelectElement | null;
  if (studentSelect) {
    studentSelect.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      selectedStudentId = target.value;
      const pdfSection = document.getElementById('pdf-report-section');
      if (pdfSection) pdfSection.classList.toggle('hide', !selectedStudentId);
      if (selectedStudentId) {
        loadStudentGrades(selectedStudentId);
      } else {
        displayGrades([]);
      }
    });
  }

  const gradeEntryForm = document.getElementById('grade-entry-form') as HTMLFormElement | null;
  if (gradeEntryForm) {
    gradeEntryForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!selectedStudentId) {
        showAppToast('Please select a student first.', 'info');
        return;
      }
      const submitBtn = gradeEntryForm.querySelector(
        'button[type="submit"]'
      ) as HTMLButtonElement | null;
      const formData = new FormData(gradeEntryForm);
      const gradeData = {
        assignmentName: formData.get('assignmentName') as string,
        category: formData.get('category') as Grade['category'],
        score: parseFloat(formData.get('score') as string),
        totalPoints: parseFloat(formData.get('totalPoints') as string),
        teacherId: '',
        date: new Date().toISOString(),
      };
      if (submitBtn) submitBtn.disabled = true;
      try {
        await addGrade(selectedStudentId, gradeData);
        gradeEntryForm.reset();
      } catch (error: unknown) {
        reportClientFault(error);
        showAppToast(formatErrorForUserToast(error, 'Could not add this grade.'), 'error');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  const exportCsvBtn = document.getElementById('export-csv-btn');
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
      if (currentGrades.length === 0) {
        showAppToast('No grades to export. Please select a student with grades.', 'info');
        return;
      }
      const student = currentStudents.find((s) => s.id === selectedStudentId);
      exportGradesToCSV(currentGrades, student ? student.name : 'Unknown');
    });
  }

  const aiSummaryBtn = document.getElementById('ai-summary-btn');
  if (aiSummaryBtn) {
    aiSummaryBtn.addEventListener('click', async () => {
      if (!selectedStudentId) {
        showAppToast('Please select a student first.', 'info');
        return;
      }
      await generatePerformanceSummary(selectedStudentId);
    });
  }

  const studyTipsBtn = document.getElementById('study-tips-btn');
  if (studyTipsBtn) {
    studyTipsBtn.addEventListener('click', async () => {
      if (!selectedStudentId) {
        showAppToast('Please select a student first.', 'info');
        return;
      }
      await generateStudyTips(selectedStudentId);
    });
  }

  const refreshUsersBtn = document.getElementById('refresh-users-btn');
  if (refreshUsersBtn) {
    refreshUsersBtn.addEventListener('click', () => loadAllUsers());
  }

  const refreshAccountsBtn = document.getElementById('refresh-accounts-btn');
  if (refreshAccountsBtn) {
    refreshAccountsBtn.addEventListener('click', () => populateStudentAccountDropdown());
  }

  const useManualBtn = document.getElementById('use-manual-uid-btn');
  const useDropdownBtn = document.getElementById('use-dropdown-btn');
  const dropdownMethod = document.getElementById('dropdown-method');
  const manualMethod = document.getElementById('manual-method');
  if (useManualBtn && useDropdownBtn && dropdownMethod && manualMethod) {
    useManualBtn.addEventListener('click', () => {
      dropdownMethod.classList.add('hide');
      manualMethod.classList.remove('hide');
    });
    useDropdownBtn.addEventListener('click', () => {
      manualMethod.classList.add('hide');
      dropdownMethod.classList.remove('hide');
    });
  }

  setupAccountDropdown(
    'student-account-dropdown',
    'final-student-uid',
    populateStudentAccountDropdown
  );
  const manualUidInput = document.getElementById('manual-student-uid') as HTMLInputElement;
  const finalUidInput = document.getElementById('final-student-uid') as HTMLInputElement;
  if (manualUidInput && finalUidInput) {
    manualUidInput.addEventListener('input', () => {
      finalUidInput.value = manualUidInput.value.trim();
    });
  }

  const markAttendanceForm = document.getElementById('mark-attendance-form') as HTMLFormElement;
  if (markAttendanceForm) {
    const dateInput = document.getElementById('attendance-date') as HTMLInputElement;
    if (dateInput) dateInput.valueAsDate = new Date();
    updateAttendanceClassChrome();
    markAttendanceForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const markSubmitBtn = markAttendanceForm.querySelector(
        'button[type="submit"]'
      ) as HTMLButtonElement | null;
      const errorEl = document.getElementById('mark-attendance-error');
      const successEl = document.getElementById('mark-attendance-success');
      errorEl?.classList.add('hide');
      successEl?.classList.add('hide');
      const formData = new FormData(markAttendanceForm);
      const attendanceSelect = document.getElementById(
        'attendance-student-select'
      ) as HTMLSelectElement;
      const attendanceStudentId = attendanceSelect.value;
      if (!attendanceStudentId) {
        if (errorEl) {
          errorEl.textContent = 'Please select a student';
          errorEl.classList.remove('hide');
        }
        return;
      }
      if (markSubmitBtn) markSubmitBtn.disabled = true;
      const attendanceData = {
        date: formData.get('date') as string,
        status: formData.get('status') as 'present' | 'absent' | 'late' | 'excused',
        notes: (formData.get('notes') as string) || '',
        markedBy: '',
      };
      try {
        showLoading();
        await markAttendance(attendanceStudentId, attendanceData);
        if (successEl) {
          successEl.textContent = 'Attendance marked successfully.';
          successEl.classList.remove('hide');
        }
        markAttendanceForm.reset();
        dateInput.valueAsDate = new Date();
        if (selectedStudentId === attendanceStudentId)
          await loadStudentAttendance(attendanceStudentId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to mark attendance';
        if (errorEl) {
          errorEl.textContent = 'Failed to mark attendance: ' + msg;
          errorEl.classList.remove('hide');
        }
      } finally {
        hideLoading();
        if (markSubmitBtn) markSubmitBtn.disabled = false;
      }
    });
  }

  const attendanceStudentSelect = document.getElementById(
    'attendance-student-select'
  ) as HTMLSelectElement | null;
  if (attendanceStudentSelect) {
    attendanceStudentSelect.addEventListener('change', async (e) => {
      const studentId = (e.target as HTMLSelectElement).value;
      if (studentId) await loadStudentAttendance(studentId);
      else displayAttendance([]);
    });
  }

  const refreshAttendanceBtn = document.getElementById('refresh-attendance-btn');
  if (refreshAttendanceBtn) {
    refreshAttendanceBtn.addEventListener('click', async () => {
      const sel = document.getElementById('attendance-student-select') as HTMLSelectElement;
      if (sel.value) await loadStudentAttendance(sel.value);
    });
  }

  initAttendanceBulkUI({
    getStudents: () => getRosterStudentsForAttendance(),
    markOne: (studentId, payload) => markAttendance(studentId, payload),
    showLoading,
    hideLoading,
    showToast: (message, variant) => showAppToast(message, variant),
    formatError: formatErrorForUserToast,
    onBulkSaved: async () => {
      const sel = document.getElementById('attendance-student-select') as HTMLSelectElement | null;
      if (sel?.value) await loadStudentAttendance(sel.value);
    },
  });

  const attendanceClassSelect = document.getElementById(
    'attendance-class-select'
  ) as HTMLSelectElement | null;
  attendanceClassSelect?.addEventListener('change', () => {
    const v = attendanceClassSelect?.value?.trim();
    if (v) {
      try {
        localStorage.setItem(LMS_LAST_ATTENDANCE_CLASS_KEY, v);
      } catch {
        /* storage unavailable */
      }
    }
    updateAttendanceClassChrome();
    refreshAttendanceBulkRoster();
  });
  const attendanceDateInput = document.getElementById('attendance-date') as HTMLInputElement | null;
  attendanceDateInput?.addEventListener('change', () => updateAttendanceClassChrome());

  initGradesMobileUI({
    getStudentId: () => selectedStudentId,
    getGrades: () => currentGrades,
    updateGrade,
    markAttendance,
    showLoading,
    hideLoading,
    showToast: showAppToast,
    formatError: formatErrorForUserToast,
    refreshDisplay: () => displayGrades(currentGrades),
  });

  const dashboardStudentSelect = document.getElementById(
    'dashboard-student-select'
  ) as HTMLSelectElement;
  const dashboardStudentSearch = document.getElementById(
    'dashboard-student-search'
  ) as HTMLInputElement;
  const selectedStudentInfo = document.getElementById('selected-student-info');
  const selectedStudentNameEl = document.getElementById('selected-student-name');
  const selectedStudentIdEl = document.getElementById('selected-student-id');
  const clearStudentSelection = document.getElementById('clear-student-selection');
  const dashboardFilterEmptyEl = document.getElementById('dashboard-student-filter-empty');
  const gradesFilterEmptyEl = document.getElementById('grades-student-filter-empty');
  const attendanceFilterEmptyEl = document.getElementById('attendance-student-filter-empty');

  if (dashboardStudentSelect) {
    dashboardStudentSelect.addEventListener('change', async (e) => {
      const studentId = (e.target as HTMLSelectElement).value;
      if (studentId) {
        const student = currentStudents.find((s) => s.id === studentId);
        if (student) {
          if (selectedStudentInfo && selectedStudentNameEl && selectedStudentIdEl) {
            selectedStudentNameEl.textContent = safeStudentDisplayName(student.name);
            selectedStudentIdEl.textContent = `Member ID: ${student.memberId || 'N/A'}`;
            selectedStudentInfo.classList.remove('hide');
          }
          await Promise.all([loadStudentGrades(studentId), loadStudentAttendance(studentId)]);
          updateDashboardStatsForStudent(studentId);
        }
      } else {
        selectedStudentInfo?.classList.add('hide');
        await refreshInstitutionalDashboardMetrics();
        await loadRecentActivity();
      }
    });
  }

  const headerStudentSearch = document.getElementById(
    'lms-header-search-input'
  ) as HTMLInputElement | null;

  const syncHeaderToDashboardSearch = (v: string): void => {
    if (dashboardStudentSearch && document.activeElement !== dashboardStudentSearch) {
      dashboardStudentSearch.value = v;
    }
  };

  const syncDashboardToHeaderSearch = (v: string): void => {
    if (headerStudentSearch && document.activeElement !== headerStudentSearch) {
      headerStudentSearch.value = v;
    }
  };

  if (dashboardStudentSearch && dashboardStudentSelect) {
    const doSearch = debounce((searchTerm: string) => {
      filterStudentSelectOptions(dashboardStudentSelect, searchTerm, dashboardFilterEmptyEl);
      const visibleOptions = Array.from(dashboardStudentSelect.querySelectorAll('option')).filter(
        (opt) => opt.value !== '' && opt.style.display !== 'none'
      );
      if (visibleOptions.length === 1 && searchTerm) {
        dashboardStudentSelect.value = visibleOptions[0].value;
        dashboardStudentSelect.dispatchEvent(new Event('change'));
      }
    }, LMS_SEARCH_DEBOUNCE_MS);
    dashboardStudentSearch.addEventListener('input', (e) => {
      if (e.target !== dashboardStudentSearch) return;
      const raw = (e.target as HTMLInputElement).value;
      syncDashboardToHeaderSearch(raw);
      doSearch(raw.toLowerCase().trim());
    });
  }

  if (headerStudentSearch && dashboardStudentSelect) {
    const doHeaderSearch = debounce((searchTerm: string) => {
      filterStudentSelectOptions(dashboardStudentSelect, searchTerm, dashboardFilterEmptyEl);
      const visibleOptions = Array.from(dashboardStudentSelect.querySelectorAll('option')).filter(
        (opt) => opt.value !== '' && opt.style.display !== 'none'
      );
      if (visibleOptions.length === 1 && searchTerm) {
        dashboardStudentSelect.value = visibleOptions[0].value;
        dashboardStudentSelect.dispatchEvent(new Event('change'));
      }
    }, LMS_SEARCH_DEBOUNCE_MS);
    headerStudentSearch.addEventListener('input', (e) => {
      if (e.target !== headerStudentSearch) return;
      const raw = (e.target as HTMLInputElement).value;
      syncHeaderToDashboardSearch(raw);
      doHeaderSearch(raw.toLowerCase().trim());
    });
  }

  if (clearStudentSelection) {
    clearStudentSelection.addEventListener('click', () => {
      if (dashboardStudentSelect) {
        dashboardStudentSelect.value = '';
        filterStudentSelectOptions(dashboardStudentSelect, '', dashboardFilterEmptyEl);
        dashboardStudentSelect.dispatchEvent(new Event('change'));
      }
      if (dashboardStudentSearch) dashboardStudentSearch.value = '';
      if (headerStudentSearch) headerStudentSearch.value = '';
    });
  }

  const gradesStudentSearch = document.getElementById('grades-student-search') as HTMLInputElement;
  const studentSelectGrades = document.getElementById('student-select') as HTMLSelectElement;
  if (gradesStudentSearch && studentSelectGrades) {
    const doGradesSearch = debounce((searchTerm: string) => {
      filterStudentSelectOptions(studentSelectGrades, searchTerm, gradesFilterEmptyEl);
    }, LMS_SEARCH_DEBOUNCE_MS);
    gradesStudentSearch.addEventListener('input', (e) => {
      if (e.target !== gradesStudentSearch) return;
      doGradesSearch((e.target as HTMLInputElement).value.toLowerCase().trim());
    });
  }

  const attendanceStudentSearch = document.getElementById(
    'attendance-student-search'
  ) as HTMLInputElement;
  const attendanceSelectEl = document.getElementById(
    'attendance-student-select'
  ) as HTMLSelectElement;
  if (attendanceStudentSearch && attendanceSelectEl) {
    const doAttendanceSearch = debounce((searchTerm: string) => {
      filterStudentSelectOptions(attendanceSelectEl, searchTerm, attendanceFilterEmptyEl);
    }, LMS_SEARCH_DEBOUNCE_MS);
    attendanceStudentSearch.addEventListener('input', (e) => {
      if (e.target !== attendanceStudentSearch) return;
      doAttendanceSearch((e.target as HTMLInputElement).value.toLowerCase().trim());
    });
  }

  const studentProfileBtn = document.getElementById('student-profile-btn');
  if (studentProfileBtn) {
    studentProfileBtn.addEventListener('click', () => {
      const w = window as unknown as { switchToTab?: (t: string) => void };
      if (typeof w.switchToTab === 'function') {
        w.switchToTab('student-profile');
      } else {
        document.querySelectorAll('.tab-content').forEach((c) => c.classList.add('hide'));
        document.getElementById('student-profile-content')?.classList.remove('hide');
        void loadUserProfile();
      }
    });
  }

  const studentProfileSaveBtn = document.getElementById(
    'student-profile-save-btn'
  ) as HTMLButtonElement | null;
  const studentProfileSaveStatus = document.getElementById('student-profile-save-status');
  if (studentProfileSaveBtn && !studentProfileSaveWired) {
    studentProfileSaveWired = true;
    studentProfileSaveBtn.addEventListener('click', async () => {
      const nameEl = document.getElementById(
        'profile-self-display-name'
      ) as HTMLInputElement | null;
      const phoneEl = document.getElementById('profile-self-phone') as HTMLInputElement | null;
      const birthEl = document.getElementById('profile-self-birth-year') as HTMLInputElement | null;
      const memberEl = document.getElementById('profile-self-member-id') as HTMLInputElement | null;
      if (!nameEl || !phoneEl || !birthEl) return;
      if (studentProfileSaveStatus) {
        studentProfileSaveStatus.textContent = '';
        studentProfileSaveStatus.classList.remove('text-red-400', 'text-green-400');
      }
      studentProfileSaveBtn.disabled = true;
      try {
        await saveUserSelfServiceProfile({
          displayName: nameEl.value,
          phoneNumber: phoneEl.value,
          birthYearStr: birthEl.value,
          memberId: memberEl?.value ?? '',
        });
        const refreshed = await reloadCurrentUserFromFirestore();
        const u = refreshed ?? getCurrentUser();
        if (u) {
          configureUIForRole(u);
          setDashboardWelcome(u);
          const gw = window as LmsGlobalWindow;
          const sideLabel = userProfileDisplayLabel(u);
          gw.updateSidebarUserInfo?.(
            sideLabel === '—' ? u.email || '' : sideLabel,
            u.role,
            u.email || ''
          );
        }
        await loadUserProfile();
        showAppToast('Profile saved.', 'success');
      } catch (err: unknown) {
        reportClientFault(err);
        const msg = formatErrorForUserToast(err, 'Could not save your profile.');
        showAppToast(msg, 'error');
        if (studentProfileSaveStatus) {
          studentProfileSaveStatus.textContent = msg;
          studentProfileSaveStatus.classList.add('text-red-400');
        }
      } finally {
        studentProfileSaveBtn.disabled = false;
      }
    });
  }

  wireProfilePasswordUpdate();
  setupGoLiveButton();
}

function setupGoLiveButton(): void {
  const btn = document.getElementById('lms-go-live-btn') as HTMLButtonElement | null;
  if (!btn || (btn as HTMLElement & { __lmsGoLive?: boolean }).__lmsGoLive) return;
  (btn as HTMLElement & { __lmsGoLive?: boolean }).__lmsGoLive = true;

  btn.addEventListener('click', async () => {
    const role = getCurrentUserRole();
    const win = window as unknown as {
      switchToTab?: (t: string) => void;
      closeSidebar?: () => void;
    };

    if (role === 'admin') {
      win.switchToTab?.('assessments');
      win.closeSidebar?.();
      return;
    }
    if (role === 'student') {
      win.switchToTab?.('classes');
      win.closeSidebar?.();
      return;
    }
    if (role !== 'teacher') {
      showAppToast('Sign in as a teacher or administrator to use Go Live.', 'info');
      return;
    }

    const textEl = btn.querySelector('.lms-go-live-text');
    const spinEl = btn.querySelector('.lms-go-live-spinner');
    const prevLabel = (textEl?.textContent || btn.textContent || GO_LIVE_BUTTON_LABEL).trim();

    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    if (textEl && spinEl) {
      textEl.textContent = 'Saving…';
      spinEl.classList.remove('hide');
    } else {
      btn.textContent = 'Saving…';
    }

    try {
      if (attendanceRollCourses.length === 0) {
        await populateAttendanceClassSelect();
      }

      let classId = pickActiveSessionClassId(attendanceRollCourses, new Date());
      if (!classId) {
        try {
          const raw = localStorage.getItem(LMS_LAST_ATTENDANCE_CLASS_KEY);
          if (raw && attendanceRollCourses.some((c) => c.id === raw)) classId = raw;
        } catch {
          /* storage unavailable */
        }
      }
      if (!classId) {
        const sel = document.getElementById('attendance-class-select') as HTMLSelectElement | null;
        const v = sel?.value?.trim() ?? '';
        if (v && attendanceRollCourses.some((c) => c.id === v)) classId = v;
      }
      if (!classId) {
        showAppToast('No active class found. Please select a class to go live.', 'info');
        return;
      }

      const dateKey = localDateKey();
      const { count, courseName } = await markAllStudentsPresent(classId, dateKey);

      try {
        localStorage.setItem(LMS_LAST_ATTENDANCE_CLASS_KEY, classId);
      } catch {
        /* ignore */
      }

      const dateInput = document.getElementById('attendance-date') as HTMLInputElement | null;
      if (dateInput) dateInput.value = dateKey;

      const classSel = document.getElementById(
        'attendance-class-select'
      ) as HTMLSelectElement | null;
      if (classSel && attendanceRollCourses.some((c) => c.id === classId)) {
        classSel.value = classId;
        updateAttendanceClassChrome();
      }
      refreshAttendanceBulkRoster();

      const histSel = document.getElementById(
        'attendance-student-select'
      ) as HTMLSelectElement | null;
      if (histSel?.value) await loadStudentAttendance(histSel.value);

      win.closeSidebar?.();
      win.switchToTab?.('attendance');

      if (count === 0) {
        showAppToast('No enrolled students in this class to mark present.', 'info');
      } else {
        showAppToast(
          `Attendance recorded: All students marked Present for ${courseName}.`,
          'success'
        );
      }
    } catch (err: unknown) {
      reportClientFault(err);
      showAppToast(formatErrorForUserToast(err, 'Could not record attendance.'), 'error');
    } finally {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      if (textEl && spinEl) {
        textEl.textContent = prevLabel || GO_LIVE_BUTTON_LABEL;
        spinEl.classList.add('hide');
      } else {
        btn.textContent = prevLabel || GO_LIVE_BUTTON_LABEL;
      }
    }
  });
}

function getRosterStudentsForAttendance(): Student[] {
  const sel = document.getElementById('attendance-class-select') as HTMLSelectElement | null;
  const courseId = sel?.value?.trim() ?? '';
  if (!courseId) return currentStudents;
  const c = attendanceRollCourses.find((x) => x.id === courseId);
  if (!c?.studentIds?.length) return currentStudents;
  const allowed = new Set(c.studentIds);
  return currentStudents.filter((s) => allowed.has(s.id));
}

function updateAttendanceClassChrome(): void {
  const sel = document.getElementById('attendance-class-select') as HTMLSelectElement | null;
  const titleEl = document.getElementById('attendance-active-class-title');
  const metaDate = document.getElementById('attendance-meta-date');
  const dateInput = document.getElementById('attendance-date') as HTMLInputElement | null;
  if (metaDate && dateInput?.value) {
    const d = new Date(`${dateInput.value}T12:00:00`);
    metaDate.textContent = Number.isNaN(d.getTime())
      ? dateInput.value
      : d.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
  }
  const courseId = sel?.value?.trim() ?? '';
  const metaExtra = document.getElementById('attendance-meta-extra');
  if (!titleEl) return;
  if (!courseId) {
    titleEl.textContent = 'All students';
    if (metaExtra) metaExtra.textContent = '';
    return;
  }
  const c = attendanceRollCourses.find((x) => x.id === courseId);
  titleEl.textContent = c ? safeCourseChromeTitle(c) : 'Active class';
  if (metaExtra) {
    if (c) {
      const bits = [c.schedule, c.description].filter(
        (x) => typeof x === 'string' && x.trim()
      ) as string[];
      metaExtra.textContent = bits.length ? ` · ${bits.join(' · ')}` : '';
    } else {
      metaExtra.textContent = '';
    }
  }
}

async function populateAttendanceClassSelect(): Promise<void> {
  const sel = document.getElementById('attendance-class-select') as HTMLSelectElement | null;
  if (!sel) return;
  const role = getCurrentUserRole();
  try {
    if (role === 'teacher') {
      attendanceRollCourses = await fetchTeacherClasses();
    } else if (role === 'admin') {
      const snap = await getDocs(collection(db, 'courses'));
      attendanceRollCourses = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Course);
    } else {
      attendanceRollCourses = [];
    }
  } catch {
    attendanceRollCourses = [];
  }
  const prev = sel.value;
  sel.replaceChildren();
  const optAll = document.createElement('option');
  optAll.value = '';
  optAll.textContent = 'All students';
  sel.append(optAll);
  for (const c of attendanceRollCourses) {
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = safeCourseListLabel(c);
    sel.append(o);
  }
  if (prev && attendanceRollCourses.some((x) => x.id === prev)) sel.value = prev;
  updateAttendanceClassChrome();
}

// --- Dashboard data loading ---
async function initDashboard(): Promise<void> {
  const profile = getCurrentUser();
  if (
    !profile ||
    (profile.role !== 'admin' && profile.role !== 'teacher' && profile.role !== 'student')
  ) {
    return;
  }
  try {
    currentStudents = await fetchStudents();
    updateStudentSelect();
    setDashboardWelcome(getCurrentUser());
    await refreshInstitutionalDashboardMetrics();
    syncNavbarUidField();
    await Promise.all([
      loadRecentActivity(),
      loadRegisteredStudents(),
      loadRegisteredTeachers(),
      loadAllUsers(),
      populateStudentAccountDropdown(),
    ]);
    await populateAttendanceClassSelect();
    refreshAttendanceBulkRoster();
    updateAttendanceClassChrome();
  } catch (e: unknown) {
    reportClientFault(e);
  }
}

async function loadRegisteredStudents(): Promise<void> {
  const tableBody = document.getElementById('registered-students-table-body');
  if (!tableBody) return;
  try {
    const role = getCurrentUserRole();
    if (role !== 'admin' && role !== 'teacher') return;
    if (currentStudents.length === 0) {
      renderTemplate(
        tableBody,
        emptyStateTableRowHtml(
          5,
          'No learners registered yet',
          'Add a student from Registration to build your DSKM roster.',
          ''
        )
      );
      return;
    }
    const studentsRowsHtml = currentStudents
      .map((student) => {
        const memberId = escapeHtmlText((student.memberId || '').toLowerCase());
        const name = escapeHtmlText((student.name || '').toLowerCase());
        const email = escapeHtmlText((student.contactEmail || '').toLowerCase());
        return `
      <tr class="border-b border-dark-700 hover:bg-white/5 transition-colors registered-student-row" data-member-id="${memberId}" data-name="${name}" data-email="${email}">
        <td class="py-3 px-4 text-white font-semibold">${escapeHtmlText(student.memberId || 'N/A')}</td>
        <td class="py-3 px-4 text-white">${escapeHtmlText(safeStudentDisplayName(student.name))}</td>
        <td class="py-3 px-4 text-center text-dark-300">${student.yearOfBirth ?? 'N/A'}</td>
        <td class="py-3 px-4 text-dark-300 text-sm">
          ${escapeHtmlText(student.contactEmail || 'N/A')}<br>
          ${escapeHtmlText(student.contactPhone || '')}
        </td>
        <td class="py-3 px-4 text-center">
          <button type="button" data-lms-action="edit-student" data-student-id="${escapeHtmlText(student.id)}"
            class="px-3 py-1 rounded bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 transition-all text-sm mr-2">Edit</button>
          <button type="button" data-lms-action="delete-student" data-student-id="${escapeHtmlText(student.id)}"
            class="px-3 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all text-sm">Delete</button>
        </td>
      </tr>
    `;
      })
      .join('');
    renderTemplate(tableBody, studentsRowsHtml);
  } catch {
    /* registered students load error */
  }
}

async function loadRegisteredTeachers(): Promise<void> {
  const tableBody = document.getElementById('registered-teachers-table-body');
  if (!tableBody) return;
  try {
    if (getCurrentUserRole() !== 'admin') return;
    const users = await fetchAllUsers();
    const teachers = users.filter((u) => u.role === 'teacher');
    if (teachers.length === 0) {
      renderTemplate(
        tableBody,
        emptyStateTableRowHtml(
          5,
          'No teachers registered yet',
          'Register an instructor from Registration when you are ready to onboard staff.',
          ''
        )
      );
      return;
    }
    const teachersRowsHtml = teachers
      .map((t: User) => {
        const displayName = userProfileDisplayLabel(t);
        const memberId = escapeHtmlText((t.memberId || '').toLowerCase());
        const name = escapeHtmlText(displayName.toLowerCase());
        const email = escapeHtmlText((t.email || '').toLowerCase());
        return `
      <tr class="border-b border-dark-700 hover:bg-white/5 transition-colors registered-teacher-row" data-member-id="${memberId}" data-name="${name}" data-email="${email}">
        <td class="py-3 px-4 text-white font-semibold">${escapeHtmlText(t.memberId || 'N/A')}</td>
        <td class="py-3 px-4 text-white">${escapeHtmlText(displayName === '—' ? t.email || 'N/A' : displayName)}</td>
        <td class="py-3 px-4 text-center text-dark-300">${t.yearOfBirth ?? 'N/A'}</td>
        <td class="py-3 px-4 text-dark-300 text-sm">
          ${escapeHtmlText(t.email || 'N/A')}<br>${escapeHtmlText(t.phone || t.phoneNumber || '')}
        </td>
        <td class="py-3 px-4 text-center">
          <button type="button" data-lms-action="delete-teacher" data-user-id="${escapeHtmlText(t.uid)}"
            class="px-3 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all text-sm">Delete</button>
        </td>
      </tr>
    `;
      })
      .join('');
    renderTemplate(tableBody, teachersRowsHtml);
  } catch {
    /* teacher load error */
  }
}

async function loadAllUsers(): Promise<void> {
  const tableBody = document.getElementById('users-table-body');
  if (!tableBody) return;
  try {
    if (getCurrentUserRole() !== 'admin') return;
    renderTemplate(
      tableBody,
      '<tr><td colspan="4" class="text-center py-8 text-dark-300"><div class="loading-spinner mx-auto mb-2"></div>Loading users...</td></tr>'
    );
    const users = await fetchAllUsers();
    if (users.length === 0) {
      renderTemplate(
        tableBody,
        emptyStateTableRowHtml(
          4,
          'No accounts in the directory',
          'User records will appear here as administrators, teachers, and learners are provisioned.',
          ''
        )
      );
      return;
    }
    const getRoleBadgeClass = (role: string) => {
      switch (role) {
        case 'admin':
          return 'bg-red-500/20 text-red-400';
        case 'teacher':
          return 'bg-blue-500/20 text-blue-400';
        case 'student':
          return 'bg-green-500/20 text-green-400';
        default:
          return 'bg-gray-500/20 text-gray-400';
      }
    };
    const usersRowsHtml = users
      .map((user: User) => {
        const accountLabel = userProfileDisplayLabel(user);
        const emailAttr = escapeHtmlText((user.email || '').toLowerCase());
        const nameAttr = escapeHtmlText(accountLabel.toLowerCase());
        const uidAttr = escapeHtmlText(user.uid);
        const roleAttr = escapeHtmlText(user.role);
        const roleLabel = escapeHtmlText(user.role.charAt(0).toUpperCase() + user.role.slice(1));
        return `
      <tr class="border-b border-dark-700 hover:bg-white/5 transition-colors user-management-row" data-email="${emailAttr}" data-name="${nameAttr}">
        <td class="py-3 px-4 text-white">${escapeHtmlText(user.email)}</td>
        <td class="py-3 px-4 text-center">
          <span class="px-3 py-1 rounded-full text-xs font-semibold ${getRoleBadgeClass(user.role)}">
            ${roleLabel}
          </span>
        </td>
        <td class="py-3 px-4 text-center text-dark-300 text-sm">${escapeHtmlText(accountLabel)}</td>
        <td class="py-3 px-4 text-center">
          <button type="button" data-lms-action="change-role" data-user-id="${uidAttr}" data-user-role="${roleAttr}"
            class="px-3 py-1 rounded bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 transition-all text-sm">Change Role</button>
        </td>
      </tr>
    `;
      })
      .join('');
    renderTemplate(tableBody, usersRowsHtml);
  } catch (error: unknown) {
    if (tableBody) {
      renderTemplate(
        tableBody,
        '<tr><td colspan="4" class="text-center py-8 text-dark-300">Could not load the user list. Use Refresh or try again shortly.</td></tr>'
      );
    }
    showAppToast(formatErrorForUserToast(error, 'Could not load users.'), 'error');
  }
}

function filterAccountDropdownList(listEl: Element, query: string): void {
  const items = listEl.querySelectorAll('[data-uid]');
  items.forEach((el) => {
    const email = (el.getAttribute('data-email') || '').toLowerCase();
    const name = (el.getAttribute('data-name') || '').toLowerCase();
    const text = (el.textContent || '').toLowerCase();
    const show = !query || email.includes(query) || name.includes(query) || text.includes(query);
    (el as HTMLElement).style.display = show ? '' : 'none';
  });
}

function setupAccountDropdown(
  containerId: string,
  hiddenInputId: string,
  populateCallback: () => Promise<void>
): void {
  const container = document.getElementById(containerId);
  if (!container) return;
  const trigger = container.querySelector('.account-dropdown-trigger');
  const panel = container.querySelector('.account-dropdown-panel');
  const searchInput = container.querySelector(
    '.account-dropdown-search'
  ) as HTMLInputElement | null;
  const listEl = container.querySelector('.account-dropdown-list');
  const valueEl = container.querySelector('.account-dropdown-value');
  const hiddenInput = document.getElementById(hiddenInputId) as HTMLInputElement;
  if (!trigger || !panel || !listEl || !valueEl || !hiddenInput) return;
  const triggerEl = trigger;
  const panelEl = panel;
  const listElRef = listEl;

  function open(): void {
    panelEl.classList.remove('hide');
    triggerEl.setAttribute('aria-expanded', 'true');
    if (searchInput) {
      searchInput.value = '';
      filterAccountDropdownList(listElRef, '');
      setTimeout(() => searchInput.focus(), 0);
    }
  }
  function close(): void {
    panelEl.classList.add('hide');
    triggerEl.setAttribute('aria-expanded', 'false');
  }

  triggerEl.addEventListener('click', () => {
    if (panelEl.classList.contains('hide')) open();
    else close();
  });
  triggerEl.addEventListener('keydown', (e: Event) => {
    const ke = e as KeyboardEvent;
    if (ke.key === 'Enter' || ke.key === ' ') {
      e.preventDefault();
      if (panelEl.classList.contains('hide')) open();
      else close();
    }
  });
  if (searchInput) {
    const runDropdownSearch = debounce((q: string) => {
      filterAccountDropdownList(listElRef, q);
    }, LMS_SEARCH_DEBOUNCE_MS);
    searchInput.addEventListener('input', () => {
      runDropdownSearch((searchInput.value || '').toLowerCase().trim());
    });
    searchInput.addEventListener('keydown', (e: Event) => {
      if ((e as KeyboardEvent).key === 'Escape') close();
    });
  }
  listEl.addEventListener('click', (e) => {
    const opt = (e.target as HTMLElement).closest('[data-uid]');
    if (!opt) return;
    const uid = opt.getAttribute('data-uid');
    const label = opt.textContent || '-- Select Registered Account --';
    hiddenInput.value = uid || '';
    valueEl.textContent = label;
    close();
  });
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target as Node)) close();
  });

  populateCallback();
}

async function populateStudentAccountDropdown(): Promise<void> {
  const container = document.getElementById('student-account-dropdown');
  if (!container) return;
  const listEl = container.querySelector('.account-dropdown-list');
  const valueEl = container.querySelector('.account-dropdown-value');
  const searchInput = container.querySelector('.account-dropdown-search') as HTMLInputElement;
  const finalUidInput = document.getElementById('final-student-uid') as HTMLInputElement;
  if (!listEl || !valueEl || !finalUidInput) return;
  try {
    const role = getCurrentUserRole();
    if (role !== 'admin' && role !== 'teacher') return;
    let users = await fetchAllUsers();
    if (role === 'teacher') users = users.filter((u) => u.role === 'student');
    users.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
    listEl.replaceChildren();
    users.forEach((user: User) => {
      const label = userProfileDisplayLabel(user);
      const displayText = `${label} · ${user.role}`;
      const opt = document.createElement('div');
      opt.setAttribute('role', 'option');
      opt.setAttribute('data-uid', user.uid);
      opt.setAttribute('data-email', (user.email || '').toLowerCase());
      opt.setAttribute('data-name', (user.name || user.displayName || '').toLowerCase());
      opt.textContent = displayText;
      opt.className = 'px-4 py-2 cursor-pointer hover:bg-dark-700 text-white text-sm';
      listEl.appendChild(opt);
    });
    if (searchInput) {
      const q = (searchInput.value || '').toLowerCase().trim();
      filterAccountDropdownList(listEl, q);
    }
  } catch {
    listEl.replaceChildren();
    const msg = document.createElement('div');
    msg.className = 'px-4 py-3 text-dark-400 text-sm';
    msg.textContent =
      'Could not load registered accounts. Use manual UID entry below, or open Refresh and try again.';
    listEl.appendChild(msg);
  }
}

async function populateTeacherAccountDropdown(): Promise<void> {
  const container = document.getElementById('teacher-account-dropdown');
  if (!container) return;
  const listEl = container.querySelector('.account-dropdown-list');
  const searchInput = container.querySelector('.account-dropdown-search') as HTMLInputElement;
  if (!listEl) return;
  try {
    if (getCurrentUserRole() !== 'admin') return;
    const users = await fetchAllUsers();
    users.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
    listEl.replaceChildren();
    users.forEach((user: User) => {
      const label = userProfileDisplayLabel(user);
      const displayText = `${label} · ${user.role}`;
      const opt = document.createElement('div');
      opt.setAttribute('role', 'option');
      opt.setAttribute('data-uid', user.uid);
      opt.setAttribute('data-email', (user.email || '').toLowerCase());
      opt.setAttribute('data-name', (user.name || user.displayName || '').toLowerCase());
      opt.textContent = displayText;
      opt.className = 'px-4 py-2 cursor-pointer hover:bg-dark-700 text-white text-sm';
      listEl.appendChild(opt);
    });
    if (searchInput) {
      const q = (searchInput.value || '').toLowerCase().trim();
      filterAccountDropdownList(listEl, q);
    }
  } catch {
    listEl.replaceChildren();
    const msg = document.createElement('div');
    msg.className = 'px-4 py-3 text-dark-400 text-sm';
    msg.textContent = 'Could not load teacher accounts. Use manual UID entry below.';
    listEl.appendChild(msg);
  }
}

function filterStudentSelectOptions(
  selectEl: HTMLSelectElement,
  searchTerm: string,
  emptyHintEl?: HTMLElement | null
): void {
  const q = searchTerm.toLowerCase();
  const options = selectEl.querySelectorAll('option');
  let visible = 0;
  options.forEach((option) => {
    if (option.value === '') return;
    const name = option.getAttribute('data-name') || '';
    const email = option.getAttribute('data-email') || '';
    const memberId = option.getAttribute('data-member-id') || '';
    const text = option.textContent?.toLowerCase() || '';
    const show =
      !q || name.includes(q) || email.includes(q) || memberId.includes(q) || text.includes(q);
    option.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  if (emptyHintEl) {
    if (searchTerm.trim() && visible === 0) {
      emptyHintEl.textContent =
        'No learners match this search. Try another name or clear the filter.';
      emptyHintEl.classList.remove('hidden');
    } else {
      emptyHintEl.textContent = '';
      emptyHintEl.classList.add('hidden');
    }
  }
}

// --- Student dropdowns (registration, dashboard, attendance) ---
function updateStudentSelect(): void {
  const studentSelect = document.getElementById('student-select') as HTMLSelectElement | null;
  const attendanceStudentSelect = document.getElementById(
    'attendance-student-select'
  ) as HTMLSelectElement;
  const dashboardStudentSelect = document.getElementById(
    'dashboard-student-select'
  ) as HTMLSelectElement;

  const fillStudentSelect = (sel: HTMLSelectElement): void => {
    sel.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '-- Select a student --';
    sel.appendChild(placeholder);
    currentStudents.forEach((student) => {
      const option = document.createElement('option');
      const label = safeStudentDisplayName(student.name);
      option.value = student.id;
      option.textContent = label + (student.memberId ? ` (ID: ${student.memberId})` : '');
      option.setAttribute('data-name', label.toLowerCase());
      option.setAttribute('data-email', (student.contactEmail || '').toLowerCase());
      option.setAttribute('data-member-id', (student.memberId || '').toLowerCase());
      sel.appendChild(option);
    });
  };

  if (studentSelect) {
    fillStudentSelect(studentSelect);
    filterStudentSelectOptions(
      studentSelect,
      '',
      document.getElementById('grades-student-filter-empty')
    );
  }
  if (attendanceStudentSelect) fillStudentSelect(attendanceStudentSelect);
  if (dashboardStudentSelect) fillStudentSelect(dashboardStudentSelect);
  if (attendanceStudentSelect) {
    filterStudentSelectOptions(
      attendanceStudentSelect,
      '',
      document.getElementById('attendance-student-filter-empty')
    );
  }
  if (dashboardStudentSelect) {
    filterStudentSelectOptions(
      dashboardStudentSelect,
      '',
      document.getElementById('dashboard-student-filter-empty')
    );
  }
  refreshAttendanceBulkRoster();

  const userRole = getCurrentUserRole();
  if (userRole === 'student' && currentStudents.length === 1) {
    const ownRecord = currentStudents[0];
    selectedStudentId = ownRecord.id;
    if (studentSelect) {
      studentSelect.value = ownRecord.id;
      studentSelect.disabled = true;
    }
    if (attendanceStudentSelect) {
      attendanceStudentSelect.value = ownRecord.id;
      attendanceStudentSelect.disabled = true;
    }
    loadStudentGrades(ownRecord.id);
    loadStudentAttendance(ownRecord.id);
  } else {
    if (studentSelect) studentSelect.disabled = false;
    if (attendanceStudentSelect) attendanceStudentSelect.disabled = false;
  }
}

// --- Grades: load, display, charts; delete handlers ---
function showGradesSkeletonLoading(): void {
  const gradesTableBody = document.getElementById('grades-table-body');
  const chartsSection = document.getElementById('grade-charts-section');
  if (gradesTableBody) {
    const row =
      '<tr class="border-b border-dark-700"><td class="py-3 px-4"><div class="skeleton skeleton-text !w-[70%]"></div></td><td class="py-3 px-4"><div class="skeleton skeleton-text short"></div></td><td class="py-3 px-4"><div class="skeleton skeleton-text short mx-auto"></div></td><td class="py-3 px-4"><div class="skeleton skeleton-text short mx-auto"></div></td></tr>';
    renderTemplate(gradesTableBody, row.repeat(5));
  }
  chartsSection?.classList.add('hide');
}

async function loadStudentGrades(studentId: string): Promise<void> {
  try {
    const sessionUser = getCurrentUser();
    if (sessionUser?.role === 'student' && sessionUser.uid) {
      const ownProfileId =
        sessionUser.studentProfile?.id ??
        (currentStudents.length === 1 ? currentStudents[0].id : null);
      if (!ownProfileId || studentId !== ownProfileId) {
        displayGrades([]);
        return;
      }
    }
    showGradesSkeletonLoading();
    await assertLearnerMayAccessStudentProfile(studentId);
    if (gradesUnsubscribe) gradesUnsubscribe();
    gradesUnsubscribe = listenToGrades(studentId, (grades) => {
      currentGrades = grades;
      displayGrades(grades);
      loadRecentActivity();
      const u = getCurrentUser();
      if (getCurrentUserRole() === 'student' && u) {
        seedStudentGpaSessionCache(u.uid, grades);
        const gpa = computeCumulativeGpaFromGrades(grades);
        renderStudentGpaMetricReplaceChildren(gpa, grades);
        updateStudentMobileGpaBentoFromMetrics(gpa, grades);
      }
    });
  } catch (e) {
    reportClientFault(e);
    if (isFirebasePermissionDenied(e)) {
      notifyGradesFirestoreAccessDenied();
    } else {
      displayGrades([]);
    }
  }
}

function displayGrades(grades: Grade[]): void {
  const gradesTableBody = document.getElementById('grades-table-body')!;
  const chartsSection = document.getElementById('grade-charts-section');

  const userRole = getCurrentUserRole();
  const showActions = userRole === 'teacher' || userRole === 'admin';

  if (grades.length === 0) {
    const colspan = showActions && selectedStudentId ? 5 : 4;
    let title: string;
    let subtitle: string;
    let ctaHtml = '';
    if (!selectedStudentId) {
      title = 'Select a student';
      subtitle = 'Choose someone from the roster to view or enter grades.';
      ctaHtml = `<button type="button" id="grades-empty-focus-student-select" class="px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-colors">Open student picker</button>`;
    } else if (userRole === 'student') {
      title = 'No grades posted yet';
      subtitle = 'Scores will appear here when your instructors publish them.';
    } else {
      title = 'No grades recorded yet';
      subtitle = 'Add an entry for this learner, or check back after the next assessment.';
      ctaHtml = `<button type="button" id="grades-empty-focus-add-grade" class="px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-colors">Add grade</button>`;
    }
    renderTemplate(gradesTableBody, emptyStateTableRowHtml(colspan, title, subtitle, ctaHtml));
    document.getElementById('grades-empty-focus-student-select')?.addEventListener('click', () => {
      document.getElementById('student-select')?.focus();
    });
    document.getElementById('grades-empty-focus-add-grade')?.addEventListener('click', () => {
      document
        .getElementById('grade-entry-section')
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    chartsSection?.classList.add('hide');
    renderGradesMobile(grades, selectedStudentId, userRole);
    return;
  }
  chartsSection?.classList.remove('hide');

  const gradesRowsHtml = grades
    .map((grade) => {
      const pct = gradePercent100(grade);
      const percentage = pct == null ? '—' : pct.toFixed(1);
      const percentageClass =
        pct == null ? 'text-dark-400' : pct >= 70 ? 'text-green-400' : 'text-red-400';
      return `
      <tr class="border-b border-dark-700 hover:bg-white/5 transition-colors">
        <td class="py-3 px-4 text-white">${escapeHtmlText(safeAssignmentTitle(grade.assignmentName))}</td>
        <td class="py-3 px-4 text-dark-300">${escapeHtmlText(grade.category)}</td>
        <td class="py-3 px-4 text-center text-white">${escapeHtmlText(String(grade.score))} / ${escapeHtmlText(String(grade.totalPoints))}</td>
        <td class="py-3 px-4 text-center font-semibold ${percentageClass}">${percentage}${pct == null ? '' : '%'}</td>
        ${showActions && selectedStudentId ? `<td class="py-3 px-4 text-center"><button type="button" data-lms-action="delete-grade" data-student-id="${escapeHtmlText(selectedStudentId)}" data-grade-id="${escapeHtmlText(grade.id)}" class="px-3 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all text-sm">Delete</button></td>` : ''}
      </tr>`;
    })
    .join('');
  renderTemplate(gradesTableBody, gradesRowsHtml);

  renderGradeCharts(grades);
  renderGradesMobile(grades, selectedStudentId, getCurrentUserRole());
}

let gradeTrendChart: AnyChartInstance | null = null;
let categoryChart: AnyChartInstance | null = null;

function isAppLightTheme(): boolean {
  return getAppTheme() === 'light';
}

/** Builds Chart.js scale options for the current `data-theme` (light vs dark surfaces). */
function getGradeChartOptions(): Record<string, unknown> {
  const light = isAppLightTheme();
  const scales = light
    ? {
        x: {
          grid: { color: 'rgba(15, 23, 42, 0.08)' },
          ticks: { color: '#475569', maxRotation: 45, minRotation: 0, padding: 6 },
        },
        y: {
          beginAtZero: true,
          max: 100,
          grid: { color: 'rgba(15, 23, 42, 0.08)' },
          ticks: { color: '#475569', padding: 10, callback: (v: number) => v + '%' },
        },
      }
    : {
        x: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: 'rgba(255,255,255,0.6)', maxRotation: 45, minRotation: 0, padding: 6 },
        },
        y: {
          beginAtZero: true,
          max: 100,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: 'rgba(255,255,255,0.6)', padding: 10, callback: (v: number) => v + '%' },
        },
      };
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    layout: {
      padding: light
        ? { left: 6, right: 14, top: 12, bottom: 10 }
        : { left: 4, right: 12, top: 10, bottom: 8 },
    },
    plugins: { legend: { display: false } },
    scales,
  };
}

/**
 * Renders or updates grade trend and category charts. Destroys existing Chart instances first to avoid leaks.
 */
function renderGradeCharts(grades: Grade[]): void {
  // #region agent log
  agentDebugLog({
    sessionId: 'ecf1fb',
    hypothesisId: 'C',
    runId: 'pre',
    location: 'main.ts:renderGradeCharts',
    message: 'renderGradeCharts entry',
    data: {
      theme: getAppTheme(),
      gradeCount: grades.length,
      hasTrendCanvas: !!document.getElementById('grade-trend-chart'),
      hasCategoryCanvas: !!document.getElementById('category-chart'),
    },
  });
  // #endregion
  const sortedGrades = [...grades].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const trendLabels = sortedGrades.map((g) => {
    const nm = safeAssignmentTitle(g.assignmentName);
    return nm.length > 12 ? `${nm.slice(0, 12)}…` : nm;
  });
  const trendData = sortedGrades.map((g) => {
    const p = gradePercent100(g);
    return p == null ? null : Number(p.toFixed(1));
  });

  const categoryData: Record<string, { total: number; count: number }> = {};
  for (const grade of grades) {
    const p = gradePercent100(grade);
    if (p == null) continue;
    const cat = grade.category;
    if (!categoryData[cat]) categoryData[cat] = { total: 0, count: 0 };
    categoryData[cat].total += p;
    categoryData[cat].count += 1;
  }
  const categoryLabels = Object.keys(categoryData);
  const categoryAverages = categoryLabels.map((cat) => {
    const { total, count } = categoryData[cat];
    const avg = count > 0 ? total / count : 0;
    return Number.isFinite(avg) ? avg.toFixed(1) : '0';
  });
  const categoryColors = ['#06b6d4', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#3b82f6'];

  const chartOptions = getGradeChartOptions() as ChartConfiguration<'line' | 'bar'>['options'];
  const light = isAppLightTheme();
  const pointBorder = light ? '#0f172a' : '#ffffff';

  const trendCanvas = document.getElementById('grade-trend-chart') as HTMLCanvasElement;
  if (trendCanvas) {
    if (gradeTrendChart) {
      gradeTrendChart.destroy();
      gradeTrendChart = null;
    }
    const ctx = trendCanvas.getContext('2d');
    if (ctx) {
      try {
        gradeTrendChart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: trendLabels,
            datasets: [
              {
                label: 'Grade %',
                data: trendData,
                borderColor: '#06b6d4',
                backgroundColor: 'rgba(6,182,212,0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#06b6d4',
                pointBorderColor: pointBorder,
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
              },
            ],
          },
          options: chartOptions,
        });
      } catch {
        gradeTrendChart = null;
      }
    }
  }

  const categoryCanvas = document.getElementById('category-chart') as HTMLCanvasElement;
  if (categoryCanvas) {
    if (categoryChart) {
      categoryChart.destroy();
      categoryChart = null;
    }
    const ctx = categoryCanvas.getContext('2d');
    if (ctx) {
      try {
        categoryChart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: categoryLabels,
            datasets: [
              {
                label: 'Average %',
                data: categoryAverages,
                backgroundColor: categoryLabels.map(
                  (_, i) => categoryColors[i % categoryColors.length]
                ),
                borderRadius: 8,
                barThickness: 40,
              },
            ],
          },
          options: {
            ...chartOptions,
            plugins: {
              ...chartOptions?.plugins,
              tooltip: {
                callbacks: {
                  label: (ctx: TooltipItem<'bar'>) =>
                    `Average: ${ctx.formattedValue ?? (ctx.raw == null ? '' : String(ctx.raw))}%`,
                },
              },
            },
          },
        });
      } catch {
        categoryChart = null;
      }
    }
  }
}

const lmsWin = window as LmsGlobalWindow;

lmsWin.handleDeleteGrade = async (studentId: string, gradeId: string) => {
  if (!confirm('Are you sure you want to delete this grade?')) return;
  try {
    await deleteGrade(studentId, gradeId);
  } catch (error: unknown) {
    showAppToast(formatErrorForUserToast(error, 'Could not delete the grade.'), 'error');
  }
};

lmsWin.handleDeleteStudent = async (studentId: string) => {
  if (
    !confirm(
      'Are you sure you want to delete this student? This will also delete all their grades and attendance records.'
    )
  )
    return;
  try {
    await deleteStudent(studentId);
    await initDashboard();
    showAppToast('Student deleted successfully.', 'success');
  } catch (error: unknown) {
    showAppToast(formatErrorForUserToast(error, 'Could not delete this student.'), 'error');
  }
};

lmsWin.handleEditStudent = (studentId: string) => {
  const student = currentStudents.find((s) => s.id === studentId);
  if (!student) return;
  const modal = document.getElementById('edit-student-modal');
  const idEl = document.getElementById('edit-student-id') as HTMLInputElement;
  const nameEl = document.getElementById('edit-student-name') as HTMLInputElement;
  const memberIdEl = document.getElementById('edit-student-memberId') as HTMLInputElement;
  const yearEl = document.getElementById('edit-student-yearOfBirth') as HTMLInputElement;
  const phoneEl = document.getElementById('edit-student-contactPhone') as HTMLInputElement;
  const emailEl = document.getElementById('edit-student-contactEmail') as HTMLInputElement;
  const notesEl = document.getElementById('edit-student-notes') as HTMLInputElement;
  if (!modal || !idEl || !nameEl) return;
  idEl.value = studentId;
  nameEl.value = student.name;
  memberIdEl.value = student.memberId || '';
  yearEl.value = String(student.yearOfBirth ?? '');
  phoneEl.value = student.contactPhone || '';
  emailEl.value = student.contactEmail || '';
  notesEl.value = student.notes || '';
  modal.classList.remove('hide');
};

lmsWin.handleDeleteTeacher = async (userId: string) => {
  if (!confirm('Remove this teacher? Their role will be set back to student.')) return;
  try {
    showLoading();
    await updateUserRoleDirect(userId, 'student');
    await loadRegisteredTeachers();
    hideLoading();
    showAppToast('Teacher removed (role set to student).', 'success');
  } catch (err: unknown) {
    hideLoading();
    showAppToast(formatErrorForUserToast(err, 'Could not remove this teacher.'), 'error');
  }
};

lmsWin.handleChangeRole = async (userId: string, currentRole: string) => {
  const newRole = prompt(
    `Change role for this user.\n\nCurrent role: ${currentRole}\n\nEnter new role (admin, teacher, or student):`,
    currentRole
  );
  if (!newRole) return;
  const roleNormalized = newRole.trim().toLowerCase();
  if (!['admin', 'teacher', 'student'].includes(roleNormalized)) {
    showAppToast('Invalid role. Must be: admin, teacher, or student.', 'info');
    return;
  }
  if (roleNormalized === currentRole) {
    showAppToast('No change — same role.', 'info');
    return;
  }
  try {
    showLoading();
    await updateUserRoleDirect(userId, roleNormalized as 'admin' | 'teacher' | 'student');
    await loadAllUsers();
    showAppToast(`User role changed to ${roleNormalized}.`, 'success');
  } catch (error: unknown) {
    showAppToast(formatErrorForUserToast(error, "Could not change this user's role."), 'error');
  } finally {
    hideLoading();
  }
};

// --- Dashboard stats & recent activity ---
type InstitutionalSnapshot =
  | { role: 'student' }
  | {
      role: 'admin';
      enrollment: number;
      systemAvg: string;
      assignmentCount: number;
    }
  | {
      role: 'teacher';
      /** Number of course shells assigned to this teacher. */
      myClasses: number;
      gradingQueue: number;
      rows: TeacherAssessmentDashboardRow[];
      queueRows: TeacherGradingQueueRow[];
    };

let institutionalSnapshot: InstitutionalSnapshot = { role: 'student' };

const ETHIOPIAN_ORTHODOX_PROVERBS = [
  'Patience is a tree whose root is bitter, but its fruit is very sweet.',
  'Do not forget the small, and do not fear the big.',
  'One who has a teacher is a child; one who has no teacher is an old man.',
] as const;

let dashboardProverbRotateTimer: number | null = null;

function letterGradeFromPercent(pct: number): string {
  if (!Number.isFinite(pct)) return '—';
  if (pct >= 93) return 'A';
  if (pct >= 90) return 'A-';
  if (pct >= 87) return 'B+';
  if (pct >= 83) return 'B';
  if (pct >= 80) return 'B-';
  if (pct >= 77) return 'C+';
  if (pct >= 73) return 'C';
  if (pct >= 70) return 'C-';
  if (pct >= 67) return 'D+';
  if (pct >= 63) return 'D';
  return 'F';
}

function formatAssessmentDueMobileLabel(dueDateTime: string): string {
  const ms = Date.parse(dueDateTime);
  if (!Number.isFinite(ms)) return 'No due date on file';
  const now = Date.now();
  const diff = ms - now;
  const dayMs = 24 * 60 * 60 * 1000;
  if (diff < 0) {
    const hours = Math.round(Math.abs(diff) / (60 * 60 * 1000));
    if (hours < 48) return `${hours}h ago`;
    const days = Math.round(Math.abs(diff) / dayMs);
    return `${days}d ago`;
  }
  const days = Math.round(diff / dayMs);
  if (days <= 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

function setDashboardProverbText(text: string): void {
  document.querySelectorAll('[data-lms-dashboard-proverb]').forEach((n) => {
    n.textContent = text;
  });
}

function startDashboardProverbRotation(): void {
  const nodes = document.querySelectorAll('[data-lms-dashboard-proverb]');
  if (nodes.length === 0) return;
  let i = 0;
  setDashboardProverbText(ETHIOPIAN_ORTHODOX_PROVERBS[i]);
  if (dashboardProverbRotateTimer != null) window.clearInterval(dashboardProverbRotateTimer);
  dashboardProverbRotateTimer = window.setInterval(() => {
    i = (i + 1) % ETHIOPIAN_ORTHODOX_PROVERBS.length;
    setDashboardProverbText(ETHIOPIAN_ORTHODOX_PROVERBS[i]);
  }, 12000);
}

function stopDashboardProverbRotation(): void {
  if (dashboardProverbRotateTimer != null) {
    window.clearInterval(dashboardProverbRotateTimer);
    dashboardProverbRotateTimer = null;
  }
}

function updateStudentMobileGpaBentoFromMetrics(gpa: number | null, grades: Grade[]): void {
  const root = document.getElementById('dashboard-mobile-student-gpa-root');
  if (!root || getCurrentUserRole() !== 'student') return;

  const sorted = [...grades].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const last = sorted[0];
  let lastLine = '—';
  if (last) {
    const p = gradePercent100(last);
    const letter = p == null ? '—' : letterGradeFromPercent(p);
    lastLine = `${letter} · ${safeAssignmentTitle(last.assignmentName)}`;
  }

  const pres = getStudentGpaPresentation(gpa, grades);

  const wrap = document.createElement('div');
  wrap.className =
    'rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/95 dark:bg-dark-900/80 p-5 shadow-lg shadow-slate-200/50 dark:shadow-black/20';

  const top = document.createElement('div');
  top.className = 'flex flex-wrap items-start justify-between gap-3 mb-4';

  const left = document.createElement('div');
  const lab = document.createElement('p');
  lab.className =
    'text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-primary-800 dark:text-primary-300/90';
  lab.textContent = 'Recent grades';
  const sub = document.createElement('p');
  sub.className = 'text-xs text-on-surface-muted mt-1 uppercase tracking-wider';
  sub.textContent = 'Overall GPA';
  left.append(lab, sub);
  if (pres.showNewLearnerBadge) {
    const nb = document.createElement('p');
    nb.className =
      'text-[0.6rem] font-semibold uppercase tracking-wider text-on-surface-muted mt-1.5';
    nb.textContent = 'New learner';
    left.append(nb);
  }

  const right = document.createElement('div');
  right.className = 'text-right min-w-0 max-w-[55%]';
  const lg = document.createElement('p');
  lg.className = 'text-[0.6rem] font-semibold uppercase tracking-wider text-on-surface-muted';
  lg.textContent = 'Last grade';
  const lv = document.createElement('p');
  lv.className = 'text-sm font-semibold text-on-surface leading-snug break-words';
  lv.textContent = lastLine;
  right.append(lg, lv);

  top.append(left, right);

  const gpaEl = document.createElement('p');
  gpaEl.className =
    'text-4xl font-bold text-on-surface font-display tabular-nums tracking-tight mb-4';
  gpaEl.textContent = pres.numericDisplay;
  gpaEl.setAttribute('aria-label', pres.ariaLabel);

  const barTrack = document.createElement('div');
  barTrack.className = 'h-2 rounded-full bg-slate-200 dark:bg-dark-700 overflow-hidden';
  const barFill = document.createElement('div');
  barFill.className =
    'h-full rounded-full bg-gradient-to-r from-primary-500 to-primary-300 transition-all duration-500';
  barFill.style.width = `${pres.barFillPct}%`;
  barTrack.appendChild(barFill);

  wrap.append(top, gpaEl, barTrack);
  root.replaceChildren(wrap);
}

function gradePercent100(g: Grade): number | null {
  const tp = Number(g.totalPoints);
  const sc = Number(g.score);
  if (!Number.isFinite(tp) || tp <= 0 || !Number.isFinite(sc)) return null;
  const p = (sc / tp) * 100;
  return Number.isFinite(p) ? p : null;
}

function computeAverageGradePercent(grades: Grade[]): { pctLabel: string; count: number } {
  const pcts = grades
    .map(gradePercent100)
    .filter((p): p is number => p != null && Number.isFinite(p));
  if (pcts.length === 0) return { pctLabel: '—', count: 0 };
  const sum = pcts.reduce((acc, p) => acc + p, 0);
  const avgPercentage = sum / pcts.length;
  return {
    pctLabel: Number.isFinite(avgPercentage) ? `${avgPercentage.toFixed(1)}%` : '—',
    count: pcts.length,
  };
}

function adminKpiSvg(kind: 'users' | 'chart' | 'book'): string {
  if (kind === 'users') {
    return `<svg class="w-6 h-6 text-primary-800 dark:text-primary-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>`;
  }
  if (kind === 'chart') {
    return `<svg class="w-6 h-6 text-secondary-800 dark:text-secondary-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>`;
  }
  return `<svg class="w-6 h-6 text-primary-800 dark:text-primary-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>`;
}

function buildAdminInstitutionalHtml(
  snapshot: Extract<InstitutionalSnapshot, { role: 'admin' }>
): string {
  const countNote =
    snapshot.assignmentCount > 0
      ? `Across <span class="text-primary-700 dark:text-primary-300 font-medium">${snapshot.assignmentCount}</span> graded item${snapshot.assignmentCount === 1 ? '' : 's'}`
      : 'Awaiting grade book entries';
  const firstDayNote =
    snapshot.enrollment === 0
      ? `<p class="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-on-surface-subtle mb-3">DSKM LMS</p><p class="text-sm text-on-surface-muted max-w-xl mb-6">Welcome to your first day — add learners under Registration and publish classes so enrollment and GPA insights can grow here.</p>`
      : '';
  const bento =
    'rounded-2xl border-surface-default bg-surface-container p-6 shadow-sm shadow-slate-200/30 dark:shadow-none min-h-[7.5rem]';
  return `${firstDayNote}<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
<div class="${bento}"><div class="flex items-start justify-between gap-2 mb-3"><div class="p-2.5 rounded-xl bg-primary-500/15">${adminKpiSvg('users')}</div></div><p class="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-on-surface-subtle">Total enrollment</p><p class="text-3xl font-bold text-on-surface font-display tabular-nums mt-1">${snapshot.enrollment}</p><p class="text-xs text-on-surface-muted mt-2">Active learner profiles</p></div>
<div class="${bento}"><div class="flex items-start justify-between gap-2 mb-3"><div class="p-2.5 rounded-xl bg-secondary-500/15">${adminKpiSvg('chart')}</div></div><p class="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-on-surface-subtle">GPA average</p><p class="text-3xl font-bold text-on-surface font-display tabular-nums mt-1">${escapeHtmlText(snapshot.systemAvg)}</p><p class="text-xs text-on-surface-muted mt-2">${countNote}</p></div>
</div>`;
}

function buildTeacherInstitutionalHtml(
  snapshot: Extract<InstitutionalSnapshot, { role: 'teacher' }>
): string {
  const firstDayNote =
    snapshot.myClasses === 0 && snapshot.gradingQueue === 0
      ? `<p class="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-on-surface-subtle mb-3">DSKM LMS</p><p class="text-sm text-on-surface-muted max-w-xl mb-6">Your workspace is ready — create a class from the Classes tab and invite learners so attendance, grades, and the grading queue come alive.</p>`
      : '';
  const tableRows =
    snapshot.rows.length === 0
      ? `<tr><td colspan="4" class="py-10 px-4 text-center">
<p class="text-on-surface-muted text-sm mb-4">No assessments yet. Create or publish an assessment to see submission analytics here.</p>
<button type="button" data-lms-action="dashboard-open-assessments" class="px-4 py-2 rounded-xl text-sm font-semibold bg-primary-500/15 text-primary-900 dark:text-primary-200 border border-primary-400/35 hover:bg-primary-500/25 transition-colors">Open assessments</button>
</td></tr>`
      : snapshot.rows
          .map((r) => {
            const avg =
              r.avgPercent == null || !Number.isFinite(r.avgPercent)
                ? '—'
                : `${finiteToFixed(r.avgPercent, 1)}%`;
            return `<tr class="border-b border-slate-200/90 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
<td class="py-3 px-4 font-medium text-on-surface min-w-[8rem]">${escapeHtmlText(r.title)}</td>
<td class="py-3 px-4 text-on-surface-muted">${escapeHtmlText(safeCourseDisplayName(r.courseName))}</td>
<td class="py-3 px-4 text-on-surface tabular-nums">${r.submissionCount}</td>
<td class="py-3 px-4 text-primary-800 dark:text-primary-300 tabular-nums font-medium">${avg}</td>
</tr>`;
          })
          .join('');
  const bento =
    'rounded-2xl border-surface-default bg-surface-container p-6 shadow-sm shadow-slate-200/30 dark:shadow-none min-h-[7.5rem]';
  return `${firstDayNote}<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
<div class="${bento}"><div class="flex items-start justify-between gap-2 mb-3"><div class="p-2.5 rounded-xl bg-primary-500/15">${adminKpiSvg('book')}</div></div><p class="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-on-surface-subtle">My classes</p><p class="text-3xl font-bold text-on-surface font-display tabular-nums mt-1">${snapshot.myClasses}</p><p class="text-xs text-on-surface-muted mt-2">Courses you instruct</p></div>
<div class="${bento}"><div class="flex items-start justify-between gap-2 mb-3"><div class="p-2.5 rounded-xl bg-orange-500/15">${adminKpiSvg('chart')}</div></div><p class="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-on-surface-subtle">Grading queue</p><p class="text-3xl font-bold text-on-surface font-display tabular-nums mt-1">${snapshot.gradingQueue}</p><p class="text-xs text-on-surface-muted mt-2">Submissions awaiting your review</p></div>
</div>
<div class="mt-8 rounded-2xl border-surface-default bg-surface-container overflow-hidden shadow-sm shadow-slate-200/30 dark:shadow-none dark:border-white/10">
<div class="px-5 py-4 border-b border-surface-default dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
<h3 class="text-lg font-semibold text-on-surface font-display">Recent activity</h3>
<button type="button" data-lms-action="dashboard-open-assessments" class="text-sm font-medium text-primary-800 dark:text-secondary-300 hover:text-primary-950 dark:hover:text-secondary-200 transition-colors">Open assessments</button>
</div>
<div class="overflow-x-auto min-w-0">
<table class="w-full min-w-0 text-left text-sm">
<thead><tr class="text-[0.65rem] uppercase tracking-wider text-on-surface-muted border-b border-surface-default dark:border-white/10">
<th class="py-3 px-4 font-semibold">Assessment</th><th class="py-3 px-4 font-semibold">Course</th><th class="py-3 px-4 font-semibold">Submissions</th><th class="py-3 px-4 font-semibold">Avg. score</th>
</tr></thead>
<tbody>${tableRows}</tbody>
</table>
</div>
</div>`;
}

function paintInstitutionalDashboard(): void {
  const mount = document.getElementById('dashboard-institutional-mount');
  if (!mount) return;
  const role = getCurrentUserRole();
  if (!role || role === 'student' || institutionalSnapshot.role === 'student') {
    renderTemplate(mount, '');
    return;
  }
  if (role !== institutionalSnapshot.role) {
    renderTemplate(mount, '');
    return;
  }
  let core = '';
  if (institutionalSnapshot.role === 'admin') {
    core = buildAdminInstitutionalHtml(institutionalSnapshot);
  } else {
    core = buildTeacherInstitutionalHtml(institutionalSnapshot);
  }
  renderTemplate(mount, core);
}

function buildAdminMobileDashboardHtml(
  snapshot: Extract<InstitutionalSnapshot, { role: 'admin' }>
): string {
  const countNote =
    snapshot.assignmentCount > 0
      ? `${snapshot.assignmentCount} graded item${snapshot.assignmentCount === 1 ? '' : 's'}`
      : 'Awaiting grade book entries';

  return `
<div class="space-y-6">
<div>
<p id="dashboard-mobile-greeting" class="text-xl font-bold text-primary-800 dark:text-primary-300 font-display tracking-tight"></p>
<p class="text-sm text-on-surface-muted mt-1">Institutional snapshot</p>
</div>
<div class="rounded-2xl border-surface-default bg-surface-container p-5 space-y-4 shadow-sm shadow-slate-200/25 dark:shadow-none">
<div class="flex items-start justify-between gap-2">
<div class="p-2.5 rounded-xl bg-primary-500/15">${adminKpiSvg('users')}</div>
</div>
<p class="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-on-surface-subtle">Total enrollment</p>
<p class="text-3xl font-bold text-on-surface font-display tabular-nums">${snapshot.enrollment}</p>
<p class="text-xs text-on-surface-muted">Active learner profiles</p>
</div>
<div class="rounded-2xl border-surface-default bg-surface-container p-5 space-y-3 shadow-sm shadow-slate-200/25 dark:shadow-none">
<div class="flex items-start justify-between gap-2">
<div class="p-2.5 rounded-xl bg-secondary-500/15">${adminKpiSvg('chart')}</div>
</div>
<p class="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-on-surface-subtle">GPA average</p>
<p class="text-3xl font-bold text-on-surface font-display tabular-nums">${escapeHtmlText(snapshot.systemAvg)}</p>
<p class="text-xs text-on-surface-muted">${escapeHtmlText(countNote)} system-wide</p>
</div>
</div>`;
}

function buildTeacherMobileDashboardHtml(
  snapshot: Extract<InstitutionalSnapshot, { role: 'teacher' }>
): string {
  const queueItems =
    snapshot.queueRows.length === 0
      ? `<p class="text-sm text-on-surface-muted py-4 text-center">No submissions awaiting grading.</p>`
      : snapshot.queueRows
          .slice(0, 5)
          .map((q) => {
            const dueMs = Date.parse(q.dueDateTime);
            const overdue = Number.isFinite(dueMs) && dueMs < Date.now();
            const dueLabel = overdue
              ? `${formatAssessmentDueMobileLabel(q.dueDateTime)} · Overdue`
              : formatAssessmentDueMobileLabel(q.dueDateTime);
            return `
<button type="button" data-lms-action="switch-tab" data-lms-tab="assessments" class="w-full flex items-center gap-3 rounded-xl border-surface-default bg-surface-container p-3 text-left hover:bg-slate-100 dark:hover:bg-dark-800/80 transition-colors shadow-sm shadow-slate-200/20 dark:shadow-none">
<div class="shrink-0 w-11 h-11 rounded-xl bg-secondary-100 text-secondary-800 dark:bg-secondary-500/20 dark:text-secondary-200 flex items-center justify-center" aria-hidden="true">
<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
</div>
<div class="min-w-0 flex-1">
<p class="text-sm font-semibold text-on-surface truncate">${escapeHtmlText(q.title)}</p>
<p class="text-xs text-on-surface-muted mt-0.5">${escapeHtmlText(dueLabel)} · ${q.pendingCount} submission${q.pendingCount === 1 ? '' : 's'}</p>
<p class="text-[0.65rem] text-primary-800 dark:text-primary-400/90 truncate">${escapeHtmlText(q.courseName)}</p>
</div>
<span class="text-slate-400 dark:text-dark-500 shrink-0" aria-hidden="true">›</span>
</button>`;
          })
          .join('');

  const recentActivityItems =
    snapshot.rows.length === 0
      ? `<p class="text-sm text-on-surface-muted py-3 text-center">No assessment activity yet.</p>`
      : snapshot.rows
          .slice(0, 6)
          .map((r) => {
            const avg =
              r.avgPercent == null || !Number.isFinite(r.avgPercent)
                ? '—'
                : `${finiteToFixed(r.avgPercent, 1)}%`;
            return `
<div class="rounded-xl border-surface-default bg-surface-container-tonal px-3 py-2.5">
<p class="text-sm font-semibold text-on-surface truncate">${escapeHtmlText(r.title)}</p>
<p class="text-xs text-on-surface-muted truncate">${escapeHtmlText(safeCourseDisplayName(r.courseName))}</p>
<p class="text-[0.65rem] text-on-surface-muted mt-1">${r.submissionCount} submission${r.submissionCount === 1 ? '' : 's'} · <span class="text-primary-800 dark:text-primary-300 font-medium">${avg}</span> avg</p>
</div>`;
          })
          .join('');

  return `
<div class="space-y-6">
<div>
<p id="dashboard-mobile-greeting" class="text-xl font-bold text-primary-800 dark:text-primary-300 font-display tracking-tight"></p>
<p class="text-sm text-on-surface-muted mt-1">Classes, grading, and latest submissions.</p>
</div>
<div class="grid grid-cols-2 gap-3">
<div class="rounded-2xl border-surface-default bg-surface-container p-4 shadow-sm shadow-slate-200/20 dark:shadow-none">
<div class="p-2 w-fit rounded-xl bg-violet-100 text-violet-900 dark:bg-violet-500/15 dark:text-violet-300 mb-2">${adminKpiSvg('book')}</div>
<p class="text-2xl font-bold text-on-surface font-display tabular-nums">${snapshot.myClasses}</p>
<p class="text-[0.6rem] uppercase tracking-wide text-on-surface-subtle mt-1">My classes</p>
</div>
<div class="rounded-2xl border-surface-default bg-surface-container p-4 shadow-sm shadow-slate-200/20 dark:shadow-none">
<div class="p-2 w-fit rounded-xl bg-primary-100 text-primary-900 dark:bg-teal-500/15 dark:text-teal-300 mb-2">${adminKpiSvg('chart')}</div>
<p class="text-2xl font-bold text-on-surface dark:text-primary-200 font-display tabular-nums">${snapshot.gradingQueue}</p>
<p class="text-[0.6rem] uppercase tracking-wide text-on-surface-subtle mt-1">Grading queue</p>
</div>
</div>
<div>
<div class="flex items-center justify-between gap-2 mb-3">
<h3 class="text-base font-bold text-on-surface font-display">Grading queue</h3>
<span class="flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-wide text-red-600 dark:text-red-400"><span class="w-2 h-2 rounded-full bg-red-500 lms-urgent-dot" aria-hidden="true"></span>Urgent</span>
</div>
<div class="space-y-2">${queueItems}</div>
</div>
<div>
<h3 class="text-base font-bold text-on-surface font-display mb-3">Recent activity</h3>
<div class="space-y-2">${recentActivityItems}</div>
</div>
</div>`;
}

async function paintMobileStudentDashboard(): Promise<void> {
  const shell = document.getElementById('dashboard-mobile-shell');
  if (!shell || getCurrentUserRole() !== 'student') return;

  const displayUser = getCurrentUser();
  if (!displayUser) return;

  const html = `
<div class="space-y-6">
<div id="dashboard-mobile-student-gpa-root"></div>
<div class="rounded-2xl border-l-4 border-secondary-700 dark:border-secondary-500/60 bg-white/90 dark:bg-dark-900/70 ring-1 ring-slate-200/85 dark:ring-white/10 p-5 shadow-md shadow-slate-200/45 dark:shadow-lg dark:shadow-black/20">
<p data-lms-dashboard-proverb class="lms-mobile-proverb-body text-sm italic leading-relaxed"></p>
<p class="text-[0.65rem] text-on-surface-muted mt-3 uppercase tracking-widest">Ethiopian Orthodox tradition</p>
</div>
</div>`;

  renderTemplate(shell, html);
  startDashboardProverbRotation();
}

function paintMobileDashboardForRole(): void {
  const shell = document.getElementById('dashboard-mobile-shell');
  if (!shell) return;
  const role = getCurrentUserRole();
  stopDashboardProverbRotation();
  if (!role) {
    renderTemplate(shell, '');
    return;
  }
  if (role === 'admin' && institutionalSnapshot.role === 'admin') {
    renderTemplate(shell, buildAdminMobileDashboardHtml(institutionalSnapshot));
    const greetEl = document.getElementById('dashboard-mobile-greeting');
    const u = getCurrentUser();
    if (greetEl && u) {
      const label = userProfileDisplayLabel(u);
      const name = label !== '—' ? label : u.email || 'there';
      greetEl.textContent = `Hello, ${name}`;
    }
    return;
  }
  if (role === 'teacher' && institutionalSnapshot.role === 'teacher') {
    renderTemplate(shell, buildTeacherMobileDashboardHtml(institutionalSnapshot));
    const greetEl = document.getElementById('dashboard-mobile-greeting');
    const u = getCurrentUser();
    if (greetEl && u) {
      const label = userProfileDisplayLabel(u);
      const name = label !== '—' ? label : u.email || 'there';
      greetEl.textContent = `Hello, ${name}`;
    }
    return;
  }
  renderTemplate(shell, '');
}

function setDashboardWelcome(user: User | null): void {
  const heading = document.getElementById('dashboard-welcome-heading');
  const sub = document.getElementById('dashboard-welcome-sub');
  const kicker = document.getElementById('dashboard-welcome-kicker');
  if (!heading) return;
  if (!user) {
    heading.textContent = '';
    if (sub) sub.textContent = '';
    return;
  }
  const label = userProfileDisplayLabel(user);
  const name = label !== '—' ? label : user.email || 'there';
  heading.textContent = `Hello, ${name}`;
  if (kicker) {
    kicker.textContent =
      user.role === 'admin'
        ? 'Institutional overview'
        : user.role === 'teacher'
          ? 'Instructional workspace'
          : 'Learner dashboard';
  }
  if (sub) {
    if (user.role === 'admin') {
      sub.textContent =
        'Monitor enrollment, course activity, and system-wide academic performance at a glance.';
    } else if (user.role === 'teacher') {
      sub.textContent =
        'Track your classes, prioritize the grading queue, and review recent assessment outcomes.';
    } else {
      sub.textContent = 'Review your GPA and daily wisdom on the learner dashboard.';
    }
  }
}

function gpaEncouragementLine(gpa: number): string {
  if (gpa >= 3.7) return 'Excellent work — stay consistent with your study rhythm.';
  if (gpa >= 3.0) return 'Solid standing — a little extra review goes a long way.';
  if (gpa >= 2.0) return 'You are building momentum — focus on the next few assignments.';
  return 'Every step counts — reach out if you need support.';
}

function getStudentGpaPresentation(
  gpa: number | null,
  grades: Grade[]
): {
  numericDisplay: string;
  ariaLabel: string;
  hint: string;
  barFillPct: number;
  showNewLearnerBadge: boolean;
} {
  const countable = studentHasCountableGradesForGpa(grades);
  if (!countable) {
    return {
      numericDisplay: finiteToFixed(0, 2),
      ariaLabel: 'New learner — no graded coursework yet',
      hint: 'New learner — your cumulative GPA will appear after your first graded assignments are posted.',
      barFillPct: 0,
      showNewLearnerBadge: true,
    };
  }
  if (gpa == null || !Number.isFinite(gpa)) {
    return {
      numericDisplay: finiteToFixed(0, 2),
      ariaLabel: 'Grade records incomplete — GPA shown as zero until scores are valid',
      hint: 'Some scores could not be included in your GPA. Contact your instructor if this seems wrong.',
      barFillPct: 0,
      showNewLearnerBadge: false,
    };
  }
  return {
    numericDisplay: finiteToFixed(gpa, 2),
    ariaLabel: `Overall GPA ${finiteToFixed(gpa, 2)}`,
    hint: gpaEncouragementLine(gpa),
    barFillPct: Math.min(100, Math.max(0, (gpa / 4) * 100)),
    showNewLearnerBadge: false,
  };
}

function renderStudentGpaMetricReplaceChildren(gpa: number | null, grades: Grade[]): void {
  const root = document.getElementById('student-gpa-metric-root');
  if (!root) return;
  const pres = getStudentGpaPresentation(gpa, grades);
  const wrap = document.createElement('div');
  wrap.className = 'space-y-3';
  if (pres.showNewLearnerBadge) {
    const nl = document.createElement('p');
    nl.className = 'text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-primary-400/90';
    nl.textContent = 'New learner';
    wrap.appendChild(nl);
  }
  const value = document.createElement('p');
  value.className =
    'text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-br from-white via-white to-dark-300 bg-clip-text text-transparent';
  value.textContent = pres.numericDisplay;
  value.setAttribute('aria-label', pres.ariaLabel);
  const scale = document.createElement('p');
  scale.className = 'text-[0.65rem] font-semibold uppercase tracking-widest text-dark-500';
  scale.textContent = 'Cumulative · weighted · 4.0 scale';
  const hint = document.createElement('p');
  hint.className = 'text-sm text-dark-400 leading-relaxed';
  hint.textContent = pres.hint;
  wrap.append(value, scale, hint);
  root.replaceChildren(wrap);
}

async function refreshStudentMasteryDashboard(forceGpaRefresh: boolean): Promise<void> {
  const u = getCurrentUser();
  if (!u || u.role !== 'student') return;
  try {
    const gpa = await calculateStudentCumulativeGPA(u.uid, forceGpaRefresh);
    renderStudentGpaMetricReplaceChildren(gpa, currentGrades);
    updateStudentMobileGpaBentoFromMetrics(gpa, currentGrades);
  } catch {
    renderStudentGpaMetricReplaceChildren(null, currentGrades);
    updateStudentMobileGpaBentoFromMetrics(null, currentGrades);
  }
}

async function refreshInstitutionalDashboardMetrics(): Promise<void> {
  const role = getCurrentUserRole();

  if (role === 'student') {
    institutionalSnapshot = { role: 'student' };
    paintInstitutionalDashboard();
    await paintMobileStudentDashboard();
    await refreshStudentMasteryDashboard(false);
    return;
  }

  if (role === 'admin') {
    const enrollment = currentStudents.length;
    let systemAvg = '—';
    let assignmentCount = 0;
    try {
      const ids = currentStudents.map((s) => s.id);
      const allGrades = await fetchGradesForManyStudents(ids);
      const st = computeAverageGradePercent(allGrades);
      systemAvg = st.pctLabel;
      assignmentCount = st.count;
    } catch {
      /* keep defaults */
    }
    institutionalSnapshot = {
      role: 'admin',
      enrollment,
      systemAvg,
      assignmentCount,
    };
    paintInstitutionalDashboard();
    paintMobileDashboardForRole();
    return;
  }

  if (role === 'teacher') {
    let myClasses = 0;
    let gradingQueue = 0;
    let rows: TeacherAssessmentDashboardRow[] = [];
    let queueRows: TeacherGradingQueueRow[] = [];
    try {
      const courses = await fetchTeacherClasses();
      myClasses = courses.length;
    } catch {
      myClasses = 0;
    }
    try {
      gradingQueue = await countPendingSubmissionsForTeacher();
    } catch {
      gradingQueue = 0;
    }
    try {
      rows = await fetchTeacherAssessmentDashboardRows(8);
    } catch {
      rows = [];
    }
    try {
      queueRows = await fetchTeacherGradingQueueRows(8);
    } catch {
      queueRows = [];
    }
    institutionalSnapshot = { role: 'teacher', myClasses, gradingQueue, rows, queueRows };
    paintInstitutionalDashboard();
    paintMobileDashboardForRole();
    return;
  }

  institutionalSnapshot = { role: 'student' };
  paintInstitutionalDashboard();
  paintMobileDashboardForRole();
}

async function updateDashboardStatsForStudent(_studentId: string): Promise<void> {
  const r = getCurrentUserRole();
  if (r === 'student') {
    const u = getCurrentUser();
    if (u) {
      seedStudentGpaSessionCache(u.uid, currentGrades);
      const gpa = computeCumulativeGpaFromGrades(currentGrades);
      renderStudentGpaMetricReplaceChildren(gpa, currentGrades);
      updateStudentMobileGpaBentoFromMetrics(gpa, currentGrades);
    }
  }
  paintInstitutionalDashboard();
  await loadRecentActivity();
}

async function loadRecentActivity(): Promise<void> {
  const recentActivityEl = document.getElementById('recent-activity');
  if (!recentActivityEl) return;
  const userRoleEarly = getCurrentUserRole();
  if (userRoleEarly === 'student') {
    recentActivityEl.replaceChildren();
    return;
  }
  try {
    const userRole = getCurrentUserRole();
    const sessionUser = getCurrentUser();
    let activities: Array<{ type: 'grade' | 'attendance'; date: Date; data: Grade | Attendance }> =
      [];

    const hasStudent =
      userRole === 'student' && sessionUser
        ? selectedStudentId === sessionUser.uid
        : (userRole === 'admin' || userRole === 'teacher') && !!selectedStudentId;
    if (hasStudent) {
      for (const grade of currentGrades.slice(0, 5)) {
        activities.push({ type: 'grade', date: new Date(grade.date), data: grade });
      }
      for (const att of currentAttendance.slice(0, 5)) {
        activities.push({ type: 'attendance', date: new Date(att.date), data: att });
      }
    }

    activities.sort((a, b) => b.date.getTime() - a.date.getTime());
    activities = activities.slice(0, 10);

    if (activities.length === 0) {
      const emptyCopy =
        hasStudent && userRole === 'student'
          ? {
              title: 'No recent activity yet',
              subtitle: 'Grades and attendance will appear here as your instructors post them.',
            }
          : hasStudent
            ? {
                title: 'No recent activity for this learner',
                subtitle: 'New grades and attendance will show up here after the next updates.',
              }
            : {
                title: 'No recent activity to show',
                subtitle:
                  userRole === 'student'
                    ? 'Your grades and attendance will appear here as instructors post them.'
                    : 'Select a student from the dashboard roster to combine grades and attendance in this feed.',
              };
      renderTemplate(recentActivityEl, emptyStateBlockHtml(emptyCopy.title, emptyCopy.subtitle));
      return;
    }

    const activityRows = activities
      .map((activity) => {
        const dateStr = activity.date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        if (activity.type === 'grade') {
          const grade = activity.data as Grade;
          const pct = gradePercent100(grade);
          const percentage = pct == null ? '—' : pct.toFixed(1);
          const cls = pct == null ? 'text-dark-400' : pct >= 70 ? 'text-green-400' : 'text-red-400';
          return `<tr class="border-b border-white/5 hover:bg-white/[0.03]"><td class="py-3 px-4 text-white font-medium">${escapeHtmlText(safeAssignmentTitle(grade.assignmentName))}</td><td class="py-3 px-4 text-dark-300 text-sm">Grade posted</td><td class="py-3 px-4 text-sm ${cls} tabular-nums">${percentage}${pct == null ? '' : '%'}</td><td class="py-3 px-4 text-dark-400 text-xs whitespace-nowrap text-right">${escapeHtmlText(dateStr)}</td></tr>`;
        }
        const att = activity.data as Attendance;
        const statusMap: Record<string, [string, string]> = {
          present: ['Present', 'text-green-400'],
          absent: ['Absent', 'text-red-400'],
          late: ['Late', 'text-yellow-400'],
          excused: ['Excused', 'text-blue-400'],
        };
        const [badge, color] = statusMap[att.status] || ['Recorded', 'text-dark-300'];
        return `<tr class="border-b border-white/5 hover:bg-white/[0.03]"><td class="py-3 px-4 text-white font-medium">${badge}</td><td class="py-3 px-4 text-dark-300 text-sm">Attendance</td><td class="py-3 px-4 text-sm ${color}">${escapeHtmlText(att.notes || '—')}</td><td class="py-3 px-4 text-dark-400 text-xs whitespace-nowrap text-right">${escapeHtmlText(dateStr)}</td></tr>`;
      })
      .join('');
    renderTemplate(
      recentActivityEl,
      `<div class="card-blur progress-bar-glow rounded-2xl overflow-hidden border border-white/10">
<div class="overflow-x-auto">
<table class="w-full min-w-0 text-left text-sm">
<thead><tr class="text-[0.65rem] uppercase tracking-wider text-dark-400 border-b border-white/10">
<th class="py-3 px-4 font-semibold">Item</th><th class="py-3 px-4 font-semibold">Type</th><th class="py-3 px-4 font-semibold">Detail</th><th class="py-3 px-4 font-semibold text-right">When</th>
</tr></thead>
<tbody>${activityRows}</tbody>
</table>
</div>
</div>`
    );
  } catch (err: unknown) {
    reportClientFault(err);
    renderTemplate(
      recentActivityEl,
      `<div class="card-blur progress-bar-glow rounded-xl p-6 text-secondary-200/90 text-sm text-center">Recent activity is unavailable right now.</div>`
    );
    showAppToast(formatErrorForUserToast(err, 'Could not load recent activity.'), 'error');
  }
}

function resetAppState(): void {
  stopDashboardProverbRotation();
  lastRenderedMobileNavRole = undefined;
  renderRoleBasedBottomNav(null);
  currentStudents = [];
  currentGrades = [];
  currentAttendance = [];
  selectedStudentId = null;
  attendanceRollCourses = [];
  institutionalSnapshot = { role: 'student' };
  const instMount = document.getElementById('dashboard-institutional-mount');
  if (instMount) renderTemplate(instMount, '');
  const mobileShell = document.getElementById('dashboard-mobile-shell');
  if (mobileShell) renderTemplate(mobileShell, '');
  clearGradesMobilePending();
  invalidateStudentGpaSessionCache();
  if (gradesUnsubscribe) {
    gradesUnsubscribe();
    gradesUnsubscribe = null;
  }
}

// --- Callable helpers: performance summary, study tips, agent chat ---
async function generatePerformanceSummary(studentId: string): Promise<void> {
  const btn = document.getElementById('ai-summary-btn') as HTMLButtonElement | null;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Generating…';
  }
  try {
    showLoading();
    const getPerformanceSummary = httpsCallable(functions, 'getPerformanceSummary', {
      timeout: 120_000,
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(new Error('Request timed out. The AI service may be busy — please try again.')),
        120_000
      )
    );
    const result = await Promise.race([getPerformanceSummary({ studentId }), timeoutPromise]);
    const data = result.data as { studentName?: string; summaryHtml?: string };
    showModal(
      `Performance Summary - ${data?.studentName ?? 'Student'}`,
      data?.summaryHtml ?? '<p>No summary generated.</p>'
    );
  } catch (error: unknown) {
    reportClientFault(error);
    showAppToast(
      formatErrorForUserToast(error, 'Could not generate the performance summary.'),
      'error'
    );
  } finally {
    hideLoading();
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'AI Performance Summary';
    }
  }
}

async function generateStudyTips(studentId: string): Promise<void> {
  const btn = document.getElementById('study-tips-btn') as HTMLButtonElement | null;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Generating…';
  }
  try {
    showLoading();
    const getStudyTips = httpsCallable(functions, 'getStudyTips', { timeout: 120_000 });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(new Error('Request timed out. The AI service may be busy — please try again.')),
        120_000
      )
    );
    const result = await Promise.race([getStudyTips({ studentId }), timeoutPromise]);
    const data = result.data as { studentName?: string; tipsHtml?: string };
    showModal(
      `Study Tips - ${data?.studentName ?? 'Student'}`,
      data?.tipsHtml ?? '<p>No study tips generated.</p>'
    );
  } catch (error: unknown) {
    reportClientFault(error);
    showAppToast(formatErrorForUserToast(error, 'Could not generate study tips.'), 'error');
  } finally {
    hideLoading();
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Get Study Tips';
    }
  }
}

/**
 * Wires the AI agent tab: chat send/clear, copy actions, mirror-based auto-grow input, and sanitized assistant HTML.
 */
function setupAIAgentChat(): void {
  const chatInput = document.getElementById('ai-agent-input') as HTMLTextAreaElement | null;
  const mirrorEl = document.getElementById('ai-agent-input-mirror');
  const sendBtn = document.getElementById('ai-agent-send-btn') as HTMLButtonElement;
  const messagesContainer = document.getElementById('ai-agent-messages');
  const clearChatBtn = document.getElementById('clear-chat-btn');
  const charCountEl = document.getElementById('ai-char-count');

  let conversationHistory: Array<{ user: string; assistant: string }> = [];

  if (!chatInput || !sendBtn || !messagesContainer) return;

  const syncAiInputMirror = (): void => {
    const v = chatInput.value;
    if (mirrorEl) mirrorEl.textContent = v + (v.endsWith('\n') ? '\n ' : '');
    if (charCountEl) charCountEl.textContent = `${v.length} / 500`;
  };
  const debouncedMirror = debounce(syncAiInputMirror, LMS_SEARCH_DEBOUNCE_MS);
  chatInput.addEventListener('input', debouncedMirror);
  syncAiInputMirror();

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click();
    }
  });

  if (!(messagesContainer as HTMLElement & { __lmsCopy?: boolean }).__lmsCopy) {
    (messagesContainer as HTMLElement & { __lmsCopy?: boolean }).__lmsCopy = true;
    messagesContainer.addEventListener('click', (ev) => {
      const btn = (ev.target as HTMLElement).closest('[data-lms-action="copy-ai-response"]');
      if (!btn || !messagesContainer.contains(btn)) return;
      const block = btn.closest('.ai-message-content')?.querySelector('.ai-response-content');
      const text = block?.textContent?.trim() ?? '';
      const copyFn = (window as unknown as { copyAIResponse?: (b: HTMLElement, t: string) => void })
        .copyAIResponse;
      if (text && typeof copyFn === 'function') copyFn(btn as HTMLElement, text);
    });
  }

  const sendMessage = async (): Promise<void> => {
    const message = chatInput.value.trim();
    if (!message) return;
    chatInput.disabled = true;
    sendBtn.disabled = true;
    addMessageToChat('user', message);
    chatInput.value = '';
    syncAiInputMirror();
    const typingId = addTypingIndicator();
    try {
      const aiAgentChat = httpsCallable(functions, 'aiAgentChat');
      const result = await aiAgentChat({ message, conversationHistory });
      const data = result.data as { response?: string };
      removeTypingIndicator(typingId);
      const responseText = data?.response;
      addMessageToChat(
        'assistant',
        typeof responseText === 'string' && responseText.trim()
          ? responseText
          : "Sorry, I didn't get a valid response. Please try again."
      );
      const assistantText =
        typeof responseText === 'string' && responseText.trim() ? responseText : '';
      conversationHistory.push({ user: message, assistant: assistantText });
      if (conversationHistory.length > 10) conversationHistory = conversationHistory.slice(-10);
    } catch (error: unknown) {
      reportClientFault(error);
      removeTypingIndicator(typingId);
      addMessageToChat(
        'assistant',
        'Sorry, the assistant hit a problem. Please try again in a moment, or shorten your message.'
      );
      showAppToast(formatErrorForUserToast(error, 'The AI assistant could not respond.'), 'error');
    } finally {
      chatInput.disabled = false;
      sendBtn.disabled = false;
      chatInput.focus();
    }
  };

  const runQuickPrompt = (query: string): void => {
    const q = (query || '').trim();
    if (!q) return;
    chatInput.value = q;
    syncAiInputMirror();

    // Hide quick suggestions once used (keeps UI focused on the conversation)
    const suggestions = document.getElementById('ai-quick-suggestions');
    if (suggestions && suggestions.style.display !== 'none') {
      suggestions.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      suggestions.style.opacity = '0';
      suggestions.style.transform = 'translateY(-10px)';
      window.setTimeout(() => {
        suggestions.style.display = 'none';
      }, 300);
    }

    void sendMessage();
  };

  // Make quick prompts and chips work without inline handlers
  lmsWin.askAISuggestion = (query: string) => runQuickPrompt(query);

  const quickPrompts = document.getElementById('ai-quick-prompts');
  if (quickPrompts && !(quickPrompts as HTMLElement & { __aiPrompts?: boolean }).__aiPrompts) {
    (quickPrompts as HTMLElement & { __aiPrompts?: boolean }).__aiPrompts = true;
    quickPrompts.addEventListener('click', (ev) => {
      const el = (ev.target as HTMLElement).closest('[data-ai-query]') as HTMLElement | null;
      if (!el || !quickPrompts.contains(el)) return;
      runQuickPrompt(el.getAttribute('data-ai-query') || '');
    });
    quickPrompts.addEventListener('keydown', (ev) => {
      const ke = ev as KeyboardEvent;
      if (ke.key !== 'Enter' && ke.key !== ' ') return;
      const el = (ev.target as HTMLElement).closest('[data-ai-query]') as HTMLElement | null;
      if (!el || !quickPrompts.contains(el)) return;
      ke.preventDefault();
      runQuickPrompt(el.getAttribute('data-ai-query') || '');
    });
  }

  function addMessageToChat(role: 'user' | 'assistant', content: string): void {
    if (!messagesContainer) return;
    const messageDiv = document.createElement('div');
    messageDiv.className = `flex items-start gap-4 ai-chat-message ${role}`;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (role === 'user') {
      renderTemplate(
        messageDiv,
        `
        <div class="flex-1 flex justify-end"><div class="max-w-[85%]"><div class="rounded-2xl rounded-tr-sm p-4 bg-gradient-to-br from-primary-500/20 to-accent-500/10 border border-primary-500/30 shadow-lg shadow-primary-500/10 hover:shadow-primary-500/20 transition-shadow"><p class="ai-chat-user-text whitespace-pre-wrap leading-relaxed">${escapeHtmlText(content)}</p></div><p class="text-dark-500 text-xs mt-1.5 mr-2 text-right">${escapeHtmlText(timestamp)}</p></div></div>
        <div class="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/25"><svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg></div>`
      );
    } else {
      const msgId = `ai-msg-${Date.now()}`;
      renderTemplate(
        messageDiv,
        `
        <div class="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-lg shadow-primary-500/25"><svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg></div>
        <div class="flex-1 max-w-3xl">
          <div class="ai-message-content glass-effect rounded-2xl rounded-tl-sm p-5 border border-primary-500/20 hover:border-primary-500/30 transition-all group relative">
            <div class="ai-response-content" id="${msgId}"></div>
            <button type="button" data-lms-action="copy-ai-response" class="ai-copy-btn absolute top-3 right-3 p-2 rounded-lg bg-dark-800/80 hover:bg-dark-700 text-dark-400 hover:text-white transition-all" title="Copy response"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg></button>
          </div>
          <div class="flex items-center gap-3 mt-2 ml-2">
            <p class="text-dark-500 text-xs">${escapeHtmlText(timestamp)}</p>
            <span class="text-dark-600">&bull;</span>
            <span class="text-dark-500 text-xs flex items-center gap-1"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg>AI Assistant</span>
          </div>
        </div>`
      );
      const contentDiv = messageDiv.querySelector(`#${msgId}`);
      if (contentDiv) {
        renderTemplate(contentDiv, formatMarkdown(content));
      }
    }

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' });
  }

  function addTypingIndicator(): string {
    if (!messagesContainer) return '';
    const typingId = `typing-${Date.now()}`;
    const typingDiv = document.createElement('div');
    typingDiv.id = typingId;
    typingDiv.className = 'flex items-start gap-4 ai-chat-message animate-fade-in-up';
    renderTemplate(
      typingDiv,
      `
      <div class="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-lg shadow-primary-500/25 animate-pulse-slow"><svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg></div>
      <div class="flex-1 max-w-3xl"><div class="glass-effect rounded-2xl rounded-tl-sm p-5 border border-primary-500/20 ai-message-loading"><div class="flex items-center gap-4"><div class="flex gap-2"><div class="typing-dot w-3 h-3 bg-gradient-to-br from-primary-400 to-accent-400 rounded-full"></div><div class="typing-dot w-3 h-3 bg-gradient-to-br from-primary-400 to-accent-400 rounded-full"></div><div class="typing-dot w-3 h-3 bg-gradient-to-br from-primary-400 to-accent-400 rounded-full"></div></div><span class="text-dark-400 text-sm font-medium">Analyzing your student data...</span></div><p class="text-dark-500 text-xs mt-3 flex items-center gap-2"><svg class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>Querying Firebase database...</p></div></div>`
    );
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' });
    return typingId;
  }

  function removeTypingIndicator(typingId: string): void {
    document.getElementById(typingId)?.remove();
  }

  function formatMarkdown(text: string): string {
    let html = text.trim();
    const hasHtmlTags =
      /<\/?(?:ul|ol|li|p|div|h[1-6]|strong|em|b|i|code|pre|blockquote|br|hr|span|a)[>\s]/i.test(
        html
      );

    if (hasHtmlTags) {
      html = html.replace(/<ul([^>]*)>/gi, '<ul class="space-y-2 my-4"$1>');
      html = html.replace(
        /<ol([^>]*)>/gi,
        '<ol class="space-y-2 my-4 list-decimal list-inside"$1>'
      );
      html = html.replace(
        /<li([^>]*)>/gi,
        '<li class="flex items-start gap-3 text-dark-200 mb-2"$1><span class="w-2 h-2 bg-gradient-to-br from-primary-400 to-accent-400 rounded-full mt-2 flex-shrink-0"></span><span>'
      );
      html = html.replace(/<\/li>/gi, '</span></li>');
      html = html.replace(/<strong([^>]*)>/gi, '<strong class="font-semibold"$1>');
      html = html.replace(/<b([^>]*)>/gi, '<strong class="font-semibold"$1>');
      html = html.replace(/<\/b>/gi, '</strong>');
      html = html.replace(/<em([^>]*)>/gi, '<em class="text-primary-300"$1>');
      html = html.replace(/<i([^>]*)>/gi, '<em class="text-primary-300"$1>');
      html = html.replace(/<\/i>/gi, '</em>');
      html = html.replace(/<h1([^>]*)>/gi, '<h1 class="text-2xl font-bold mt-4 mb-3"$1>');
      html = html.replace(/<h2([^>]*)>/gi, '<h2 class="text-xl font-bold mt-4 mb-2"$1>');
      html = html.replace(/<h3([^>]*)>/gi, '<h3 class="text-lg font-bold mt-3 mb-2"$1>');
      html = html.replace(/<h4([^>]*)>/gi, '<h4 class="text-base font-bold mt-3 mb-2"$1>');
      html = html.replace(/<p([^>]*)>/gi, '<p class="mb-3 text-dark-200 leading-relaxed"$1>');
      html = html.replace(
        /<code([^>]*)>/gi,
        '<code class="px-2 py-0.5 bg-dark-800 rounded text-accent-400 text-sm font-mono"$1>'
      );
      html = html.replace(
        /<pre([^>]*)>/gi,
        '<pre class="bg-dark-900/80 rounded-xl p-4 my-3 overflow-x-auto border border-dark-700"$1>'
      );
      html = html.replace(
        /<blockquote([^>]*)>/gi,
        '<blockquote class="border-l-4 border-primary-500 pl-4 py-2 my-3 bg-primary-500/5 rounded-r-lg italic text-dark-300"$1>'
      );
      html = html.replace(/>\s*\n+\s*</g, '> <');
      html = html.replace(/>([^<]+)</g, (_match, content) => {
        let styled = content.replace(
          /(\d+(?:\.\d+)?%)/g,
          '<span class="text-accent-400 font-semibold">$1</span>'
        );
        styled = styled.replace(
          /(\d+\/\d+)/g,
          '<span class="text-primary-400 font-medium">$1</span>'
        );
        return `>${styled}<`;
      });
      return sanitizeHTML(html);
    }

    html = html.replace(
      /^### (.+)$/gm,
      '<h4 class="text-lg font-bold mt-4 mb-2 flex items-center gap-2"><span class="w-1.5 h-1.5 bg-accent-400 rounded-full"></span>$1</h4>'
    );
    html = html.replace(
      /^## (.+)$/gm,
      '<h3 class="text-xl font-bold mt-5 mb-3 pb-2 border-b border-primary-500/20">$1</h3>'
    );
    html = html.replace(
      /^# (.+)$/gm,
      '<h2 class="text-2xl font-bold bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent mt-4 mb-3">$1</h2>'
    );
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong class="font-semibold">$1</strong>');
    html = html.replace(
      /(?<![*_])([*_])(?![*_])(.+?)(?<![*_])\1(?![*_])/g,
      '<em class="text-primary-300 italic">$2</em>'
    );
    html = html.replace(
      /```(\w+)?\n?([\s\S]*?)```/g,
      '<pre class="bg-dark-900/80 rounded-xl p-4 my-3 overflow-x-auto border border-dark-700"><code class="text-accent-300 text-sm font-mono">$2</code></pre>'
    );
    html = html.replace(
      /`([^`]+)`/g,
      '<code class="px-2 py-0.5 bg-dark-800 rounded text-accent-400 text-sm font-mono">$1</code>'
    );
    html = html.replace(
      /^\* (.+)$/gm,
      '<div class="flex items-start gap-3 mb-2"><span class="w-2 h-2 bg-gradient-to-br from-primary-400 to-accent-400 rounded-full mt-2 flex-shrink-0"></span><span class="text-dark-200">$1</span></div>'
    );
    html = html.replace(
      /^- (.+)$/gm,
      '<div class="flex items-start gap-3 mb-2"><span class="w-2 h-2 bg-gradient-to-br from-primary-400 to-accent-400 rounded-full mt-2 flex-shrink-0"></span><span class="text-dark-200">$1</span></div>'
    );
    html = html.replace(
      /^(\d+)\. (.+)$/gm,
      (_match, num, content) =>
        `<div class="flex items-start gap-3 mb-2"><span class="w-6 h-6 bg-gradient-to-br from-primary-500/20 to-accent-500/20 rounded-lg flex items-center justify-center text-xs font-bold text-primary-400 flex-shrink-0">${num}</span><span class="text-dark-200">${content}</span></div>`
    );
    html = html.replace(
      /^> (.+)$/gm,
      '<blockquote class="border-l-4 border-primary-500 pl-4 py-2 my-3 bg-primary-500/5 rounded-r-lg italic text-dark-300">$1</blockquote>'
    );
    html = html.replace(/^---$/gm, '<hr class="my-4 border-dark-700">');
    html = html.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" class="text-primary-400 hover:text-primary-300 underline" target="_blank">$1</a>'
    );
    html = html.replace(
      /(\d+(?:\.\d+)?%)/g,
      '<span class="text-accent-400 font-semibold">$1</span>'
    );
    html = html.replace(/(\d+\/\d+)(?!<)/g, '<span class="text-primary-400 font-medium">$1</span>');
    html = html.replace(/\n\n+/g, '</p><p class="mb-3 text-dark-200 leading-relaxed">');
    html = html.replace(/\n/g, '<br>');
    html = `<p class="mb-3 text-dark-200 leading-relaxed">${html}</p>`;
    html = html.replace(/<p class="[^"]*">(<(?:h[1-6]|div|ul|ol|pre|blockquote)[^>]*>)/g, '$1');
    html = html.replace(/(<\/(?:h[1-6]|div|ul|ol|pre|blockquote)>)<\/p>/g, '$1');
    html = html.replace(/<p class="[^"]*"><\/p>/g, '');
    html = html.replace(/<p class="[^"]*"><br><\/p>/g, '');
    html = html.replace(/<br><br>/g, '</p><p class="mb-3 text-dark-200 leading-relaxed">');
    return sanitizeHTML(html);
  }

  sendBtn.addEventListener('click', sendMessage);

  lmsWin.resetLmsAiAdvisorSession = () => {
    conversationHistory = [];
    const mc = document.getElementById('ai-agent-messages');
    const welcome = mc?.querySelector<HTMLElement>('[data-lms-ai-welcome-root]');
    if (mc && welcome) {
      mc.replaceChildren();
      mc.appendChild(welcome);
    }
  };

  if (clearChatBtn) {
    clearChatBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear the chat history?')) {
        lmsWin.resetLmsAiAdvisorSession?.();
      }
    });
  }
}

// --- Attendance: load, display, stats ---
async function loadStudentAttendance(studentId: string): Promise<void> {
  try {
    currentAttendance = await fetchAttendance(studentId);
    displayAttendance(currentAttendance);
    updateAttendanceStats(currentAttendance);
    loadRecentActivity();
  } catch (e) {
    reportClientFault(e);
    if (isFirebasePermissionDenied(e)) {
      const attendanceTableBody = document.getElementById('attendance-history-body');
      if (attendanceTableBody) {
        renderTemplate(
          attendanceTableBody,
          emptyStateTableRowHtml(
            4,
            'Access denied',
            'This account cannot load attendance history under the current security rules. Sign out and sign in again, or contact your administrator.',
            ''
          )
        );
      }
      updateAttendanceStats([]);
      showAppToast(
        'Attendance data is blocked by security rules. If this is unexpected, contact support.',
        'error'
      );
    } else {
      displayAttendance([]);
      updateAttendanceStats([]);
    }
  }
}

function displayAttendance(attendance: Attendance[]): void {
  const attendanceTableBody = document.getElementById('attendance-history-body')!;
  const sel = document.getElementById('attendance-student-select') as HTMLSelectElement | null;
  const hasSelection = !!sel?.value;
  if (attendance.length === 0) {
    if (!hasSelection) {
      renderTemplate(
        attendanceTableBody,
        attendanceHistoryEmptyRowHtml('Select a student to view attendance history.')
      );
    } else {
      const role = getCurrentUserRole();
      const cta =
        role === 'teacher' || role === 'admin'
          ? `<button type="button" id="attendance-empty-focus-mark" class="px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-colors">Mark attendance</button>`
          : '';
      const emptyMsg =
        role === 'student'
          ? 'No attendance history on file yet. Your instructors will record sessions here as they meet.'
          : 'No attendance records yet for this student.';
      renderTemplate(attendanceTableBody, attendanceHistoryEmptyRowHtml(emptyMsg, cta));
      document.getElementById('attendance-empty-focus-mark')?.addEventListener('click', () => {
        document
          .getElementById('mark-attendance-form')
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
    return;
  }
  const resolveName = (studentId: string) =>
    safeStudentDisplayName(currentStudents.find((s) => s.id === studentId)?.name);
  renderTemplate(attendanceTableBody, renderAttendanceHistoryRows(attendance, resolveName));
}

function updateAttendanceStats(attendance: Attendance[]): void {
  const total = attendance.length;
  const present = attendance.filter((a) => a.status === 'present').length;
  const absent = attendance.filter((a) => a.status === 'absent').length;
  const late = attendance.filter((a) => a.status === 'late').length;
  const excused = attendance.filter((a) => a.status === 'excused').length;
  const rawRatePct = total > 0 ? ((present + late + excused) / total) * 100 : 0;
  const rate = finiteToFixed(Math.min(100, Math.max(0, rawRatePct)), 1, '0');

  const totalEl = document.getElementById('attendance-total');
  const presentEl = document.getElementById('attendance-present');
  const absentEl = document.getElementById('attendance-absent');
  const rateEl = document.getElementById('attendance-rate');
  if (totalEl) totalEl.textContent = total.toString();
  if (presentEl) presentEl.textContent = present.toString();
  if (absentEl) absentEl.textContent = absent.toString();
  if (rateEl) rateEl.textContent = rate + '%';
}

// --- Profile & UID display ---
let studentProfileSaveWired = false;
let profilePasswordUpdateWired = false;
let loadUserProfileGeneration = 0;

async function loadUserProfile(): Promise<void> {
  const generation = ++loadUserProfileGeneration;
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) return;

  const role = getCurrentUserRole();

  let userDocData: Record<string, unknown> = {};
  try {
    const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
    if (snap.exists()) userDocData = snap.data() as Record<string, unknown>;
  } catch (e) {
    reportClientFault(e);
  }

  if (generation !== loadUserProfileGeneration) return;

  const memUser = getCurrentUser();
  const selfDisplay =
    (typeof userDocData.displayName === 'string' && userDocData.displayName.trim()) ||
    (typeof userDocData.fullName === 'string' && userDocData.fullName.trim()) ||
    memUser?.displayName?.trim() ||
    '';
  const selfPhone =
    (typeof userDocData.phoneNumber === 'string' && userDocData.phoneNumber.trim()) ||
    (typeof userDocData.phone === 'string' && userDocData.phone.trim()) ||
    memUser?.phoneNumber?.trim() ||
    '';

  let selfBirthYearStr = '';
  if (typeof userDocData.birthYear === 'number' && Number.isFinite(userDocData.birthYear)) {
    selfBirthYearStr = String(Math.round(userDocData.birthYear));
  } else if (memUser?.birthYear != null && Number.isFinite(memUser.birthYear)) {
    selfBirthYearStr = String(memUser.birthYear);
  }

  const docYearOfBirth =
    typeof userDocData.yearOfBirth === 'number' && Number.isFinite(userDocData.yearOfBirth)
      ? String(Math.round(userDocData.yearOfBirth))
      : '';

  const student =
    role === 'student' ? currentStudents.find((s) => s.studentUid === firebaseUser.uid) : undefined;

  const rosterName = student?.name?.trim() || '';
  const docName = typeof userDocData.name === 'string' ? userDocData.name.trim() : '';
  const emailLocal = firebaseUser.email?.split('@')[0]?.trim() || '';
  const summaryName =
    rosterName ||
    selfDisplay ||
    docName ||
    emailLocal ||
    (role === 'admin' ? 'Administrator' : role === 'teacher' ? 'Teacher' : 'Student');

  const userDocMemberId =
    typeof userDocData.memberId === 'string' ? userDocData.memberId.trim() : '';
  const rosterMemberId = student?.memberId?.trim() || '';
  const memberIdCombined = rosterMemberId || userDocMemberId || memUser?.memberId?.trim() || '';

  const summaryBirth =
    role === 'student' && student?.yearOfBirth != null
      ? String(student.yearOfBirth)
      : selfBirthYearStr || docYearOfBirth || '--';

  const fromStudentPhone = student?.contactPhone?.trim() || '';
  const summaryPhone = fromStudentPhone || selfPhone || 'Not provided';

  const summaryContactEmail = student?.contactEmail?.trim() || firebaseUser.email || 'Not provided';

  const fields: Record<string, string> = {
    'profile-name': summaryName,
    'profile-year-of-birth': summaryBirth,
    'profile-uid': firebaseUser.uid,
    'profile-email': firebaseUser.email || '--',
    'profile-contact-phone': summaryPhone,
    'profile-contact-email': summaryContactEmail,
  };
  for (const [id, val] of Object.entries(fields)) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  const profileHdrAvatar = document.getElementById('profile-header-avatar');
  if (profileHdrAvatar) {
    const ini = initialsForAvatarLabel(summaryName);
    const { bg, ring } = pickAvatarDiscPalette(firebaseUser.uid);
    profileHdrAvatar.textContent = ini;
    profileHdrAvatar.className = `flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white ring-2 font-display ${bg} ${ring}`;
  }

  const editName = document.getElementById('profile-self-display-name') as HTMLInputElement | null;
  const editPhone = document.getElementById('profile-self-phone') as HTMLInputElement | null;
  const editBirth = document.getElementById('profile-self-birth-year') as HTMLInputElement | null;
  const editMemberId = document.getElementById('profile-self-member-id') as HTMLInputElement | null;
  if (editName) editName.value = selfDisplay;
  if (editPhone) editPhone.value = selfPhone;
  if (editBirth) {
    editBirth.value =
      selfBirthYearStr ||
      (role === 'student' && student?.yearOfBirth != null ? String(student.yearOfBirth) : '') ||
      (role !== 'student' ? docYearOfBirth : '');
  }
  if (editMemberId) editMemberId.value = memberIdCombined;

  const profileNotes = document.getElementById('profile-notes');
  const profileNotesSection = document.getElementById('profile-notes-section');
  if (profileNotes && profileNotesSection) {
    if (role === 'student' && student?.notes?.trim()) {
      profileNotes.textContent = student.notes;
      profileNotesSection.classList.remove('hide');
    } else {
      profileNotesSection.classList.add('hide');
    }
  }

  setupProfilePasswordStrengthMeter();

  const curPw = document.getElementById('profile-current-password') as HTMLInputElement | null;
  const newPw = document.getElementById('profile-new-password') as HTMLInputElement | null;
  const cfPw = document.getElementById('profile-confirm-password') as HTMLInputElement | null;
  if (curPw) curPw.value = '';
  if (newPw) newPw.value = '';
  if (cfPw) cfPw.value = '';
}

function wireProfilePasswordUpdate(): void {
  if (profilePasswordUpdateWired) return;
  const btn = document.getElementById('profile-update-password-btn') as HTMLButtonElement | null;
  if (!btn) return;
  profilePasswordUpdateWired = true;
  btn.addEventListener('click', async () => {
    const currentEl = document.getElementById(
      'profile-current-password'
    ) as HTMLInputElement | null;
    const nextEl = document.getElementById('profile-new-password') as HTMLInputElement | null;
    const confirmEl = document.getElementById(
      'profile-confirm-password'
    ) as HTMLInputElement | null;
    const current = currentEl?.value ?? '';
    const next = nextEl?.value ?? '';
    const confirm = confirmEl?.value ?? '';
    if (!current || !next || !confirm) {
      showAppToast('Please fill in all password fields.', 'info');
      return;
    }
    if (next !== confirm) {
      showAppToast('New password and confirmation do not match.', 'error');
      return;
    }
    if (next.length < 6) {
      showAppToast('New password must be at least 6 characters.', 'error');
      return;
    }
    const strength = evaluatePasswordStrength(next);
    if (strength.tier < 2) {
      showAppToast(
        'Choose a stronger password (longer mix of letters, numbers, and symbols).',
        'info'
      );
      return;
    }
    const u = auth.currentUser;
    const email = u?.email;
    if (!u || !email) {
      showAppToast('This account has no email address; password cannot be updated here.', 'error');
      return;
    }
    btn.disabled = true;
    try {
      const cred = EmailAuthProvider.credential(email, current);
      await reauthenticateWithCredential(u, cred);
      await updatePassword(u, next);
      showAppToast('Password updated successfully.', 'success');
      if (currentEl) currentEl.value = '';
      if (nextEl) nextEl.value = '';
      if (confirmEl) confirmEl.value = '';
    } catch (e: unknown) {
      reportClientFault(e);
      showAppToast(formatErrorForUserToast(e, 'Could not update your password.'), 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

/** Keeps legacy hidden `#navbar-uid-display` in sync (e.g. mobile menu delegates to `#show-uid-btn`). */
function syncNavbarUidField(): void {
  const uidDisplay = document.getElementById('navbar-uid-display') as HTMLInputElement | null;
  const user = auth.currentUser;
  if (uidDisplay && user) uidDisplay.value = user.uid;
}

/**
 * Wires `#show-uid-btn` and `window.openAccountIdModal` (sidebar) to a real modal — the old `#uid-dropdown`
 * was never populated, so toggling it did nothing after the shell redesign.
 */
function initAccountIdUi(): void {
  const w = window as unknown as { __lmsAccountIdUi?: boolean; openAccountIdModal?: () => void };
  if (w.__lmsAccountIdUi) return;
  w.__lmsAccountIdUi = true;
  w.openAccountIdModal = openAccountIdModal;

  document.getElementById('show-uid-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openAccountIdModal();
  });
}

function openAccountIdModal(): void {
  const user = auth.currentUser;
  if (!user) return;
  const uid = user.uid;
  const safeUid = escapeHtmlText(uid);
  const modalHtml = `
    <div class="space-y-4">
      <div class="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <p class="text-blue-400 font-semibold mb-2">Your Account ID (UID)</p>
        <p class="text-dark-300 text-sm mb-3">Share this ID with your teacher or administrator so they can link your enrollment.</p>
        <div class="relative">
          <input type="text" id="account-id-modal-uid-input" value="${safeUid}" readonly class="w-full px-4 py-3 pr-24 rounded-lg bg-dark-800 border border-dark-600 text-white font-mono text-sm focus:outline-none focus:border-primary-500">
          <button type="button" id="account-id-modal-copy-btn" class="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded text-sm font-semibold transition-all">Copy</button>
        </div>
        <p class="text-xs text-dark-400 mt-2">Use Copy, then paste into a message or email to your teacher.</p>
      </div>
      <div class="text-center">
        <button type="button" id="account-id-modal-close-btn" class="modal-close-trigger px-6 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-semibold rounded-lg hover:from-primary-600 hover:to-primary-700 transition-all shadow-lg">Close</button>
      </div>
    </div>`;

  showModal('My Account ID', modalHtml);
}

function showUidModal(uid: string, email: string): void {
  scheduleDomPaint(() => {
    try {
      hideLoading();
    } catch {
      /* ignore */
    }
  });
  const modalHtml = `
    <div class="space-y-4">
      <div class="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
        <p class="text-green-400 font-semibold mb-2">Account Created Successfully!</p>
        <p class="text-dark-300 text-sm">Welcome, <strong class="text-white">${escapeHtmlText(email)}</strong></p>
      </div>
      <div class="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <p class="text-blue-400 font-semibold mb-2">Your Account ID (UID)</p>
        <p class="text-dark-300 text-sm mb-3">You MUST share this ID with your teacher/admin so they can register you in the system.</p>
        <div class="relative">
          <input type="text" id="uid-display" value="${escapeHtmlText(uid)}" readonly class="w-full px-4 py-3 pr-24 rounded-lg bg-dark-800 border border-dark-600 text-white font-mono text-sm focus:outline-none focus:border-primary-500">
          <button type="button" id="copy-uid-btn" class="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded text-sm font-semibold transition-all">Copy</button>
        </div>
        <p class="text-xs text-dark-400 mt-2">Click "Copy" and send this ID to your teacher via email or message.</p>
      </div>
      <div class="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
        <p class="text-yellow-400 font-semibold mb-2">Next Steps:</p>
        <ol class="text-dark-300 text-sm space-y-1 ml-4 list-decimal">
          <li>Copy your Account ID using the button above</li>
          <li>Send it to your teacher/administrator</li>
          <li>Wait for them to register you in the system</li>
          <li>Keep using your dashboard; add your profile details anytime under My Profile</li>
        </ol>
      </div>
      <div class="text-center">
        <button type="button" id="close-uid-modal-btn" class="modal-close-trigger px-6 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-semibold rounded-lg hover:from-primary-600 hover:to-primary-700 transition-all shadow-lg">I've Copied My ID</button>
      </div>
    </div>`;

  showModal('Account Created!', modalHtml, {
    onDismiss: () => {
      refreshAppShellAfterSignupModalDismiss();
    },
  });
}

/** After signup UID modal closes, keep the signed-in student in the app shell (no forced sign-out). */
function refreshAppShellAfterSignupModalDismiss(): void {
  void (async () => {
    let user = getCurrentUser();
    if (!user && auth.currentUser) {
      user = await reloadCurrentUserFromFirestore();
    }
    if (!user && auth.currentUser) {
      for (let attempt = 1; attempt <= 6 && !user; attempt++) {
        await new Promise<void>((resolve) => {
          window.setTimeout(() => resolve(), 40 + attempt * 35);
        });
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        user = await reloadCurrentUserFromFirestore();
      }
    }

    if (!auth.currentUser) {
      scheduleDomPaint(() => {
        showAuthContainer();
      });
      return;
    }

    if (!user) {
      scheduleDomPaint(() => {
        showAppContainer();
        showBootstrapError(
          'Still loading your account profile. You remain signed in; open My Profile in a moment if labels still look incomplete.'
        );
      });
      try {
        await initDashboard();
      } catch {
        /* dashboard load error */
      }
      void loadUserProfile();
      return;
    }

    scheduleDomPaint(() => {
      showAppContainer();
      configureUIForRole(user!);
      const userRole = getCurrentUserRole();
      const gw = window as LmsGlobalWindow;
      const sidebarLabel = userProfileDisplayLabel(user!);
      gw.updateSidebarUserInfo?.(
        sidebarLabel === '—' ? user!.email || '' : sidebarLabel,
        userRole ?? 'student',
        user!.email || ''
      );

      document.querySelectorAll('.tab-content').forEach((c) => c.classList.add('hide'));
      document.getElementById('dashboard-content')?.classList.remove('hide');

      document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.classList.remove('tab-active');
        btn.classList.add('text-dark-300');
      });
      const dashBtn = document.querySelector('.tab-btn[data-tab="dashboard"]');
      if (dashBtn) {
        dashBtn.classList.add('tab-active');
        dashBtn.classList.remove('text-dark-300');
      }

      document
        .querySelectorAll('.lms-nav-item[data-tab]')
        .forEach((item) => item.classList.remove('active'));
      document.querySelector('.lms-nav-item[data-tab="dashboard"]')?.classList.add('active');

      const breadcrumb = document.getElementById('breadcrumb-current');
      if (breadcrumb) breadcrumb.textContent = 'Dashboard';

      if (user!.role === 'student' && user!.studentProfile === null) {
        showBootstrapError(
          'Your student profile is not linked yet. Share your Account ID with your teacher or administrator ' +
            'so they can finish enrollment; you can still use the dashboard meanwhile.'
        );
      }
    });

    try {
      await initDashboard();
    } catch {
      /* dashboard load error */
    }
    void loadUserProfile();
  })();
}

function runInit(): void {
  authShellReady = false;
  if (bootstrapWatchdogId !== undefined) {
    window.clearTimeout(bootstrapWatchdogId);
  }
  bootstrapWatchdogId = window.setTimeout(() => {
    bootstrapWatchdogId = undefined;
    if (authShellReady) return;
    // Dead-man's switch: never leave the boot spinner up if the auth handshake never completes.
    scheduleDomPaint(() => {
      try {
        hideLoading();
      } catch {
        /* ignore */
      }
    });
    markAuthShellReady();
  }, 5000);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      void init().catch((e) => {
        // #region agent log
        agentDebugLog({
          sessionId: 'ecf1fb',
          hypothesisId: 'F',
          runId: 'pre',
          location: 'main.ts:runInit',
          message: 'init() rejected',
          data: { err: e instanceof Error ? e.message : String(e) },
        });
        // #endregion
        showBootstrapError(
          'The app failed to finish loading. Please refresh the page or try again later.'
        );
        markAuthShellReady();
      });
    });
  });
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', runInit);
} else {
  runInit();
}
