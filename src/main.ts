/**
 * Main application entry. Orchestrates auth, UI, data loading, and tab behavior.
 * Holds LMS shell state (students, grades, attendance, selection) and wires Firebase listeners.
 */

import './tailwind.css';
import {
  auth,
  functions,
  httpsCallable,
  ensureFirebaseClient,
  ensureAuthPersistence,
  signOut,
} from './core/firebase';
import {
  getAppTheme,
  installThemeChangeBridge,
  registerThemeRefreshHandler,
} from './core/theme-events';
import { initAuth, signUp, signIn, logout, userLegalAcceptanceIncomplete } from './core/auth';
import { ParticleSystem } from './ui/particles';
import {
  initUI,
  showAuthContainer,
  showAppContainer,
  configureUIForRole,
  showError,
  clearError,
  showModal,
  closeModal,
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
} from './ui/ui';
import {
  fetchStudents,
  addGrade,
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
} from './data/data';
import { User, Student, Grade, Attendance } from './core/types';
import { initAssessments, loadAssessments } from './ui/assessment-ui';
import { initClasses, loadClasses } from './ui/classes-ui';
import { initLegalModals } from './ui/legal';
import { LEGAL_PRIVACY_VERSION, LEGAL_TERMS_VERSION } from './core/legal-versions';

let currentStudents: Student[] = [];
let currentGrades: Grade[] = [];
let currentAttendance: Attendance[] = [];
let selectedStudentId: string | null = null;
let gradesUnsubscribe: (() => void) | null = null;
let particleSystem: ParticleSystem | null = null;

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

/** Defers DOM writes until after the next paint so layout exists (reduces DevTools-only race symptoms). */
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

// Reused for HTML escaping to avoid XSS when rendering user/AI content
const escapeEl = document.createElement('div');
function escapeHtml(s: string): string {
  escapeEl.textContent = s;
  return escapeEl.innerHTML;
}

/**
 * Returns a debounced wrapper that invokes `fn` after `ms` milliseconds of inactivity.
 */
function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: number;
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), ms);
  }) as unknown as T;
}

/** Delegated clicks for dashboard tables (avoids inline onclick / quoted-ID XSS issues). */
function setupLmsDelegatedActions(): void {
  const app = document.getElementById('app-container');
  if (!app || (app as HTMLElement & { __lmsDel?: boolean }).__lmsDel) return;
  (app as HTMLElement & { __lmsDel?: boolean }).__lmsDel = true;
  app.addEventListener('click', async (e) => {
    if ((e.target as HTMLElement).closest('#assessments-content')) return;
    const el = (e.target as HTMLElement).closest('[data-lms-action]') as HTMLElement | null;
    if (!el) return;
    const action = el.dataset.lmsAction;
    if (action === 'edit-student') {
      const id = el.dataset.studentId;
      if (id) (window as any).handleEditStudent(id);
      return;
    }
    if (action === 'delete-student') {
      const id = el.dataset.studentId;
      if (id) await (window as any).handleDeleteStudent(id);
      return;
    }
    if (action === 'delete-teacher') {
      const id = el.dataset.userId;
      if (id) await (window as any).handleDeleteTeacher(id);
      return;
    }
    if (action === 'change-role') {
      const id = el.dataset.userId;
      const role = el.dataset.userRole ?? '';
      if (id) await (window as any).handleChangeRole(id, role);
      return;
    }
    if (action === 'delete-grade') {
      const sid = el.dataset.studentId;
      const gid = el.dataset.gradeId;
      if (sid && gid) await (window as any).handleDeleteGrade(sid, gid);
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
  try { showLoading(); } catch { /* overlay not mounted yet */ }

  try {
    initUI();
  } catch {
    // UI boot should not block Firebase init; fall through to banner-based error handling if needed.
  }

  const firebaseErr = ensureFirebaseClient();
  if (firebaseErr) {
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
    } catch {
      scheduleDomPaint(() => {
        showBootstrapError(
          'Something went wrong while loading the dashboard. Please refresh the page. ' +
            'If the problem continues, check your network connection.'
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

  try { initAuth(handleAuthStateChangeBootstrap); } catch { /* auth listener init */ }
  try { setupAuthForms(); } catch { /* auth form wiring */ }
  try { setupAppForms(); } catch { /* app wiring */ }
  try { setupLmsDelegatedActions(); } catch { /* delegated actions */ }
  try { initAssessments(); } catch { /* assessments init */ }
  try { initClasses(); } catch { /* classes init */ }

  try { installThemeChangeBridge(); } catch { /* theme bridge */ }
  try { initLegalModals(); } catch { /* legal modals */ }
  try { initAccountIdUi(); } catch { /* account id UI */ }
  registerThemeRefreshHandler(() => {
    try {
      if (currentGrades.length > 0) renderGradeCharts(currentGrades);
      particleSystem?.refreshForTheme();
    } catch {
      /* theme refresh */
    }
  });

  document.addEventListener('tab-switched', async (e: any) => {
    const tab = e.detail?.tab;
    if (tab === 'classes') await loadClasses();
    else if (tab === 'attendance' && selectedStudentId) await loadStudentAttendance(selectedStudentId);
    else if (tab === 'dashboard') await loadRecentActivity();
    else if (tab === 'assessments') await loadAssessments();
    else if (tab === 'users') await loadAllUsers();
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
    const incomplete = userLegalAcceptanceIncomplete(user);
    if (incomplete) {
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
      if (typeof (window as any).updateSidebarUserInfo === 'function') {
        const sidebarLabel = (user.displayName && user.displayName.trim()) || user.email || '';
        (window as any).updateSidebarUserInfo(sidebarLabel, userRole);
      }
    });
    markAuthShellReady();

    await loadDashboardData();

    scheduleDomPaint(() => {
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hide'));
      document.getElementById('dashboard-content')?.classList.remove('hide');

      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('tab-active');
        btn.classList.add('text-dark-300');
      });
      const dashBtn = document.querySelector('.tab-btn[data-tab="dashboard"]');
      if (dashBtn) {
        dashBtn.classList.add('tab-active');
        dashBtn.classList.remove('text-dark-300');
      }

      document.querySelectorAll('.lms-nav-item[data-tab]').forEach(item => item.classList.remove('active'));
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
    scheduleDomPaint(() => {
      showAuthContainer();
      resetAppState();
    });
    markAuthShellReady();
  }
}

function setupAuthForms(): void {
  const lf = loginForm;
  const sf = signupForm;
  if (!lf || !sf) return;

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
    try {
      await signIn(email, password);
      lf.reset();
    } catch (error: any) {
      showError(loginError, error.message || 'Login failed. Please try again.');
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
    try {
      const uid = await signUp(email, password, {
        termsVersion: LEGAL_TERMS_VERSION,
        privacyVersion: LEGAL_PRIVACY_VERSION,
        userAgent: navigator.userAgent || '',
      });
      showUidModal(uid, email);
      sf.reset();
    } catch (error: any) {
      showError(signupError, error.message || 'Signup failed. Please try again.');
    }
  });

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try { await logout(); } catch { alert('Logout failed. Please try again.'); }
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
        notes: formData.get('notes') as string || ''
      };
      try {
        showLoading();
        const studentId = await createStudent(studentData);
        if (successEl) {
          successEl.textContent = `Student "${studentData.name}" registered successfully. (ID: ${studentId})`;
          successEl.classList.remove('hide');
        }
        studentRegForm.reset();
        const studentDropdownValue = document.querySelector('#student-account-dropdown .account-dropdown-value');
        if (studentDropdownValue) studentDropdownValue.textContent = '-- Select Registered Account --';
        await Promise.all([loadDashboardData(), loadRegisteredStudents()]);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Registration failed';
        if (errorEl) {
          errorEl.textContent = 'Failed to register student: ' + msg;
          errorEl.classList.remove('hide');
        }
      } finally {
        hideLoading();
      }
    });
  }

  const teacherRegForm = document.getElementById('teacher-registration-form') as HTMLFormElement;
  if (teacherRegForm) {
    teacherRegForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById('teacher-registration-error');
      const successEl = document.getElementById('teacher-registration-success');
      const finalUidEl = document.getElementById('final-teacher-uid') as HTMLInputElement;
      errorEl?.classList.add('hide');
      successEl?.classList.add('hide');
      const teacherUid = (finalUidEl?.value || (teacherRegForm.querySelector('[name="teacherUid"]') as HTMLInputElement | null)?.value)?.trim();
      if (!teacherUid) {
        if (errorEl) {
          errorEl.textContent = 'Link to Teacher Account is required. Select an account or enter UID manually.';
          errorEl.classList.remove('hide');
        }
        return;
      }
      const formData = new FormData(teacherRegForm);
      const teacherName = (formData.get('teacherName') as string)?.trim();
      const yearVal = formData.get('teacherYearOfBirth');
      const parsedYear = yearVal ? parseInt(String(yearVal), 10) : NaN;
      const yearOfBirth = Number.isNaN(parsedYear) ? undefined : parsedYear;
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
        hideLoading();
        if (successEl) {
          successEl.textContent = `Teacher "${teacherName || 'registered'}" registered successfully.`;
          successEl.classList.remove('hide');
        }
        teacherRegForm.reset();
        if (finalUidEl) finalUidEl.value = '';
        const teacherDropdownValue = document.querySelector('#teacher-account-dropdown .account-dropdown-value');
        if (teacherDropdownValue) teacherDropdownValue.textContent = '-- Select Registered Account --';
        await loadRegisteredTeachers();
      } catch (error: unknown) {
        hideLoading();
        const msg = error instanceof Error ? error.message : String(error);
        if (errorEl) {
          errorEl.textContent = 'Failed to register teacher: ' + msg;
          errorEl.classList.remove('hide');
        }
      }
    });
  }

  const useManualTeacherBtn = document.getElementById('use-manual-teacher-uid-btn');
  const useDropdownTeacherBtn = document.getElementById('use-dropdown-teacher-btn');
  const teacherDropdownMethod = document.getElementById('teacher-dropdown-method');
  const teacherManualMethod = document.getElementById('teacher-manual-method');
  if (useManualTeacherBtn && useDropdownTeacherBtn && teacherDropdownMethod && teacherManualMethod) {
    useManualTeacherBtn.addEventListener('click', () => {
      teacherDropdownMethod.classList.add('hide');
      teacherManualMethod.classList.remove('hide');
    });
    useDropdownTeacherBtn.addEventListener('click', () => {
      teacherDropdownMethod.classList.remove('hide');
      teacherManualMethod.classList.add('hide');
    });
  }
  setupAccountDropdown('teacher-account-dropdown', 'final-teacher-uid', populateTeacherAccountDropdown);
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
    }, 200);
    usersSearch.addEventListener('input', () => {
      runUsersFilter((usersSearch.value || '').toLowerCase().trim());
    });
  }

  const registeredStudentsSearch = document.getElementById('registered-students-search') as HTMLInputElement;
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
    }, 200);
    registeredStudentsSearch.addEventListener('input', () => {
      runRegStudentsFilter((registeredStudentsSearch.value || '').toLowerCase().trim());
    });
  }
  const registeredTeachersSearch = document.getElementById('registered-teachers-search') as HTMLInputElement;
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
    }, 200);
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
      const formData = new FormData(editStudentForm);
      const yearVal = formData.get('yearOfBirth');
      const yearOfBirth = yearVal ? parseInt(String(yearVal), 10) : undefined;
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
        await Promise.all([loadDashboardData(), loadRegisteredStudents()]);
        alert('Student updated successfully');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Update failed';
        alert('Failed to update student: ' + msg);
      } finally {
        hideLoading();
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
      if (!selectedStudentId) { alert('Please select a student first'); return; }
      const formData = new FormData(gradeEntryForm);
      const gradeData = {
        assignmentName: formData.get('assignmentName') as string,
        category: formData.get('category') as any,
        score: parseFloat(formData.get('score') as string),
        totalPoints: parseFloat(formData.get('totalPoints') as string),
        teacherId: '',
        date: new Date().toISOString()
      };
      try {
        await addGrade(selectedStudentId, gradeData);
        gradeEntryForm.reset();
      } catch (error: any) {
        alert('Failed to add grade: ' + error.message);
      }
    });
  }

  const exportCsvBtn = document.getElementById('export-csv-btn');
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
      if (currentGrades.length === 0) { alert('No grades to export. Please select a student with grades.'); return; }
      const student = currentStudents.find(s => s.id === selectedStudentId);
      exportGradesToCSV(currentGrades, student ? student.name : 'Unknown');
    });
  }

  const aiSummaryBtn = document.getElementById('ai-summary-btn');
  if (aiSummaryBtn) {
    aiSummaryBtn.addEventListener('click', async () => {
      if (!selectedStudentId) { alert('Please select a student first'); return; }
      await generatePerformanceSummary(selectedStudentId);
    });
  }

  const studyTipsBtn = document.getElementById('study-tips-btn');
  if (studyTipsBtn) {
    studyTipsBtn.addEventListener('click', async () => {
      if (!selectedStudentId) { alert('Please select a student first'); return; }
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

  setupAIAgentChat();

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

  setupAccountDropdown('student-account-dropdown', 'final-student-uid', populateStudentAccountDropdown);
  const manualUidInput = document.getElementById('manual-student-uid') as HTMLInputElement;
  const finalUidInput = document.getElementById('final-student-uid') as HTMLInputElement;
  if (manualUidInput && finalUidInput) {
    manualUidInput.addEventListener('input', () => { finalUidInput.value = manualUidInput.value.trim(); });
  }

  const markAttendanceForm = document.getElementById('mark-attendance-form') as HTMLFormElement;
  if (markAttendanceForm) {
    const dateInput = document.getElementById('attendance-date') as HTMLInputElement;
    if (dateInput) dateInput.valueAsDate = new Date();
    markAttendanceForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById('mark-attendance-error');
      const successEl = document.getElementById('mark-attendance-success');
      errorEl?.classList.add('hide');
      successEl?.classList.add('hide');
      const formData = new FormData(markAttendanceForm);
      const attendanceSelect = document.getElementById('attendance-student-select') as HTMLSelectElement;
      const attendanceStudentId = attendanceSelect.value;
      if (!attendanceStudentId) {
        if (errorEl) { errorEl.textContent = 'Please select a student'; errorEl.classList.remove('hide'); }
        return;
      }
      const attendanceData = {
        date: formData.get('date') as string,
        status: formData.get('status') as 'present' | 'absent' | 'late' | 'excused',
        notes: formData.get('notes') as string || '',
        markedBy: ''
      };
      try {
        showLoading();
        await markAttendance(attendanceStudentId, attendanceData);
        if (successEl) { successEl.textContent = 'Attendance marked successfully.'; successEl.classList.remove('hide'); }
        markAttendanceForm.reset();
        dateInput.valueAsDate = new Date();
        if (selectedStudentId === attendanceStudentId) await loadStudentAttendance(attendanceStudentId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to mark attendance';
        if (errorEl) { errorEl.textContent = 'Failed to mark attendance: ' + msg; errorEl.classList.remove('hide'); }
      } finally {
        hideLoading();
      }
    });
  }

  const attendanceStudentSelect = document.getElementById('attendance-student-select') as HTMLSelectElement | null;
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

  const dashboardStudentSelect = document.getElementById('dashboard-student-select') as HTMLSelectElement;
  const dashboardStudentSearch = document.getElementById('dashboard-student-search') as HTMLInputElement;
  const selectedStudentInfo = document.getElementById('selected-student-info');
  const selectedStudentNameEl = document.getElementById('selected-student-name');
  const selectedStudentIdEl = document.getElementById('selected-student-id');
  const clearStudentSelection = document.getElementById('clear-student-selection');
  const dashboardAttendanceCard = document.getElementById('dashboard-attendance-card');

  if (dashboardStudentSelect) {
    dashboardStudentSelect.addEventListener('change', async (e) => {
      const studentId = (e.target as HTMLSelectElement).value;
      if (studentId) {
        const student = currentStudents.find(s => s.id === studentId);
        if (student) {
          if (selectedStudentInfo && selectedStudentNameEl && selectedStudentIdEl) {
            selectedStudentNameEl.textContent = student.name;
            selectedStudentIdEl.textContent = `Member ID: ${student.memberId || 'N/A'}`;
            selectedStudentInfo.classList.remove('hide');
          }
          await Promise.all([loadStudentGrades(studentId), loadStudentAttendance(studentId)]);
          updateDashboardStatsForStudent(studentId);
        }
      } else {
        selectedStudentInfo?.classList.add('hide');
        dashboardAttendanceCard?.classList.add('hide');
        updateDashboardStats();
        await loadRecentActivity();
      }
    });
  }

  if (dashboardStudentSearch && dashboardStudentSelect) {
    const doSearch = debounce((searchTerm: string) => {
      filterStudentSelectOptions(dashboardStudentSelect, searchTerm);
      const visibleOptions = Array.from(dashboardStudentSelect.querySelectorAll('option')).filter(
        opt => opt.value !== '' && opt.style.display !== 'none'
      );
      if (visibleOptions.length === 1 && searchTerm) {
        dashboardStudentSelect.value = visibleOptions[0].value;
        dashboardStudentSelect.dispatchEvent(new Event('change'));
      }
    }, 200);
    dashboardStudentSearch.addEventListener('input', (e) => {
      doSearch((e.target as HTMLInputElement).value.toLowerCase().trim());
    });
  }

  if (clearStudentSelection) {
    clearStudentSelection.addEventListener('click', () => {
      if (dashboardStudentSelect) {
        dashboardStudentSelect.value = '';
        dashboardStudentSelect.dispatchEvent(new Event('change'));
      }
      if (dashboardStudentSearch) dashboardStudentSearch.value = '';
    });
  }

  const gradesStudentSearch = document.getElementById('grades-student-search') as HTMLInputElement;
  const studentSelectGrades = document.getElementById('student-select') as HTMLSelectElement;
  if (gradesStudentSearch && studentSelectGrades) {
    const doGradesSearch = debounce((searchTerm: string) => {
      filterStudentSelectOptions(studentSelectGrades, searchTerm);
    }, 200);
    gradesStudentSearch.addEventListener('input', (e) => {
      doGradesSearch((e.target as HTMLInputElement).value.toLowerCase().trim());
    });
  }

  const attendanceStudentSearch = document.getElementById('attendance-student-search') as HTMLInputElement;
  const attendanceSelectEl = document.getElementById('attendance-student-select') as HTMLSelectElement;
  if (attendanceStudentSearch && attendanceSelectEl) {
    const doAttendanceSearch = debounce((searchTerm: string) => {
      filterStudentSelectOptions(attendanceSelectEl, searchTerm);
    }, 200);
    attendanceStudentSearch.addEventListener('input', (e) => {
      doAttendanceSearch((e.target as HTMLInputElement).value.toLowerCase().trim());
    });
  }

  const studentProfileBtn = document.getElementById('student-profile-btn');
  if (studentProfileBtn) {
    studentProfileBtn.addEventListener('click', () => {
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hide'));
      document.getElementById('student-profile-content')?.classList.remove('hide');
      loadStudentProfile();
    });
  }
}

// --- Dashboard data loading ---
async function loadDashboardData(): Promise<void> {
  try {
    currentStudents = await fetchStudents();
    updateStudentSelect();
    updateDashboardStats();
    syncNavbarUidField();
    await Promise.all([
      loadRecentActivity(),
      loadRegisteredStudents(),
      loadRegisteredTeachers(),
      loadAllUsers(),
      populateStudentAccountDropdown(),
    ]);
  } catch { /* dashboard load error */ }
}

async function loadRegisteredStudents(): Promise<void> {
  const tableBody = document.getElementById('registered-students-table-body');
  if (!tableBody) return;
  try {
    const role = getCurrentUserRole();
    if (role !== 'admin' && role !== 'teacher') return;
    if (currentStudents.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-dark-300">No students registered yet</td></tr>';
      return;
    }
    tableBody.innerHTML = currentStudents.map(student => {
      const memberId = (student.memberId || '').toLowerCase().replace(/"/g, '&quot;');
      const name = (student.name || '').toLowerCase().replace(/"/g, '&quot;');
      const email = ((student as any).contactEmail || '').toLowerCase().replace(/"/g, '&quot;');
      return `
      <tr class="border-b border-dark-700 hover:bg-dark-800/50 transition-colors registered-student-row" data-member-id="${memberId}" data-name="${name}" data-email="${email}">
        <td class="py-3 px-4 text-white font-semibold">${student.memberId || 'N/A'}</td>
        <td class="py-3 px-4 text-white">${escapeHtml(student.name)}</td>
        <td class="py-3 px-4 text-center text-dark-300">${(student as any).yearOfBirth || 'N/A'}</td>
        <td class="py-3 px-4 text-dark-300 text-sm">
          ${(student as any).contactEmail || 'N/A'}<br>
          ${(student as any).contactPhone || ''}
        </td>
        <td class="py-3 px-4 text-center">
          <button type="button" data-lms-action="edit-student" data-student-id="${student.id}"
            class="px-3 py-1 rounded bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 transition-all text-sm mr-2">Edit</button>
          <button type="button" data-lms-action="delete-student" data-student-id="${student.id}"
            class="px-3 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all text-sm">Delete</button>
        </td>
      </tr>
    `;
    }).join('');
  } catch { /* registered students load error */ }
}

async function loadRegisteredTeachers(): Promise<void> {
  const tableBody = document.getElementById('registered-teachers-table-body');
  if (!tableBody) return;
  try {
    if (getCurrentUserRole() !== 'admin') return;
    const users = await fetchAllUsers();
    const teachers = users.filter((u: { role: string }) => u.role === 'teacher');
    if (teachers.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-dark-300">No teachers registered yet</td></tr>';
      return;
    }
    tableBody.innerHTML = teachers.map((t: any) => {
      const memberId = (t.memberId || '').toLowerCase().replace(/"/g, '&quot;');
      const name = (t.name || t.email || '').toLowerCase().replace(/"/g, '&quot;');
      const email = (t.email || '').toLowerCase().replace(/"/g, '&quot;');
      return `
      <tr class="border-b border-dark-700 hover:bg-dark-800/50 transition-colors registered-teacher-row" data-member-id="${memberId}" data-name="${name}" data-email="${email}">
        <td class="py-3 px-4 text-white font-semibold">${escapeHtml(t.memberId || 'N/A')}</td>
        <td class="py-3 px-4 text-white">${escapeHtml(t.name || t.email || 'N/A')}</td>
        <td class="py-3 px-4 text-center text-dark-300">${t.yearOfBirth ?? 'N/A'}</td>
        <td class="py-3 px-4 text-dark-300 text-sm">
          ${escapeHtml(t.email || 'N/A')}<br>${escapeHtml(t.phone || '')}
        </td>
        <td class="py-3 px-4 text-center">
          <button type="button" data-lms-action="delete-teacher" data-user-id="${t.uid}"
            class="px-3 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all text-sm">Delete</button>
        </td>
      </tr>
    `;
    }).join('');
  } catch { /* teacher load error */ }
}

async function loadAllUsers(): Promise<void> {
  const tableBody = document.getElementById('users-table-body');
  if (!tableBody) return;
  try {
    if (getCurrentUserRole() !== 'admin') return;
    tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-dark-300"><div class="loading-spinner mx-auto mb-2"></div>Loading users...</td></tr>';
    const users = await fetchAllUsers();
    if (users.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-dark-300">No users found</td></tr>';
      return;
    }
    const getRoleBadgeClass = (role: string) => {
      switch (role) {
        case 'admin': return 'bg-red-500/20 text-red-400';
        case 'teacher': return 'bg-blue-500/20 text-blue-400';
        case 'student': return 'bg-green-500/20 text-green-400';
        default: return 'bg-gray-500/20 text-gray-400';
      }
    };
    tableBody.innerHTML = users.map((user: any) => {
      const email = (user.email || '').toLowerCase().replace(/"/g, '&quot;');
      const name = (user.name || '').toLowerCase().replace(/"/g, '&quot;');
      return `
      <tr class="border-b border-dark-700 hover:bg-dark-800/50 transition-colors user-management-row" data-email="${email}" data-name="${name}">
        <td class="py-3 px-4 text-white">${escapeHtml(user.email)}</td>
        <td class="py-3 px-4 text-center">
          <span class="px-3 py-1 rounded-full text-xs font-semibold ${getRoleBadgeClass(user.role)}">
            ${user.role.charAt(0).toUpperCase() + user.role.slice(1)}
          </span>
        </td>
        <td class="py-3 px-4 text-center text-dark-400 text-xs font-mono">${user.uid}</td>
        <td class="py-3 px-4 text-center">
          <button type="button" data-lms-action="change-role" data-user-id="${user.uid}" data-user-role="${user.role}"
            class="px-3 py-1 rounded bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 transition-all text-sm">Change Role</button>
        </td>
      </tr>
    `;
    }).join('');
  } catch (error: any) {
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-red-400">Error loading users: ${escapeHtml(error?.message || '')}</td></tr>`;
    }
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

function setupAccountDropdown(containerId: string, hiddenInputId: string, populateCallback: () => Promise<void>): void {
  const container = document.getElementById(containerId);
  if (!container) return;
  const trigger = container.querySelector('.account-dropdown-trigger');
  const panel = container.querySelector('.account-dropdown-panel');
  const searchInput = container.querySelector('.account-dropdown-search') as HTMLInputElement | null;
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
    }, 200);
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
    if (role === 'teacher') users = users.filter((u: { role: string }) => u.role === 'student');
    (users as any[]).sort((a, b) => (a.email || '').localeCompare(b.email || ''));
    listEl.innerHTML = '';
    users.forEach((user: any) => {
      const displayText = user.email + (user.name ? ` (${user.name})` : '') + ` - ${user.role}`;
      const opt = document.createElement('div');
      opt.setAttribute('role', 'option');
      opt.setAttribute('data-uid', user.uid);
      opt.setAttribute('data-email', (user.email || '').toLowerCase());
      opt.setAttribute('data-name', (user.name || '').toLowerCase());
      opt.textContent = displayText;
      opt.className = 'px-4 py-2 cursor-pointer hover:bg-dark-700 text-white text-sm';
      listEl.appendChild(opt);
    });
    if (searchInput) {
      const q = (searchInput.value || '').toLowerCase().trim();
      filterAccountDropdownList(listEl, q);
    }
  } catch {
    listEl.innerHTML = '<div class="px-4 py-3 text-dark-400 text-sm">Cloud Functions not deployed - use manual entry</div>';
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
    (users as any[]).sort((a, b) => (a.email || '').localeCompare(b.email || ''));
    listEl.innerHTML = '';
    users.forEach((user: any) => {
      const displayText = (user.email || user.uid) + (user.name ? ` (${user.name})` : '') + ` - ${user.role}`;
      const opt = document.createElement('div');
      opt.setAttribute('role', 'option');
      opt.setAttribute('data-uid', user.uid);
      opt.setAttribute('data-email', (user.email || '').toLowerCase());
      opt.setAttribute('data-name', (user.name || '').toLowerCase());
      opt.textContent = displayText;
      opt.className = 'px-4 py-2 cursor-pointer hover:bg-dark-700 text-white text-sm';
      listEl.appendChild(opt);
    });
    if (searchInput) {
      const q = (searchInput.value || '').toLowerCase().trim();
      filterAccountDropdownList(listEl, q);
    }
  } catch {
    listEl.innerHTML = '<div class="px-4 py-3 text-dark-400 text-sm">Use manual UID entry below</div>';
  }
}

function filterStudentSelectOptions(selectEl: HTMLSelectElement, searchTerm: string): void {
  const q = searchTerm.toLowerCase();
  const options = selectEl.querySelectorAll('option');
  options.forEach(option => {
    if (option.value === '') return;
    const name = option.getAttribute('data-name') || '';
    const email = option.getAttribute('data-email') || '';
    const memberId = option.getAttribute('data-member-id') || '';
    const text = option.textContent?.toLowerCase() || '';
    option.style.display =
      !q || name.includes(q) || email.includes(q) || memberId.includes(q) || text.includes(q) ? '' : 'none';
  });
}

// --- Student dropdowns (registration, dashboard, attendance) ---
function updateStudentSelect(): void {
  const studentSelect = document.getElementById('student-select') as HTMLSelectElement;
  const attendanceStudentSelect = document.getElementById('attendance-student-select') as HTMLSelectElement;
  const dashboardStudentSelect = document.getElementById('dashboard-student-select') as HTMLSelectElement;

  studentSelect.innerHTML = '<option value="">-- Select a student --</option>';
  currentStudents.forEach(student => {
    const option = document.createElement('option');
    option.value = student.id;
    option.textContent = student.name + (student.memberId ? ` (ID: ${student.memberId})` : '');
    option.setAttribute('data-name', student.name.toLowerCase());
    option.setAttribute('data-email', ((student as any).contactEmail || '').toLowerCase());
    option.setAttribute('data-member-id', (student.memberId || '').toLowerCase());
    studentSelect.appendChild(option);
  });

  if (attendanceStudentSelect) {
    attendanceStudentSelect.innerHTML = '<option value="">-- Select a student --</option>';
    currentStudents.forEach(student => {
      const option = document.createElement('option');
      option.value = student.id;
      option.textContent = student.name + (student.memberId ? ` (ID: ${student.memberId})` : '');
      option.setAttribute('data-name', student.name.toLowerCase());
      option.setAttribute('data-email', ((student as any).contactEmail || '').toLowerCase());
      option.setAttribute('data-member-id', (student.memberId || '').toLowerCase());
      attendanceStudentSelect.appendChild(option);
    });
  }

  if (dashboardStudentSelect) {
    dashboardStudentSelect.innerHTML = '<option value="">-- Select a student --</option>';
    currentStudents.forEach(student => {
      const option = document.createElement('option');
      option.value = student.id;
      option.textContent = student.name + (student.memberId ? ` (ID: ${student.memberId})` : '');
      option.setAttribute('data-name', student.name.toLowerCase());
      option.setAttribute('data-email', ((student as any).contactEmail || '').toLowerCase());
      option.setAttribute('data-member-id', (student.memberId || '').toLowerCase());
      dashboardStudentSelect.appendChild(option);
    });
  }

  const userRole = getCurrentUserRole();
  if (userRole === 'student' && currentStudents.length === 1) {
    const ownRecord = currentStudents[0];
    studentSelect.value = ownRecord.id;
    selectedStudentId = ownRecord.id;
    if (attendanceStudentSelect) {
      attendanceStudentSelect.value = ownRecord.id;
      attendanceStudentSelect.disabled = true;
    }
    loadStudentGrades(ownRecord.id);
    loadStudentAttendance(ownRecord.id);
    studentSelect.disabled = true;
  } else {
    studentSelect.disabled = false;
    if (attendanceStudentSelect) attendanceStudentSelect.disabled = false;
  }
}

// --- Grades: load, display, charts; delete handlers ---
function showGradesSkeletonLoading(): void {
  const gradesTableBody = document.getElementById('grades-table-body');
  const chartsSection = document.getElementById('grade-charts-section');
  if (gradesTableBody) {
    const row = '<tr class="border-b border-dark-700"><td class="py-3 px-4"><div class="skeleton skeleton-text !w-[70%]"></div></td><td class="py-3 px-4"><div class="skeleton skeleton-text short"></div></td><td class="py-3 px-4"><div class="skeleton skeleton-text short mx-auto"></div></td><td class="py-3 px-4"><div class="skeleton skeleton-text short mx-auto"></div></td></tr>';
    gradesTableBody.innerHTML = row.repeat(5);
  }
  chartsSection?.classList.add('hide');
}

async function loadStudentGrades(studentId: string): Promise<void> {
  try {
    showGradesSkeletonLoading();
    if (gradesUnsubscribe) gradesUnsubscribe();
    gradesUnsubscribe = listenToGrades(studentId, (grades) => {
      currentGrades = grades;
      displayGrades(grades);
      loadRecentActivity();
      updateDashboardStats();
    });
  } catch {
    displayGrades([]);
  }
}

function displayGrades(grades: Grade[]): void {
  const gradesTableBody = document.getElementById('grades-table-body')!;
  const chartsSection = document.getElementById('grade-charts-section');

  if (grades.length === 0) {
    gradesTableBody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-dark-300">No grades recorded yet</td></tr>';
    chartsSection?.classList.add('hide');
    return;
  }
  chartsSection?.classList.remove('hide');

  const userRole = getCurrentUserRole();
  const showActions = userRole === 'teacher' || userRole === 'admin';

  gradesTableBody.innerHTML = grades.map(grade => {
    const percentage = ((grade.score / grade.totalPoints) * 100).toFixed(1);
    const percentageClass = parseFloat(percentage) >= 70 ? 'text-green-400' : 'text-red-400';
    return `
      <tr class="border-b border-dark-700 hover:bg-dark-800/50 transition-colors">
        <td class="py-3 px-4 text-white">${escapeHtml(grade.assignmentName)}</td>
        <td class="py-3 px-4 text-dark-300">${escapeHtml(grade.category)}</td>
        <td class="py-3 px-4 text-center text-white">${grade.score} / ${grade.totalPoints}</td>
        <td class="py-3 px-4 text-center font-semibold ${percentageClass}">${percentage}%</td>
        ${showActions && selectedStudentId ? `<td class="py-3 px-4 text-center"><button type="button" data-lms-action="delete-grade" data-student-id="${selectedStudentId}" data-grade-id="${grade.id}" class="px-3 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all text-sm">Delete</button></td>` : ''}
      </tr>`;
  }).join('');

  renderGradeCharts(grades);
}

let gradeTrendChart: any = null;
let categoryChart: any = null;

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
      padding: light ? { left: 6, right: 14, top: 12, bottom: 10 } : { left: 4, right: 12, top: 10, bottom: 8 },
    },
    plugins: { legend: { display: false } },
    scales,
  };
}

/**
 * Renders or updates grade trend and category charts. Destroys existing Chart instances first to avoid leaks.
 */
function renderGradeCharts(grades: Grade[]): void {
  if (typeof (window as any).Chart === 'undefined') return;
  const Chart = (window as any).Chart;

  const sortedGrades = [...grades].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const trendLabels = sortedGrades.map(g => g.assignmentName.length > 12 ? g.assignmentName.substring(0, 12) + '...' : g.assignmentName);
  const trendData = sortedGrades.map(g => ((g.score / g.totalPoints) * 100).toFixed(1));

  const categoryData: Record<string, { total: number; count: number }> = {};
  for (const grade of grades) {
    const cat = grade.category;
    if (!categoryData[cat]) categoryData[cat] = { total: 0, count: 0 };
    categoryData[cat].total += (grade.score / grade.totalPoints) * 100;
    categoryData[cat].count += 1;
  }
  const categoryLabels = Object.keys(categoryData);
  const categoryAverages = categoryLabels.map(cat => (categoryData[cat].total / categoryData[cat].count).toFixed(1));
  const categoryColors = ['#06b6d4', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#3b82f6'];

  const chartOptions = getGradeChartOptions() as any;
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
            datasets: [{ label: 'Grade %', data: trendData, borderColor: '#06b6d4', backgroundColor: 'rgba(6,182,212,0.1)', borderWidth: 2, fill: true, tension: 0.4, pointBackgroundColor: '#06b6d4', pointBorderColor: pointBorder, pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 6 }],
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
            datasets: [{ label: 'Average %', data: categoryAverages, backgroundColor: categoryLabels.map((_, i) => categoryColors[i % categoryColors.length]), borderRadius: 8, barThickness: 40 }],
          },
          options: { ...chartOptions, plugins: { ...chartOptions.plugins, tooltip: { callbacks: { label: (ctx: any) => `Average: ${ctx.raw}%` } } } },
        });
      } catch {
        categoryChart = null;
      }
    }
  }
}

(window as any).handleDeleteGrade = async (studentId: string, gradeId: string) => {
  if (!confirm('Are you sure you want to delete this grade?')) return;
  try { await deleteGrade(studentId, gradeId); } catch (error: any) { alert('Failed to delete grade: ' + error.message); }
};

(window as any).handleDeleteStudent = async (studentId: string) => {
  if (!confirm('Are you sure you want to delete this student? This will also delete all their grades and attendance records.')) return;
  try {
    await deleteStudent(studentId);
    await loadDashboardData();
    alert('Student deleted successfully');
  } catch (error: any) { alert('Failed to delete student: ' + error.message); }
};

(window as any).handleEditStudent = (studentId: string) => {
  const student = currentStudents.find(s => s.id === studentId);
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
  memberIdEl.value = (student.memberId || '');
  yearEl.value = String((student as any).yearOfBirth ?? '');
  phoneEl.value = (student as any).contactPhone || '';
  emailEl.value = (student as any).contactEmail || '';
  notesEl.value = (student as any).notes || '';
  modal.classList.remove('hide');
};

(window as any).handleDeleteTeacher = async (userId: string) => {
  if (!confirm('Remove this teacher? Their role will be set back to student.')) return;
  try {
    showLoading();
    await updateUserRoleDirect(userId, 'student');
    await loadRegisteredTeachers();
    hideLoading();
    alert('Teacher removed (role set to student).');
  } catch (err: any) {
    hideLoading();
    alert('Failed to remove teacher: ' + err?.message);
  }
};

(window as any).handleChangeRole = async (userId: string, currentRole: string) => {
  const newRole = prompt(`Change role for this user.\n\nCurrent role: ${currentRole}\n\nEnter new role (admin, teacher, or student):`, currentRole);
  if (!newRole) return;
  const roleNormalized = newRole.trim().toLowerCase();
  if (!['admin', 'teacher', 'student'].includes(roleNormalized)) { alert('Invalid role. Must be: admin, teacher, or student'); return; }
  if (roleNormalized === currentRole) { alert('No change - same role'); return; }
  try {
    showLoading();
    await updateUserRoleDirect(userId, roleNormalized as 'admin' | 'teacher' | 'student');
    await loadAllUsers();
    alert(`User role changed to ${roleNormalized}`);
  } catch (error: any) {
    alert('Failed to change role: ' + error.message);
  } finally { hideLoading(); }
};

// --- Dashboard stats & recent activity ---
function getLetterGrade(percentage: number): string {
  if (percentage >= 97) return 'A+';
  if (percentage >= 93) return 'A';
  if (percentage >= 90) return 'A-';
  if (percentage >= 87) return 'B+';
  if (percentage >= 83) return 'B';
  if (percentage >= 80) return 'B-';
  if (percentage >= 77) return 'C+';
  if (percentage >= 73) return 'C';
  if (percentage >= 70) return 'C-';
  if (percentage >= 67) return 'D+';
  if (percentage >= 63) return 'D';
  if (percentage >= 60) return 'D-';
  return 'F';
}

function getLetterGradeColor(letterGrade: string): string {
  if (letterGrade.startsWith('A')) return 'text-green-400';
  if (letterGrade.startsWith('B')) return 'text-blue-400';
  if (letterGrade.startsWith('C')) return 'text-yellow-400';
  if (letterGrade.startsWith('D')) return 'text-orange-400';
  return 'text-red-400';
}

function updateDashboardStats(): void {
  const totalStudentsEl = document.getElementById('stats-total-students');
  const avgGradeEl = document.getElementById('stats-avg-grade');
  const letterGradeEl = document.getElementById('stats-letter-grade');
  const gradeCountEl = document.getElementById('stats-grade-count');

  if (totalStudentsEl) totalStudentsEl.textContent = currentStudents.length.toString();

  if (avgGradeEl && currentGrades.length > 0) {
    const avgPercentage = currentGrades.reduce((sum, g) => sum + (g.score / g.totalPoints) * 100, 0) / currentGrades.length;
    avgGradeEl.textContent = avgPercentage.toFixed(1) + '%';
    if (gradeCountEl) gradeCountEl.textContent = `${currentGrades.length} assignment${currentGrades.length !== 1 ? 's' : ''}`;
    if (letterGradeEl) {
      const lg = getLetterGrade(avgPercentage);
      letterGradeEl.textContent = lg;
      letterGradeEl.className = `text-4xl font-bold ${getLetterGradeColor(lg)}`;
    }
  } else {
    if (avgGradeEl) avgGradeEl.textContent = '--';
    if (gradeCountEl) gradeCountEl.textContent = '0 assignments';
    if (letterGradeEl) {
      letterGradeEl.textContent = '--';
      letterGradeEl.className = 'text-4xl font-bold stats-letter-placeholder';
    }
  }
}

async function updateDashboardStatsForStudent(_studentId: string): Promise<void> {
  const dashboardAttendanceCard = document.getElementById('dashboard-attendance-card');
  const dashboardAttendanceRate = document.getElementById('dashboard-attendance-rate');
  const dashboardAttendancePresent = document.getElementById('dashboard-attendance-present');
  const dashboardAttendanceAbsent = document.getElementById('dashboard-attendance-absent');

  if (currentAttendance.length > 0) {
    const present = currentAttendance.filter(a => a.status === 'present').length;
    const absent = currentAttendance.filter(a => a.status === 'absent').length;
    const late = currentAttendance.filter(a => a.status === 'late').length;
    const excused = currentAttendance.filter(a => a.status === 'excused').length;
    const total = currentAttendance.length;
    const rate = total > 0 ? (((present + late + excused) / total) * 100).toFixed(1) : '0';

    dashboardAttendanceCard?.classList.remove('hide');
    if (dashboardAttendanceRate) {
      dashboardAttendanceRate.textContent = rate + '%';
      const rateNum = parseFloat(rate);
      dashboardAttendanceRate.className = `text-4xl font-bold ${rateNum >= 90 ? 'text-green-400' : rateNum >= 75 ? 'text-yellow-400' : 'text-red-400'}`;
    }
    if (dashboardAttendancePresent) dashboardAttendancePresent.textContent = `${present} Present`;
    if (dashboardAttendanceAbsent) dashboardAttendanceAbsent.textContent = `${absent} Absent`;
  } else {
    dashboardAttendanceCard?.classList.add('hide');
  }

  updateDashboardStats();
  await loadRecentActivity();
}

async function loadRecentActivity(): Promise<void> {
  const recentActivityEl = document.getElementById('recent-activity');
  if (!recentActivityEl) return;
  try {
    const userRole = getCurrentUserRole();
    let activities: Array<{ type: 'grade' | 'attendance'; date: Date; data: any }> = [];

    const hasStudent = (userRole === 'student' || userRole === 'admin' || userRole === 'teacher') && selectedStudentId;
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
      recentActivityEl.innerHTML = '<div class="glass-effect rounded-xl p-4 text-dark-300">No recent activity</div>';
      return;
    }

    recentActivityEl.innerHTML = activities.map(activity => {
      const dateStr = activity.date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      if (activity.type === 'grade') {
        const grade = activity.data as Grade;
        const percentage = ((grade.score / grade.totalPoints) * 100).toFixed(1);
        const cls = parseFloat(percentage) >= 70 ? 'text-green-400' : 'text-red-400';
        return `<div class="glass-effect rounded-xl p-4 hover:bg-dark-800/50 transition-colors"><div class="flex items-start justify-between"><div class="flex-1"><div class="flex items-center gap-2 mb-1"><svg class="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path></svg><span class="text-white font-semibold">${escapeHtml(grade.assignmentName)}</span></div><p class="text-dark-300 text-sm">${escapeHtml(grade.category)} &bull; ${grade.score}/${grade.totalPoints} (<span class="${cls}">${percentage}%</span>)</p></div><span class="text-dark-400 text-xs whitespace-nowrap ml-4">${dateStr}</span></div></div>`;
      } else {
        const att = activity.data as Attendance;
        const statusMap: Record<string, [string, string]> = {
          present: ['✓ Present', 'text-green-400'], absent: ['✗ Absent', 'text-red-400'],
          late: ['⏰ Late', 'text-yellow-400'], excused: ['📝 Excused', 'text-blue-400'],
        };
        const [badge, color] = statusMap[att.status] || ['Unknown', 'text-dark-300'];
        return `<div class="glass-effect rounded-xl p-4 hover:bg-dark-800/50 transition-colors"><div class="flex items-start justify-between"><div class="flex-1"><div class="flex items-center gap-2 mb-1"><svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg><span class="${color} font-semibold">${badge}</span></div><p class="text-dark-300 text-sm">${escapeHtml(att.notes || 'No notes')}</p></div><span class="text-dark-400 text-xs whitespace-nowrap ml-4">${dateStr}</span></div></div>`;
      }
    }).join('');
  } catch {
    recentActivityEl.innerHTML = '<div class="glass-effect rounded-xl p-4 text-red-400">Error loading recent activity</div>';
  }
}

function resetAppState(): void {
  currentStudents = [];
  currentGrades = [];
  selectedStudentId = null;
  if (gradesUnsubscribe) { gradesUnsubscribe(); gradesUnsubscribe = null;   }
}

// --- AI: performance summary, study tips, agent chat ---
async function generatePerformanceSummary(studentId: string): Promise<void> {
  const btn = document.getElementById('ai-summary-btn') as HTMLButtonElement | null;
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
  try {
    showLoading();
    const getPerformanceSummary = httpsCallable(functions, 'getPerformanceSummary', { timeout: 120_000 });
    const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Request timed out. The AI service may be busy — please try again.')), 120_000));
    const result = await Promise.race([getPerformanceSummary({ studentId }), timeoutPromise]);
    const data = result.data as any;
    showModal(`Performance Summary - ${data?.studentName ?? 'Student'}`, data?.summaryHtml ?? '<p>No summary generated.</p>');
  } catch (error: any) {
    alert(`Failed to generate summary: ${error.message || 'Unknown error occurred'}`);
  } finally {
    hideLoading();
    if (btn) { btn.disabled = false; btn.textContent = 'AI Performance Summary'; }
  }
}

async function generateStudyTips(studentId: string): Promise<void> {
  const btn = document.getElementById('study-tips-btn') as HTMLButtonElement | null;
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
  try {
    showLoading();
    const getStudyTips = httpsCallable(functions, 'getStudyTips', { timeout: 120_000 });
    const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Request timed out. The AI service may be busy — please try again.')), 120_000));
    const result = await Promise.race([getStudyTips({ studentId }), timeoutPromise]);
    const data = result.data as any;
    showModal(`Study Tips - ${data?.studentName ?? 'Student'}`, data?.tipsHtml ?? '<p>No study tips generated.</p>');
  } catch (error: any) {
    alert(`Failed to generate study tips: ${error.message || 'Unknown error occurred'}`);
  } finally {
    hideLoading();
    if (btn) { btn.disabled = false; btn.textContent = 'Get Study Tips'; }
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
  chatInput.addEventListener('input', syncAiInputMirror);
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
      const copyFn = (window as unknown as { copyAIResponse?: (b: HTMLElement, t: string) => void }).copyAIResponse;
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
      const data = result.data as any;
      removeTypingIndicator(typingId);
      const responseText = data?.response;
      addMessageToChat('assistant', typeof responseText === 'string' && responseText.trim() ? responseText : "Sorry, I didn't get a valid response. Please try again.");
      const assistantText = typeof responseText === 'string' && responseText.trim() ? responseText : '';
      conversationHistory.push({ user: message, assistant: assistantText });
      if (conversationHistory.length > 10) conversationHistory = conversationHistory.slice(-10);
    } catch (error: any) {
      removeTypingIndicator(typingId);
      addMessageToChat(
        'assistant',
        `Sorry, I encountered an error: ${escapeHtml(error.message || 'Unknown error')}. Please try again.`
      );
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
  (window as any).askAISuggestion = (query: string) => runQuickPrompt(query);

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
      messageDiv.innerHTML = `
        <div class="flex-1 flex justify-end"><div class="max-w-[85%]"><div class="rounded-2xl rounded-tr-sm p-4 bg-gradient-to-br from-primary-500/20 to-accent-500/10 border border-primary-500/30 shadow-lg shadow-primary-500/10 hover:shadow-primary-500/20 transition-shadow"><p class="ai-chat-user-text whitespace-pre-wrap leading-relaxed">${escapeHtml(content)}</p></div><p class="text-dark-500 text-xs mt-1.5 mr-2 text-right">${timestamp}</p></div></div>
        <div class="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/25"><svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg></div>`;
    } else {
      const msgId = `ai-msg-${Date.now()}`;
      const formattedContent = formatMarkdown(content);
      messageDiv.innerHTML = `
        <div class="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-lg shadow-primary-500/25"><svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg></div>
        <div class="flex-1 max-w-3xl">
          <div class="ai-message-content glass-effect rounded-2xl rounded-tl-sm p-5 border border-primary-500/20 hover:border-primary-500/30 transition-all group relative">
            <div class="ai-response-content" id="${msgId}"></div>
            <button type="button" data-lms-action="copy-ai-response" class="ai-copy-btn absolute top-3 right-3 p-2 rounded-lg bg-dark-800/80 hover:bg-dark-700 text-dark-400 hover:text-white transition-all" title="Copy response"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg></button>
          </div>
          <div class="flex items-center gap-3 mt-2 ml-2">
            <p class="text-dark-500 text-xs">${timestamp}</p>
            <span class="text-dark-600">&bull;</span>
            <span class="text-dark-500 text-xs flex items-center gap-1"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg>AI Assistant</span>
          </div>
        </div>`;
      const contentDiv = messageDiv.querySelector(`#${msgId}`);
      if (contentDiv) contentDiv.innerHTML = formattedContent;
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
    typingDiv.innerHTML = `
      <div class="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-lg shadow-primary-500/25 animate-pulse-slow"><svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg></div>
      <div class="flex-1 max-w-3xl"><div class="glass-effect rounded-2xl rounded-tl-sm p-5 border border-primary-500/20 ai-message-loading"><div class="flex items-center gap-4"><div class="flex gap-2"><div class="typing-dot w-3 h-3 bg-gradient-to-br from-primary-400 to-accent-400 rounded-full"></div><div class="typing-dot w-3 h-3 bg-gradient-to-br from-primary-400 to-accent-400 rounded-full"></div><div class="typing-dot w-3 h-3 bg-gradient-to-br from-primary-400 to-accent-400 rounded-full"></div></div><span class="text-dark-400 text-sm font-medium">Analyzing your student data...</span></div><p class="text-dark-500 text-xs mt-3 flex items-center gap-2"><svg class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>Querying Firebase database...</p></div></div>`;
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' });
    return typingId;
  }

  function removeTypingIndicator(typingId: string): void {
    document.getElementById(typingId)?.remove();
  }

  /**
   * Converts assistant plain text / light HTML into styled markup, then runs DOMPurify (XSS-safe for `innerHTML`).
   */
  function formatMarkdown(text: string): string {
    let html = text.trim();
    const hasHtmlTags = /<\/?(?:ul|ol|li|p|div|h[1-6]|strong|em|b|i|code|pre|blockquote|br|hr|span|a)[>\s]/i.test(html);

    if (hasHtmlTags) {
      html = html.replace(/<ul([^>]*)>/gi, '<ul class="space-y-2 my-4"$1>');
      html = html.replace(/<ol([^>]*)>/gi, '<ol class="space-y-2 my-4 list-decimal list-inside"$1>');
      html = html.replace(/<li([^>]*)>/gi, '<li class="flex items-start gap-3 text-dark-200 mb-2"$1><span class="w-2 h-2 bg-gradient-to-br from-primary-400 to-accent-400 rounded-full mt-2 flex-shrink-0"></span><span>');
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
      html = html.replace(/<code([^>]*)>/gi, '<code class="px-2 py-0.5 bg-dark-800 rounded text-accent-400 text-sm font-mono"$1>');
      html = html.replace(/<pre([^>]*)>/gi, '<pre class="bg-dark-900/80 rounded-xl p-4 my-3 overflow-x-auto border border-dark-700"$1>');
      html = html.replace(/<blockquote([^>]*)>/gi, '<blockquote class="border-l-4 border-primary-500 pl-4 py-2 my-3 bg-primary-500/5 rounded-r-lg italic text-dark-300"$1>');
      html = html.replace(/>\s*\n+\s*</g, '> <');
      html = html.replace(/>([^<]+)</g, (_match, content) => {
        let styled = content.replace(/(\d+(?:\.\d+)?%)/g, '<span class="text-accent-400 font-semibold">$1</span>');
        styled = styled.replace(/(\d+\/\d+)/g, '<span class="text-primary-400 font-medium">$1</span>');
        return `>${styled}<`;
      });
      return sanitizeHTML(html);
    }

    html = html.replace(/^### (.+)$/gm, '<h4 class="text-lg font-bold mt-4 mb-2 flex items-center gap-2"><span class="w-1.5 h-1.5 bg-accent-400 rounded-full"></span>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3 class="text-xl font-bold mt-5 mb-3 pb-2 border-b border-primary-500/20">$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2 class="text-2xl font-bold bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent mt-4 mb-3">$1</h2>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong class="font-semibold">$1</strong>');
    html = html.replace(/(?<![*_])([*_])(?![*_])(.+?)(?<![*_])\1(?![*_])/g, '<em class="text-primary-300 italic">$2</em>');
    html = html.replace(/```(\w+)?\n?([\s\S]*?)```/g, '<pre class="bg-dark-900/80 rounded-xl p-4 my-3 overflow-x-auto border border-dark-700"><code class="text-accent-300 text-sm font-mono">$2</code></pre>');
    html = html.replace(/`([^`]+)`/g, '<code class="px-2 py-0.5 bg-dark-800 rounded text-accent-400 text-sm font-mono">$1</code>');
    html = html.replace(/^\* (.+)$/gm, '<div class="flex items-start gap-3 mb-2"><span class="w-2 h-2 bg-gradient-to-br from-primary-400 to-accent-400 rounded-full mt-2 flex-shrink-0"></span><span class="text-dark-200">$1</span></div>');
    html = html.replace(/^- (.+)$/gm, '<div class="flex items-start gap-3 mb-2"><span class="w-2 h-2 bg-gradient-to-br from-primary-400 to-accent-400 rounded-full mt-2 flex-shrink-0"></span><span class="text-dark-200">$1</span></div>');
    html = html.replace(/^(\d+)\. (.+)$/gm, (_match, num, content) => `<div class="flex items-start gap-3 mb-2"><span class="w-6 h-6 bg-gradient-to-br from-primary-500/20 to-accent-500/20 rounded-lg flex items-center justify-center text-xs font-bold text-primary-400 flex-shrink-0">${num}</span><span class="text-dark-200">${content}</span></div>`);
    html = html.replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-primary-500 pl-4 py-2 my-3 bg-primary-500/5 rounded-r-lg italic text-dark-300">$1</blockquote>');
    html = html.replace(/^---$/gm, '<hr class="my-4 border-dark-700">');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary-400 hover:text-primary-300 underline" target="_blank">$1</a>');
    html = html.replace(/(\d+(?:\.\d+)?%)/g, '<span class="text-accent-400 font-semibold">$1</span>');
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

  if (clearChatBtn) {
    clearChatBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear the chat history?')) {
        conversationHistory = [];
        if (messagesContainer) {
          const welcomeMsg = messagesContainer.querySelector('.flex.items-start.gap-3');
          messagesContainer.innerHTML = '';
          if (welcomeMsg) messagesContainer.appendChild(welcomeMsg);
        }
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
  } catch {
    displayAttendance([]);
    updateAttendanceStats([]);
  }
}

function displayAttendance(attendance: Attendance[]): void {
  const attendanceTableBody = document.getElementById('attendance-history-body')!;
  if (attendance.length === 0) {
    attendanceTableBody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-dark-300">No attendance records yet</td></tr>';
    return;
  }
  attendanceTableBody.innerHTML = attendance.map(record => {
    const date = new Date(record.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const student = currentStudents.find(s => s.id === record.studentId);
    const studentName = student ? student.name : 'Unknown';
    const badges: Record<string, string> = {
      present: '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-green-500/20 text-green-400">✓ Present</span>',
      absent: '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-red-500/20 text-red-400">✗ Absent</span>',
      late: '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-yellow-500/20 text-yellow-400">⏰ Late</span>',
      excused: '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-400">📝 Excused</span>',
    };
    return `
      <tr class="border-b border-dark-700 hover:bg-dark-800/50 transition-colors">
        <td class="py-3 px-4 text-white">${date}</td>
        <td class="py-3 px-4 text-dark-300">${escapeHtml(studentName)}</td>
        <td class="py-3 px-4 text-center">${badges[record.status] || ''}</td>
        <td class="py-3 px-4 text-dark-400 text-sm">${escapeHtml(record.notes || '-')}</td>
      </tr>`;
  }).join('');
}

function updateAttendanceStats(attendance: Attendance[]): void {
  const total = attendance.length;
  const present = attendance.filter(a => a.status === 'present').length;
  const absent = attendance.filter(a => a.status === 'absent').length;
  const late = attendance.filter(a => a.status === 'late').length;
  const excused = attendance.filter(a => a.status === 'excused').length;
  const rate = total > 0 ? (((present + late + excused) / total) * 100).toFixed(1) : '0';

  const totalEl = document.getElementById('attendance-total');
  const presentEl = document.getElementById('attendance-present');
  const absentEl = document.getElementById('attendance-absent');
  const rateEl = document.getElementById('attendance-rate');
  if (totalEl) totalEl.textContent = total.toString();
  if (presentEl) presentEl.textContent = present.toString();
  if (absentEl) absentEl.textContent = absent.toString();
  if (rateEl) rateEl.textContent = rate + '%';
}

// --- Student profile & UID display ---
let passwordToggleInitialized = false;

function loadStudentProfile(): void {
  if (getCurrentUserRole() !== 'student') return;
  const user = auth.currentUser;
  if (!user) return;
  const student = currentStudents.find(s => s.studentUid === user.uid);
  if (!student) return;

  const fields: Record<string, string> = {
    'profile-name': student.name || '--',
    'profile-member-id': student.memberId || 'Not assigned',
    'profile-year-of-birth': student.yearOfBirth ? student.yearOfBirth.toString() : '--',
    'profile-uid': user.uid,
    'profile-email': user.email || '--',
    'profile-contact-phone': student.contactPhone || 'Not provided',
    'profile-contact-email': student.contactEmail || 'Not provided',
  };
  for (const [id, val] of Object.entries(fields)) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  const profileNotes = document.getElementById('profile-notes');
  const profileNotesSection = document.getElementById('profile-notes-section');
  if (profileNotes && profileNotesSection) {
    if (student.notes?.trim()) {
      profileNotes.textContent = student.notes;
      profileNotesSection.classList.remove('hide');
    } else {
      profileNotesSection.classList.add('hide');
    }
  }

  const passwordInput = document.getElementById('profile-password') as HTMLInputElement;
  const togglePasswordBtn = document.getElementById('toggle-password-visibility');
  const passwordEyeIcon = document.getElementById('password-eye-icon');

  if (passwordInput && togglePasswordBtn && passwordEyeIcon && !passwordToggleInitialized) {
    let passwordVisible = false;
    togglePasswordBtn.addEventListener('click', () => {
      passwordVisible = !passwordVisible;
      if (passwordVisible) {
        passwordInput.type = 'text';
        passwordInput.value = 'Password cannot be displayed';
        passwordInput.classList.add('text-yellow-400');
        passwordEyeIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path>';
      } else {
        passwordInput.type = 'password';
        passwordInput.value = '••••••••••••';
        passwordInput.classList.remove('text-yellow-400');
        passwordEyeIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>';
      }
    });
    passwordToggleInitialized = true;
  }
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
  const safeUid = escapeHtml(uid);
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
        <button type="button" id="account-id-modal-close-btn" class="px-6 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-semibold rounded-lg hover:from-primary-600 hover:to-primary-700 transition-all shadow-lg">Close</button>
      </div>
    </div>`;

  showModal('My Account ID', modalHtml);

  window.setTimeout(() => {
    const cpBtn = document.getElementById('account-id-modal-copy-btn');
    const uidInput = document.getElementById('account-id-modal-uid-input') as HTMLInputElement | null;
    const closeBtn = document.getElementById('account-id-modal-close-btn');
    if (cpBtn && uidInput) {
      cpBtn.addEventListener('click', () => {
        uidInput.select();
        void navigator.clipboard.writeText(uid).then(
          () => {
            const orig = cpBtn.textContent;
            cpBtn.textContent = '✓ Copied!';
            window.setTimeout(() => {
              cpBtn.textContent = orig || 'Copy';
            }, 2000);
          },
          () => alert('Failed to copy. Please select and copy manually.')
        );
      });
    }
    closeBtn?.addEventListener('click', () => {
      closeModal();
    });
  }, 0);
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
        <p class="text-dark-300 text-sm">Welcome, <strong class="text-white">${escapeHtml(email)}</strong></p>
      </div>
      <div class="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <p class="text-blue-400 font-semibold mb-2">Your Account ID (UID)</p>
        <p class="text-dark-300 text-sm mb-3">You MUST share this ID with your teacher/admin so they can register you in the system.</p>
        <div class="relative">
          <input type="text" id="uid-display" value="${uid}" readonly class="w-full px-4 py-3 pr-24 rounded-lg bg-dark-800 border border-dark-600 text-white font-mono text-sm focus:outline-none focus:border-primary-500">
          <button id="copy-uid-btn" class="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded text-sm font-semibold transition-all">Copy</button>
        </div>
        <p class="text-xs text-dark-400 mt-2">Click "Copy" and send this ID to your teacher via email or message.</p>
      </div>
      <div class="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
        <p class="text-yellow-400 font-semibold mb-2">Next Steps:</p>
        <ol class="text-dark-300 text-sm space-y-1 ml-4 list-decimal">
          <li>Copy your Account ID using the button above</li>
          <li>Send it to your teacher/administrator</li>
          <li>Wait for them to register you in the system</li>
          <li>Log back in to see your grades and attendance</li>
        </ol>
      </div>
      <div class="text-center">
        <button id="close-uid-modal-btn" class="px-6 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-semibold rounded-lg hover:from-primary-600 hover:to-primary-700 transition-all shadow-lg">I've Copied My ID</button>
      </div>
    </div>`;

  showModal('Account Created!', modalHtml, {
    onDismiss: () => {
      showAuthContainer();
      void signOut(auth).catch(() => {
        /* best-effort; do not await — InPrivate can stall auth promises */
      });
    },
  });

  setTimeout(() => {
    const cpBtn = document.getElementById('copy-uid-btn');
    const uidInput = document.getElementById('uid-display') as HTMLInputElement;
    const closeBtn = document.getElementById('close-uid-modal-btn');
    if (cpBtn && uidInput) {
      cpBtn.addEventListener('click', () => {
        uidInput.select();
        navigator.clipboard.writeText(uid).then(() => {
          cpBtn.textContent = '✓ Copied!';
          cpBtn.classList.add('bg-green-500', 'hover:bg-green-600');
          cpBtn.classList.remove('bg-primary-500', 'hover:bg-primary-600');
          setTimeout(() => {
            cpBtn.textContent = 'Copy';
            cpBtn.classList.remove('bg-green-500', 'hover:bg-green-600');
            cpBtn.classList.add('bg-primary-500', 'hover:bg-primary-600');
          }, 2000);
        }).catch(() => alert('Failed to copy. Please select and copy manually.'));
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        try {
          closeModal();
        } catch {
          /* InPrivate / blocked storage: still close the modal */
        }
      });
    }
  }, 100);
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
      void init()
        .catch(() => {
          showBootstrapError('The app failed to finish loading. Please refresh the page or try again later.');
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
