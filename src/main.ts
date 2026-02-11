/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MAIN APPLICATION ENTRY POINT
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Central orchestration point for the entire LMS application. Coordinates
 * authentication, UI updates, data loading, and user interactions across
 * all modules.
 * 
 * ════════════════════════════════════════════════════════════════════════════
 * APPLICATION ARCHITECTURE OVERVIEW
 * ════════════════════════════════════════════════════════════════════════════
 * 
 * MODULE ORGANIZATION:
 * 
 * main.ts (THIS FILE) ← Application orchestrator
 *    │
 *    ├── firebase.ts         ← Firebase SDK initialization
 *    ├── config.ts           ← Firebase configuration
 *    ├── auth.ts             ← Authentication logic
 *    ├── data.ts             ← Data access layer (Firestore)
 *    ├── ui.ts               ← UI state management
 *    └── types.ts            ← TypeScript type definitions
 * 
 * INITIALIZATION FLOW:
 * 
 * 1. DOM Ready
 *    └── init() called
 *        ├── initUI() - Set up UI event listeners
 *        ├── initAuth() - Set up auth state listener
 *        ├── setupAuthForms() - Login/signup forms
 *        └── setupAppForms() - Application forms
 * 
 * 2. Auth State Change (user logs in)
 *    └── handleAuthStateChange(user)
 *        ├── showAppContainer() - Hide login, show app
 *        ├── configureUIForRole(user) - Show/hide role-based UI
 *        ├── loadDashboardData() - Load initial data
 *        │   ├── fetchStudents()
 *        │   ├── updateStudentSelect()
 *        │   ├── updateDashboardStats()
 *        │   ├── loadRecentActivity()
 *        │   ├── loadRegisteredStudents()
 *        │   ├── loadAllUsers()
 *        │   └── populateStudentAccountDropdown()
 *        └── Set default tab to dashboard
 * 
 * 3. User Interaction (e.g., select student)
 *    └── Event Handler
 *        ├── loadStudentGrades(studentId)
 *        │   └── listenToGrades() - Real-time listener
 *        ├── loadStudentAttendance(studentId)
 *        └── updateDashboardStatsForStudent(studentId)
 * 
 * ════════════════════════════════════════════════════════════════════════════
 * STATE MANAGEMENT
 * ════════════════════════════════════════════════════════════════════════════
 * 
 * APPLICATION STATE:
 * 
 * - currentStudents: Student[]
 *   All students user can access (role-based filtering)
 *   Updated when: User logs in, admin creates/deletes student
 * 
 * - currentGrades: Grade[]
 *   Grades for currently selected student
 *   Updated when: Student selected, teacher adds/deletes grade (real-time)
 * 
 * - currentAttendance: Attendance[]
 *   Attendance for currently selected student
 *   Updated when: Student selected, teacher marks attendance
 * 
 * - selectedStudentId: string | null
 *   ID of currently selected student in dropdowns
 *   Used for: Loading grades, attendance, and student-specific data
 * 
 * - gradesUnsubscribe: (() => void) | null
 *   Unsubscribe function for real-time grade listener
 *   IMPORTANT: Must be called when switching students to prevent memory leaks
 * 
 * STATE SYNCHRONIZATION:
 * 
 * Data flows in one direction:
 * Firestore → State Variables → UI Display
 * 
 * Real-time updates:
 * Firestore Change → onSnapshot Callback → Update State → Re-render UI
 * 
 * ════════════════════════════════════════════════════════════════════════════
 * ROLE-BASED FEATURES
 * ════════════════════════════════════════════════════════════════════════════
 * 
 * ADMIN FEATURES:
 * - Dashboard with all students
 * - Student registration form
 * - User management table
 * - Student account dropdown population
 * - Change user roles
 * - Delete students
 * - Mark attendance
 * - Add/edit/delete grades
 * - AI Agent conversational assistant
 * 
 * TEACHER FEATURES:
 * - Dashboard with assigned students only
 * - Mark attendance for their students
 * - Add/edit/delete grades for their students
 * - View student profiles
 * - Export grades to CSV
 * 
 * STUDENT FEATURES:
 * - Dashboard with own data only
 * - View own grades (read-only)
 * - View own attendance (read-only)
 * - AI performance summary
 * - AI study tips
 * - Student profile view
 * - UID display for sharing with admin
 * 
 * ════════════════════════════════════════════════════════════════════════════
 * EVENT HANDLING PATTERNS
 * ════════════════════════════════════════════════════════════════════════════
 * 
 * FORM SUBMISSIONS:
 * 1. preventDefault() to stop page reload
 * 2. Clear previous errors
 * 3. Get FormData from form
 * 4. Validate input
 * 5. Show loading indicator
 * 6. Call async function (auth, data operation, AI request)
 * 7. Handle success (show message, reset form, reload data)
 * 8. Handle error (show error message)
 * 9. Hide loading indicator (in finally block)
 * 
 * DROPDOWN CHANGES:
 * 1. Get selected value
 * 2. Update selectedStudentId state
 * 3. Load related data (grades, attendance)
 * 4. Update UI displays
 * 5. For students: Dropdown is auto-selected and disabled
 * 
 * REAL-TIME LISTENERS:
 * 1. Unsubscribe from previous listener (if exists)
 * 2. Set up new onSnapshot listener
 * 3. Store unsubscribe function
 * 4. Update state when data changes
 * 5. Re-render UI
 * 
 * ════════════════════════════════════════════════════════════════════════════
 * AI INTEGRATION
 * ════════════════════════════════════════════════════════════════════════════
 * 
 * AI FEATURES:
 * 
 * 1. Performance Summary (Student)
 *    - Analyzes grades and attendance
 *    - Provides personalized feedback
 *    - Identifies strengths and weaknesses
 *    - Suggests improvements
 * 
 * 2. Study Tips (Student)
 *    - Analyzes performance by category
 *    - Provides targeted study recommendations
 *    - Suggests time management strategies
 *    - Personalized learning resources
 * 
 * 3. AI Agent Chat (Admin)
 *    - Conversational assistant
 *    - Answers questions about students
 *    - Provides insights and analysis
 *    - Access to all student data
 *    - Maintains conversation history
 * 
 * AI CALL FLOW:
 * 1. User clicks AI button
 * 2. Show loading indicator
 * 3. Call Cloud Function (getPerformanceSummary, getStudyTips, aiAgentChat)
 * 4. Cloud Function:
 *    a. Verifies authentication
 *    b. Checks permissions
 *    c. Fetches student data from Firestore
 *    d. Calls Gemini AI API
 *    e. Returns formatted HTML response
 * 5. Display response in modal
 * 6. Hide loading indicator
 * 
 * ════════════════════════════════════════════════════════════════════════════
 * DEBUGGING GUIDE
 * ════════════════════════════════════════════════════════════════════════════
 * 
 * COMMON ISSUES:
 * 
 * 1. "Students don't show up"
 *    CHECK:
 *    - User is authenticated (getCurrentUser())
 *    - User role is correct (/users/{uid}/role)
 *    - Student records exist in Firestore
 *    - For students: studentUid field matches their UID
 *    - For teachers: studentIds array in courses includes them
 *    - Firestore security rules allow read access
 *    - Console logs from fetchStudents()
 * 
 * 2. "Grades don't load"
 *    CHECK:
 *    - Student is selected (selectedStudentId is not null)
 *    - Grades exist in /students/{studentId}/grades
 *    - Real-time listener is set up (gradesUnsubscribe is set)
 *    - No permission-denied errors in console
 *    - Network tab shows Firestore queries
 * 
 * 3. "AI features don't work"
 *    CHECK:
 *    - Cloud Functions are deployed
 *    - GEMINI_API_KEY is set in Functions config
 *    - Network requests to Cloud Functions succeed
 *    - Console shows no CORS errors
 *    - Functions logs (firebase functions:log)
 *    - Student has grades (AI needs data to analyze)
 * 
 * 4. "UI doesn't update after data change"
 *    CHECK:
 *    - Real-time listener is active (for grades)
 *    - State variables are updated
 *    - Display functions are called after state update
 *    - No JavaScript errors in console
 *    - DOM elements exist (check IDs)
 * 
 * 5. "Student can't see their data after admin creates record"
 *    CHECK:
 *    - studentUid in record matches student's Firebase Auth UID exactly
 *    - Student logged out and back in (to refresh session)
 *    - Firestore security rules allow read where studentUid == request.auth.uid
 *    - No typos in UID (case-sensitive)
 * 
 * 6. "Memory leaks / app slows down"
 *    CHECK:
 *    - Real-time listeners are unsubscribed when switching students
 *    - gradesUnsubscribe() is called before setting new listener
 *    - No infinite loops in event handlers
 *    - Chrome DevTools → Performance tab
 * 
 * DEBUGGING TOOLS:
 * 
 * - Chrome DevTools → Console: Error messages and logs
 * - Chrome DevTools → Network: Firestore queries and responses
 * - Chrome DevTools → Application: Inspect auth tokens and storage
 * - Chrome DevTools → Elements: Inspect DOM and CSS classes
 * - Firebase Console → Firestore: View/edit data directly
 * - Firebase Console → Functions: View function logs
 * - Firebase Console → Authentication: View users and sessions
 * 
 * LOGGING CONVENTIONS:
 * 
 * - ✅ Green checkmark: Success operations
 * - ❌ Red X: Error conditions
 * - 🔍 Magnifying glass: Data queries/searches
 * - 📊 Chart: Data loading
 * - 🤖 Robot: AI operations
 * - 💡 Lightbulb: Informational tips
 * - ⚠️ Warning: Non-critical warnings
 * - 🔐 Lock: Authentication/security
 * - 🎉 Party: Special events (signup, etc.)
 * 
 * ════════════════════════════════════════════════════════════════════════════
 * PERFORMANCE OPTIMIZATION
 * ════════════════════════════════════════════════════════════════════════════
 * 
 * OPTIMIZATIONS IMPLEMENTED:
 * 
 * - Real-time listeners only for actively viewed data
 * - Firestore queries limited (limit(20), limit(30))
 * - DOM element references cached
 * - Event delegation where possible
 * - Loading indicators prevent duplicate requests
 * - Unsubscribe from listeners when not needed
 * 
 * POTENTIAL IMPROVEMENTS:
 * 
 * - Implement pagination for large datasets
 * - Add IndexedDB caching layer
 * - Debounce search inputs
 * - Lazy load tabs
 * - Virtual scrolling for long lists
 * - Service worker for offline support
 * 
 * ════════════════════════════════════════════════════════════════════════════
 * SECURITY CONSIDERATIONS
 * ════════════════════════════════════════════════════════════════════════════
 * 
 * CLIENT-SIDE SECURITY:
 * - Role checks before sensitive operations
 * - Form validation before submission
 * - XSS prevention (no innerHTML with user input)
 * - CSRF protection (Firebase handles tokens)
 * 
 * SERVER-SIDE SECURITY:
 * - Firestore security rules (ultimate authority)
 * - Cloud Functions authentication checks
 * - API key protection (server-side only)
 * - Input validation in Cloud Functions
 * 
 * IMPORTANT:
 * Never trust client-side security alone!
 * All security must be enforced server-side via:
 * - Firestore security rules
 * - Cloud Functions authentication checks
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Import Firebase initialization (must be first to initialize services)
import './firebase';
import { auth } from './firebase';
import { initAuth, signUp, signIn, logout } from './auth';
import { ParticleSystem } from './particles';
import {
  initUI,
  showAuthContainer,
  showAppContainer,
  configureUIForRole,
  showError,
  clearError,
  showModal,
  loginForm,
  signupForm,
  logoutBtn,
  loginError,
  signupError,
  getCurrentUserRole,
  sanitizeHTML  // SECURITY: Import sanitizeHTML for XSS protection
} from './ui';
import {
  fetchStudents,
  addGrade,
  deleteGrade,
  listenToGrades,
  exportGradesToCSV,
  fetchAttendance,
  markAttendance
} from './data';
import { User, Student, Grade, Attendance } from './types';
import { initAssessments, loadAssessments } from './assessment-ui';
import { initClasses, loadClasses } from './classes-ui';

// Application state
let currentStudents: Student[] = [];
let currentGrades: Grade[] = [];
let currentAttendance: Attendance[] = [];
let selectedStudentId: string | null = null;
let gradesUnsubscribe: (() => void) | null = null;

// Initialize the application
async function init(): Promise<void> {
  // Initialize UI event listeners
  initUI();

  // Initialize authentication state
  initAuth(handleAuthStateChange);

  // Setup form handlers
  setupAuthForms();
  setupAppForms();

  // Initialize assessment module
  initAssessments();
  initClasses();

  // Listen for tab switches to load data
  document.addEventListener('tab-switched', async (e: any) => {
    const tab = e.detail?.tab;
    if (tab === 'classes') {
      await loadClasses();
    }
    if (tab === 'attendance' && selectedStudentId) {
      // Load attendance when switching to attendance tab
      await loadStudentAttendance(selectedStudentId);
    } else if (tab === 'dashboard') {
      // Reload recent activity when switching to dashboard
      await loadRecentActivity();
    } else     if (tab === 'assessments') {
      await loadAssessments();
    }
    if (tab === 'users') {
      await loadAllUsers();
    }
    if (tab === 'teacher-registration') {
      await loadRegisteredTeachers();
      await populateTeacherAccountDropdown();
    }
  });

  // Initialize particles
  try {
    new ParticleSystem('background-canvas');
  } catch {
    // Background canvas not found or already initialized
  }
}

// Handle authentication state changes
async function handleAuthStateChange(user: User | null): Promise<void> {
  if (user) {
    // User is logged in
    showAppContainer();
    configureUIForRole(user);

    // Update sidebar user info
    const userRole = getCurrentUserRole();
    if (typeof (window as any).updateSidebarUserInfo === 'function') {
      (window as any).updateSidebarUserInfo(user.email, userRole);
    }

    // Load initial data
    await loadDashboardData();

    // Ensure dashboard is the default active tab
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.add('hide');
    });
    const dashboardContent = document.getElementById('dashboard-content');
    if (dashboardContent) {
      dashboardContent.classList.remove('hide');
    }

    // Ensure dashboard tab button is active (old tabs)
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('tab-active');
      btn.classList.add('text-dark-300');
    });
    const dashboardTabBtn = document.querySelector('.tab-btn[data-tab="dashboard"]');
    if (dashboardTabBtn) {
      dashboardTabBtn.classList.add('tab-active');
      dashboardTabBtn.classList.remove('text-dark-300');
    }

    // Ensure sidebar nav item is active (new sidebar)
    document.querySelectorAll('.lms-nav-item[data-tab]').forEach(item => {
      item.classList.remove('active');
    });
    const dashboardNavItem = document.querySelector('.lms-nav-item[data-tab="dashboard"]');
    if (dashboardNavItem) {
      dashboardNavItem.classList.add('active');
    }

    // Update breadcrumb
    const breadcrumb = document.getElementById('breadcrumb-current');
    if (breadcrumb) {
      breadcrumb.textContent = 'Dashboard';
    }
  } else {
    // User is logged out
    showAuthContainer();
    resetAppState();
  }
}

// Setup authentication form handlers
function setupAuthForms(): void {
  // Login form
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError(loginError);

    const formData = new FormData(loginForm);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      await signIn(email, password);
      loginForm.reset();
    } catch (error: any) {
      showError(loginError, error.message);
    }
  });

  // Signup form
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError(signupError);

    const formData = new FormData(signupForm);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    // Validate passwords match
    if (password !== confirmPassword) {
      showError(signupError, 'Passwords do not match');
      return;
    }

    try {
      const uid = await signUp(email, password);

      // Show UID to user immediately after signup
      showUidModal(uid, email);

      signupForm.reset();
    } catch (error: any) {
      showError(signupError, error.message);
    }
  });

  // Logout button
  logoutBtn.addEventListener('click', async () => {
    try {
      await logout();
    } catch (error: any) {
      alert('Logout failed: ' + error.message);
    }
  });
}

// Setup application form handlers
function setupAppForms(): void {
  // Student Registration Form (Admin only)
  const studentRegForm = document.getElementById('student-registration-form') as HTMLFormElement;
  if (studentRegForm) {
    studentRegForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const errorEl = document.getElementById('registration-error')!;
      const successEl = document.getElementById('registration-success')!;
      errorEl.classList.add('hide');
      successEl.classList.add('hide');

      const formData = new FormData(studentRegForm);

      const studentData = {
        name: formData.get('studentName') as string,
        memberId: (formData.get('memberId') as string) || '',
        yearOfBirth: parseInt(formData.get('yearOfBirth') as string),
        contactPhone: formData.get('contactPhone') as string,
        contactEmail: formData.get('contactEmail') as string,
        studentUid: formData.get('studentUid') as string, // Link to Firebase Auth UID
        parentUid: formData.get('studentUid') as string, // Same as studentUid for now
        notes: formData.get('notes') as string || ''
      };

      try {
        const { showLoading } = await import('./ui');
        const { createStudent } = await import('./data');

        showLoading();

        const studentId = await createStudent(studentData);

        successEl.textContent = `✅ Student "${studentData.name}" registered successfully! (ID: ${studentId})`;
        successEl.classList.remove('hide');

        studentRegForm.reset();

        // Reload students list
        await loadDashboardData();
        await loadRegisteredStudents();

      } catch (error: any) {
        console.error('Error registering student:', error);
        errorEl.textContent = 'Failed to register student: ' + error.message;
        errorEl.classList.remove('hide');
      } finally {
        const { hideLoading } = await import('./ui');
        hideLoading();
      }
    });
  }

  // Teacher Registration Form (Admin only) - same pattern as student registration
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
        const { showLoading, hideLoading } = await import('./ui');
        const { createTeacher } = await import('./data');
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
        await loadRegisteredTeachers();
      } catch (error: unknown) {
        const { hideLoading } = await import('./ui');
        hideLoading();
        const msg = error instanceof Error ? error.message : String(error);
        if (errorEl) {
          errorEl.textContent = 'Failed to register teacher: ' + msg;
          errorEl.classList.remove('hide');
        }
      }
    });
  }

  // Teacher account dropdown vs manual UID (same as student)
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
  const teacherAccountSelect = document.getElementById('teacher-account-select') as HTMLSelectElement;
  const finalTeacherUidInput = document.getElementById('final-teacher-uid') as HTMLInputElement;
  if (teacherAccountSelect && finalTeacherUidInput) {
    teacherAccountSelect.addEventListener('change', () => {
      finalTeacherUidInput.value = teacherAccountSelect.value;
    });
  }
  const manualTeacherUidInput = document.getElementById('manual-teacher-uid') as HTMLInputElement;
  if (manualTeacherUidInput && finalTeacherUidInput) {
    manualTeacherUidInput.addEventListener('input', () => {
      finalTeacherUidInput.value = manualTeacherUidInput.value.trim();
    });
  }
  const refreshTeacherAccountsBtn = document.getElementById('refresh-teacher-accounts-btn');
  if (refreshTeacherAccountsBtn) {
    refreshTeacherAccountsBtn.addEventListener('click', () => populateTeacherAccountDropdown());
  }

  // Student selection
  const studentSelect = document.getElementById('student-select') as HTMLSelectElement;
  studentSelect.addEventListener('change', (e) => {
    const target = e.target as HTMLSelectElement;
    selectedStudentId = target.value;

    // Show/hide PDF report buttons
    const pdfSection = document.getElementById('pdf-report-section');
    if (pdfSection) {
      if (selectedStudentId) {
        pdfSection.classList.remove('hide');
      } else {
        pdfSection.classList.add('hide');
      }
    }

    if (selectedStudentId) {
      loadStudentGrades(selectedStudentId);
    } else {
      displayGrades([]);
    }
  });

  // Grade entry form (Teacher/Admin only)
  const gradeEntryForm = document.getElementById('grade-entry-form') as HTMLFormElement;
  if (gradeEntryForm) {
    gradeEntryForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!selectedStudentId) {
        alert('Please select a student first');
        return;
      }

      const formData = new FormData(gradeEntryForm);
      const gradeData = {
        assignmentName: formData.get('assignmentName') as string,
        category: formData.get('category') as any,
        score: parseFloat(formData.get('score') as string),
        totalPoints: parseFloat(formData.get('totalPoints') as string),
        teacherId: '', // Will be set by addGrade function
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

  // Export CSV button
  const exportCsvBtn = document.getElementById('export-csv-btn');
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
      if (currentGrades.length === 0) {
        alert('No grades to export. Please select a student with grades.');
        return;
      }

      const student = currentStudents.find(s => s.id === selectedStudentId);
      const studentName = student ? student.name : 'Unknown';

      exportGradesToCSV(currentGrades, studentName);
    });
  }

  // AI Summary button (Student only)
  const aiSummaryBtn = document.getElementById('ai-summary-btn');
  if (aiSummaryBtn) {
    aiSummaryBtn.addEventListener('click', async () => {
      if (!selectedStudentId) {
        alert('Please select a student first');
        return;
      }

      await generatePerformanceSummary(selectedStudentId);
    });
  }

  // Study Tips button (Student only)
  const studyTipsBtn = document.getElementById('study-tips-btn');
  if (studyTipsBtn) {
    studyTipsBtn.addEventListener('click', async () => {
      if (!selectedStudentId) {
        alert('Please select a student first');
        return;
      }

      await generateStudyTips(selectedStudentId);
    });
  }

  // Refresh Users button (Admin only)
  const refreshUsersBtn = document.getElementById('refresh-users-btn');
  if (refreshUsersBtn) {
    refreshUsersBtn.addEventListener('click', async () => {
      await loadAllUsers();
    });
  }

  // Refresh Accounts button for student registration
  const refreshAccountsBtn = document.getElementById('refresh-accounts-btn');
  if (refreshAccountsBtn) {
    refreshAccountsBtn.addEventListener('click', async () => {
      await populateStudentAccountDropdown();
    });
  }

  // AI Agent Chat (Admin only)
  setupAIAgentChat();

  // Toggle between dropdown and manual UID input
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

  // Sync dropdown selection to hidden field
  const accountSelect = document.getElementById('student-account-select') as HTMLSelectElement;
  const finalUidInput = document.getElementById('final-student-uid') as HTMLInputElement;

  if (accountSelect && finalUidInput) {
    accountSelect.addEventListener('change', () => {
      finalUidInput.value = accountSelect.value;
    });
  }

  // Sync manual input to hidden field
  const manualUidInput = document.getElementById('manual-student-uid') as HTMLInputElement;
  if (manualUidInput && finalUidInput) {
    manualUidInput.addEventListener('input', () => {
      finalUidInput.value = manualUidInput.value.trim();
    });
  }

  // Mark Attendance Form (Teacher/Admin only)
  const markAttendanceForm = document.getElementById('mark-attendance-form') as HTMLFormElement;
  if (markAttendanceForm) {
    // Set today's date as default
    const dateInput = document.getElementById('attendance-date') as HTMLInputElement;
    if (dateInput) {
      dateInput.valueAsDate = new Date();
    }

    markAttendanceForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const errorEl = document.getElementById('mark-attendance-error')!;
      const successEl = document.getElementById('mark-attendance-success')!;
      errorEl.classList.add('hide');
      successEl.classList.add('hide');

      const formData = new FormData(markAttendanceForm);
      const studentSelect = document.getElementById('attendance-student-select') as HTMLSelectElement;
      const attendanceStudentId = studentSelect.value;

      if (!attendanceStudentId) {
        errorEl.textContent = 'Please select a student';
        errorEl.classList.remove('hide');
        return;
      }

      const attendanceData = {
        date: formData.get('date') as string,
        status: formData.get('status') as 'present' | 'absent' | 'late' | 'excused',
        notes: formData.get('notes') as string || '',
        markedBy: '' // Will be filled by the backend
      };

      try {
        const { showLoading } = await import('./ui');
        showLoading();

        await markAttendance(attendanceStudentId, attendanceData);

        successEl.textContent = '✅ Attendance marked successfully!';
        successEl.classList.remove('hide');

        markAttendanceForm.reset();
        dateInput.valueAsDate = new Date();

        // Reload attendance if viewing this student
        if (selectedStudentId === attendanceStudentId) {
          await loadStudentAttendance(attendanceStudentId);
        }

      } catch (error: any) {
        console.error('Error marking attendance:', error);
        errorEl.textContent = 'Failed to mark attendance: ' + error.message;
        errorEl.classList.remove('hide');
      } finally {
        const { hideLoading: hide } = await import('./ui');
        hide();
      }
    });
  }

  // Attendance student selector change
  const attendanceStudentSelect = document.getElementById('attendance-student-select') as HTMLSelectElement;
  if (attendanceStudentSelect) {
    attendanceStudentSelect.addEventListener('change', async (e) => {
      const target = e.target as HTMLSelectElement;
      const studentId = target.value;

      if (studentId) {
        await loadStudentAttendance(studentId);
      } else {
        displayAttendance([]);
      }
    });
  }

  // Refresh Attendance button
  const refreshAttendanceBtn = document.getElementById('refresh-attendance-btn');
  if (refreshAttendanceBtn) {
    refreshAttendanceBtn.addEventListener('click', async () => {
      const attendanceStudentSelect = document.getElementById('attendance-student-select') as HTMLSelectElement;
      const studentId = attendanceStudentSelect.value;
      if (studentId) {
        await loadStudentAttendance(studentId);
      }
    });
  }

  // Dashboard student selection (Admin/Teacher)
  const dashboardStudentSelect = document.getElementById('dashboard-student-select') as HTMLSelectElement;
  const dashboardStudentSearch = document.getElementById('dashboard-student-search') as HTMLInputElement;
  const selectedStudentInfo = document.getElementById('selected-student-info');
  const selectedStudentNameEl = document.getElementById('selected-student-name');
  const selectedStudentIdEl = document.getElementById('selected-student-id');
  const clearStudentSelection = document.getElementById('clear-student-selection');
  const dashboardAttendanceCard = document.getElementById('dashboard-attendance-card');

  // Dashboard student select change
  if (dashboardStudentSelect) {
    dashboardStudentSelect.addEventListener('change', async (e) => {
      const target = e.target as HTMLSelectElement;
      const studentId = target.value;

      if (studentId) {
        const student = currentStudents.find(s => s.id === studentId);
        if (student) {
          // Show selected student info
          if (selectedStudentInfo && selectedStudentNameEl && selectedStudentIdEl) {
            selectedStudentNameEl.textContent = student.name;
            selectedStudentIdEl.textContent = `Member ID: ${student.memberId || 'N/A'}`;
            selectedStudentInfo.classList.remove('hide');
          }

          // Load student data
          await loadStudentGrades(studentId);
          await loadStudentAttendance(studentId);

          // Update dashboard stats for selected student
          updateDashboardStatsForStudent(studentId);
        }
      } else {
        // Clear selection
        if (selectedStudentInfo) {
          selectedStudentInfo.classList.add('hide');
        }
        if (dashboardAttendanceCard) {
          dashboardAttendanceCard.classList.add('hide');
        }
        // Reset to overall stats
        updateDashboardStats();
        await loadRecentActivity();
      }
    });
  }

  // Dashboard student search
  if (dashboardStudentSearch && dashboardStudentSelect) {
    dashboardStudentSearch.addEventListener('input', (e) => {
      const searchTerm = (e.target as HTMLInputElement).value.toLowerCase().trim();
      const options = dashboardStudentSelect.querySelectorAll('option');

      options.forEach(option => {
        if (option.value === '') {
          // Keep the default option visible
          return;
        }

        const name = option.getAttribute('data-name') || '';
        const memberId = option.getAttribute('data-member-id') || '';
        const text = option.textContent?.toLowerCase() || '';

        if (searchTerm === '' || name.includes(searchTerm) || memberId.includes(searchTerm) || text.includes(searchTerm)) {
          option.style.display = '';
        } else {
          option.style.display = 'none';
        }
      });

      // If search matches exactly one option, highlight it
      const visibleOptions = Array.from(options).filter(opt => opt.style.display !== 'none' && opt.value !== '');
      if (visibleOptions.length === 1 && searchTerm) {
        dashboardStudentSelect.value = visibleOptions[0].value;
        dashboardStudentSelect.dispatchEvent(new Event('change'));
      }
    });
  }

  // Clear student selection button
  if (clearStudentSelection) {
    clearStudentSelection.addEventListener('click', () => {
      if (dashboardStudentSelect) {
        dashboardStudentSelect.value = '';
        dashboardStudentSelect.dispatchEvent(new Event('change'));
      }
      if (dashboardStudentSearch) {
        dashboardStudentSearch.value = '';
      }
    });
  }

  // Student Profile button (Student only)
  const studentProfileBtn = document.getElementById('student-profile-btn');
  if (studentProfileBtn) {
    studentProfileBtn.addEventListener('click', () => {
      // Hide all tab contents
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hide');
      });

      // Show student profile content
      const profileContent = document.getElementById('student-profile-content');
      if (profileContent) {
        profileContent.classList.remove('hide');
      }

      // Load student profile data
      loadStudentProfile();
    });
  }

}

/**
 * Load dashboard data based on user role
 * 
 * DEBUG: If dashboard is empty, check:
 * 1. User is authenticated (check console logs)
 * 2. Firestore security rules allow read access
 * 3. Student records exist in database
 */
async function loadDashboardData(): Promise<void> {
  try {
    // Load students
    currentStudents = await fetchStudents();

    // Update student dropdown
    updateStudentSelect();

    // Update dashboard stats
    updateDashboardStats();

    // Load recent activity for dashboard
    await loadRecentActivity();

    // Load registered students table if on registration tab
    await loadRegisteredStudents();

    // Load registered teachers table for teacher registration tab
    await loadRegisteredTeachers();

    // Load users table if on user management tab
    await loadAllUsers();

    // Populate student account dropdown for registration
    await populateStudentAccountDropdown();

    // Display UID for students in dashboard
    displayStudentUid();

  } catch (error) {
    console.error('Error loading dashboard data:', error);
  }
}

// Load registered students for the registration tab
async function loadRegisteredStudents(): Promise<void> {
  const tableBody = document.getElementById('registered-students-table-body');
  if (!tableBody) return;

  try {
    const { getCurrentUserRole } = await import('./ui');
    const role = getCurrentUserRole();

    // Only show for admins
    if (role !== 'admin') return;

    if (currentStudents.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-8 text-dark-300">
            No students registered yet
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = currentStudents.map(student => `
      <tr class="border-b border-dark-700 hover:bg-dark-800/50 transition-colors">
        <td class="py-3 px-4 text-white font-semibold">${student.memberId || 'N/A'}</td>
        <td class="py-3 px-4 text-white">${student.name}</td>
        <td class="py-3 px-4 text-center text-dark-300">${(student as any).yearOfBirth || 'N/A'}</td>
        <td class="py-3 px-4 text-dark-300 text-sm">
          ${(student as any).contactEmail || 'N/A'}<br>
          ${(student as any).contactPhone || ''}
        </td>
        <td class="py-3 px-4 text-center">
          <button 
            onclick="handleDeleteStudent('${student.id}')"
            class="px-3 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all text-sm"
          >
            Delete
          </button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Error loading registered students:', error);
  }
}

// Load registered teachers for the Teacher Registration tab
async function loadRegisteredTeachers(): Promise<void> {
  const tableBody = document.getElementById('registered-teachers-table-body');
  if (!tableBody) return;

  try {
    const { getCurrentUserRole } = await import('./ui');
    const role = getCurrentUserRole();
    if (role !== 'admin') return;

    const { fetchAllUsers } = await import('./data');
    const users = await fetchAllUsers();
    const teachers = users.filter((u: { role: string }) => u.role === 'teacher');

    if (teachers.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-8 text-dark-300">No teachers registered yet</td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = teachers.map((t: { uid: string; email?: string; name?: string; memberId?: string; phone?: string; yearOfBirth?: number }) => `
      <tr class="border-b border-dark-700 hover:bg-dark-800/50 transition-colors">
        <td class="py-3 px-4 text-white font-semibold">${escapeHtml((t as any).memberId || 'N/A')}</td>
        <td class="py-3 px-4 text-white">${escapeHtml((t as any).name || t.email || 'N/A')}</td>
        <td class="py-3 px-4 text-center text-dark-300">${(t as any).yearOfBirth ?? 'N/A'}</td>
        <td class="py-3 px-4 text-dark-300 text-sm">
          ${escapeHtml((t as any).email || 'N/A')}<br>${escapeHtml((t as any).phone || '')}
        </td>
        <td class="py-3 px-4 text-center">
          <button onclick="handleDeleteTeacher('${t.uid}')"
            class="px-3 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all text-sm">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Error loading registered teachers:', error);
  }
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// Load all users for the User Management tab
async function loadAllUsers(): Promise<void> {
  const tableBody = document.getElementById('users-table-body');
  if (!tableBody) return;

  try {
    const { getCurrentUserRole } = await import('./ui');
    const role = getCurrentUserRole();

    // Only load for admins
    if (role !== 'admin') return;

    const { fetchAllUsers } = await import('./data');

    tableBody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center py-8 text-dark-300">
          <div class="loading-spinner mx-auto mb-2"></div>
          Loading users...
        </td>
      </tr>
    `;

    const users = await fetchAllUsers();

    if (users.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="4" class="text-center py-8 text-dark-300">
            No users found
          </td>
        </tr>
      `;
      return;
    }

    // Get role badge color
    const getRoleBadgeClass = (role: string) => {
      switch (role) {
        case 'admin': return 'bg-red-500/20 text-red-400';
        case 'teacher': return 'bg-blue-500/20 text-blue-400';
        case 'student': return 'bg-green-500/20 text-green-400';
        default: return 'bg-gray-500/20 text-gray-400';
      }
    };

    tableBody.innerHTML = users.map((user: { uid: string; email: string; role: string }) => `
      <tr class="border-b border-dark-700 hover:bg-dark-800/50 transition-colors">
        <td class="py-3 px-4 text-white">${user.email}</td>
        <td class="py-3 px-4 text-center">
          <span class="px-3 py-1 rounded-full text-xs font-semibold ${getRoleBadgeClass(user.role)}">
            ${user.role.charAt(0).toUpperCase() + user.role.slice(1)}
          </span>
        </td>
        <td class="py-3 px-4 text-center text-dark-400 text-xs font-mono">${user.uid}</td>
        <td class="py-3 px-4 text-center">
          <button 
            onclick="handleChangeRole('${user.uid}', '${user.role}')"
            class="px-3 py-1 rounded bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 transition-all text-sm"
          >
            Change Role
          </button>
        </td>
      </tr>
    `).join('');

  } catch (error) {
    console.error('Error loading users:', error);
    tableBody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center py-8 text-red-400">
          Error loading users: ${(error as any).message}
        </td>
      </tr>
    `;
  }
}

/**
 * Populate student account dropdown with all registered users from Firestore
 * 
 * PURPOSE: Let admins link a student record to an existing Firebase Auth account
 * Uses direct Firestore read (fetchAllUsers); no Cloud Functions required.
 */
async function populateStudentAccountDropdown(): Promise<void> {
  const accountSelect = document.getElementById('student-account-select') as HTMLSelectElement;
  if (!accountSelect) return;

  try {
    const { getCurrentUserRole } = await import('./ui');
    const role = getCurrentUserRole();

    // Only populate for admins
    if (role !== 'admin') return;

    const { fetchAllUsers } = await import('./data');
    const users = await fetchAllUsers();

    // Clear existing options except the default
    accountSelect.innerHTML = '<option value="">-- Select Registered Account --</option>';

    // Add all users (sorted by email)
    users.sort((a: { email: string }, b: { email: string }) => a.email.localeCompare(b.email));

    users.forEach((user: { uid: string; email: string; role: string } & { name?: string }) => {
      const option = document.createElement('option');
      option.value = user.uid;

      let displayText = user.email;
      if (user.name) {
        displayText += ` (${user.name})`;
      }
      displayText += ` - ${user.role}`;

      option.textContent = displayText;
      accountSelect.appendChild(option);
    });

  } catch (error: any) {
    console.warn('Could not load accounts for dropdown:', error?.message);

    // Update dropdown to show helpful message
    accountSelect.innerHTML = '<option value="">Cloud Functions not deployed - use manual entry</option>';
  }
}

/** Populate teacher account dropdown (same as student, for Teacher Registration tab). */
async function populateTeacherAccountDropdown(): Promise<void> {
  const accountSelect = document.getElementById('teacher-account-select') as HTMLSelectElement;
  if (!accountSelect) return;

  try {
    const { getCurrentUserRole } = await import('./ui');
    if (getCurrentUserRole() !== 'admin') return;

    const { fetchAllUsers } = await import('./data');
    const users = await fetchAllUsers();
    accountSelect.innerHTML = '<option value="">-- Select Registered Account --</option>';
    users.sort((a: { email: string }, b: { email: string }) => (a.email || '').localeCompare(b.email || ''));
    users.forEach((user: { uid: string; email: string; role: string; name?: string }) => {
      const option = document.createElement('option');
      option.value = user.uid;
      let displayText = user.email || user.uid;
      if (user.name) displayText += ` (${user.name})`;
      displayText += ` - ${user.role}`;
      option.textContent = displayText;
      accountSelect.appendChild(option);
    });
  } catch {
    accountSelect.innerHTML = '<option value="">Use manual UID entry below</option>';
  }
}

/**
 * Update student selection dropdown with loaded students
 * 
 * STUDENT AUTO-SELECT: If user is a student, automatically select their own record
 * 
 * DEBUG: If student dropdown isn't populated, check:
 * 1. currentStudents array has data (check console logs from fetchStudents)
 * 2. HTML elements 'student-select' and 'attendance-student-select' exist
 * 3. For students: their record exists in currentStudents array
 */
function updateStudentSelect(): void {

  const studentSelect = document.getElementById('student-select') as HTMLSelectElement;
  const attendanceStudentSelect = document.getElementById('attendance-student-select') as HTMLSelectElement;
  const dashboardStudentSelect = document.getElementById('dashboard-student-select') as HTMLSelectElement;

  // Clear existing options (except the default)
  studentSelect.innerHTML = '<option value="">-- Select a student --</option>';

  // Add student options to grades dropdown
  currentStudents.forEach(student => {
    const option = document.createElement('option');
    option.value = student.id;
    option.textContent = student.name + (student.memberId ? ` (ID: ${student.memberId})` : '');
    studentSelect.appendChild(option);
  });

  // Also update attendance student select
  if (attendanceStudentSelect) {
    attendanceStudentSelect.innerHTML = '<option value="">-- Select a student --</option>';
    currentStudents.forEach(student => {
      const option = document.createElement('option');
      option.value = student.id;
      option.textContent = student.name + (student.memberId ? ` (ID: ${student.memberId})` : '');
      attendanceStudentSelect.appendChild(option);
    });
  }

  // Update dashboard student select (admin/teacher only)
  if (dashboardStudentSelect) {
    dashboardStudentSelect.innerHTML = '<option value="">-- Select a student --</option>';
    currentStudents.forEach(student => {
      const option = document.createElement('option');
      option.value = student.id;
      option.textContent = student.name + (student.memberId ? ` (ID: ${student.memberId})` : '');
      option.setAttribute('data-name', student.name.toLowerCase());
      option.setAttribute('data-member-id', (student.memberId || '').toLowerCase());
      dashboardStudentSelect.appendChild(option);
    });
  }

  // AUTO-SELECT for students: If user is a student, select their own record automatically
  const userRole = getCurrentUserRole();

  if (userRole === 'student' && currentStudents.length === 1) {
    // Student should only have 1 record (their own)
    const ownRecord = currentStudents[0];

    // Set the dropdown value
    studentSelect.value = ownRecord.id;
    selectedStudentId = ownRecord.id;

    // Also set attendance dropdown if it exists
    if (attendanceStudentSelect) {
      attendanceStudentSelect.value = ownRecord.id;
      attendanceStudentSelect.disabled = true;
    }

    // Automatically load their grades and attendance
    loadStudentGrades(ownRecord.id);
    loadStudentAttendance(ownRecord.id);

    // Disable the dropdown so they can't change it
    studentSelect.disabled = true;
  } else {
    // Enable dropdown for admin/teacher
    studentSelect.disabled = false;
    if (attendanceStudentSelect) {
      attendanceStudentSelect.disabled = false;
    }
  }

  // Initialize PDF report buttons after dropdown is populated
  setTimeout(() => {
    if (typeof (window as any).setupPDFReportGeneration === 'function') {
      (window as any).setupPDFReportGeneration();
    }
  }, 100);
}

// Show skeleton loading state for grades table
function showGradesSkeletonLoading(): void {
  const gradesTableBody = document.getElementById('grades-table-body');
  const chartsSection = document.getElementById('grade-charts-section');

  if (gradesTableBody) {
    const skeletonRows = Array(5).fill(0).map(() => `
      <tr class="border-b border-dark-700">
        <td class="py-3 px-4"><div class="skeleton skeleton-text" style="width: 70%;"></div></td>
        <td class="py-3 px-4"><div class="skeleton skeleton-text short"></div></td>
        <td class="py-3 px-4"><div class="skeleton skeleton-text short" style="margin: 0 auto;"></div></td>
        <td class="py-3 px-4"><div class="skeleton skeleton-text short" style="margin: 0 auto;"></div></td>
      </tr>
    `).join('');

    gradesTableBody.innerHTML = skeletonRows;
  }

  // Hide charts during loading
  if (chartsSection) {
    chartsSection.classList.add('hide');
  }
}

// Load grades for a specific student
async function loadStudentGrades(studentId: string): Promise<void> {
  try {
    // Show skeleton loading
    showGradesSkeletonLoading();

    // Unsubscribe from previous listener
    if (gradesUnsubscribe) {
      gradesUnsubscribe();
    }

    // Set up real-time listener for grades
    gradesUnsubscribe = listenToGrades(studentId, (grades) => {
      currentGrades = grades;
      displayGrades(grades);
      // Update recent activity when grades change
      loadRecentActivity();
      // Update dashboard stats
      updateDashboardStats();
    });

  } catch (error) {
    console.error('Error loading student grades:', error);
    displayGrades([]);
  }
}

// Display grades in the table
function displayGrades(grades: Grade[]): void {
  const gradesTableBody = document.getElementById('grades-table-body')!;
  const chartsSection = document.getElementById('grade-charts-section');

  if (grades.length === 0) {
    gradesTableBody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-8 text-dark-300">
          No grades recorded yet
        </td>
      </tr>
    `;
    // Hide charts when no grades
    if (chartsSection) {
      chartsSection.classList.add('hide');
    }
    return;
  }

  // Show charts section
  if (chartsSection) {
    chartsSection.classList.remove('hide');
  }

  const userRole = getCurrentUserRole();
  const showActions = userRole === 'teacher' || userRole === 'admin';

  gradesTableBody.innerHTML = grades.map(grade => {
    const percentage = ((grade.score / grade.totalPoints) * 100).toFixed(1);
    const percentageClass = parseFloat(percentage) >= 70 ? 'text-green-400' : 'text-red-400';

    return `
      <tr class="border-b border-dark-700 hover:bg-dark-800/50 transition-colors">
        <td class="py-3 px-4 text-white">${grade.assignmentName}</td>
        <td class="py-3 px-4 text-dark-300">${grade.category}</td>
        <td class="py-3 px-4 text-center text-white">${grade.score} / ${grade.totalPoints}</td>
        <td class="py-3 px-4 text-center font-semibold ${percentageClass}">${percentage}%</td>
        ${showActions ? `
          <td class="py-3 px-4 text-center">
            <button 
              onclick="handleDeleteGrade('${selectedStudentId}', '${grade.id}')"
              class="px-3 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all text-sm"
            >
              Delete
            </button>
          </td>
        ` : ''}
      </tr>
    `;
  }).join('');

  // Render charts
  renderGradeCharts(grades);
}

// Chart instance references for cleanup
let gradeTrendChart: any = null;
let categoryChart: any = null;

// Render grade visualization charts
function renderGradeCharts(grades: Grade[]): void {
  // Check if Chart.js is available
  if (typeof (window as any).Chart === 'undefined') {
    // Chart.js not loaded, skipping chart rendering
    return;
  }

  const Chart = (window as any).Chart;

  // Prepare data for trend chart (sorted by date)
  const sortedGrades = [...grades].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const trendLabels = sortedGrades.map((g) => g.assignmentName.substring(0, 12) + (g.assignmentName.length > 12 ? '...' : ''));
  const trendData = sortedGrades.map(g => ((g.score / g.totalPoints) * 100).toFixed(1));

  // Prepare data for category chart
  const categoryData: { [key: string]: { total: number; count: number } } = {};
  grades.forEach(grade => {
    const cat = grade.category;
    if (!categoryData[cat]) {
      categoryData[cat] = { total: 0, count: 0 };
    }
    categoryData[cat].total += (grade.score / grade.totalPoints) * 100;
    categoryData[cat].count += 1;
  });

  const categoryLabels = Object.keys(categoryData);
  const categoryAverages = categoryLabels.map(cat =>
    (categoryData[cat].total / categoryData[cat].count).toFixed(1)
  );

  // Color palette
  const categoryColors = [
    '#06b6d4', // Cyan
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#8b5cf6', // Purple
    '#ef4444', // Red
    '#3b82f6', // Blue
  ];

  // Common chart options for dark theme
  const darkThemeOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(255, 255, 255, 0.05)',
        },
        ticks: {
          color: 'rgba(255, 255, 255, 0.6)',
          maxRotation: 45,
          minRotation: 0,
        },
      },
      y: {
        beginAtZero: true,
        max: 100,
        grid: {
          color: 'rgba(255, 255, 255, 0.05)',
        },
        ticks: {
          color: 'rgba(255, 255, 255, 0.6)',
          callback: (value: number) => value + '%',
        },
      },
    },
  };

  // Render Trend Chart
  const trendCanvas = document.getElementById('grade-trend-chart') as HTMLCanvasElement;
  if (trendCanvas) {
    // Destroy existing chart
    if (gradeTrendChart) {
      gradeTrendChart.destroy();
    }

    const ctx = trendCanvas.getContext('2d');
    if (ctx) {
      gradeTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: trendLabels,
          datasets: [{
            label: 'Grade %',
            data: trendData,
            borderColor: '#06b6d4',
            backgroundColor: 'rgba(6, 182, 212, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointBackgroundColor: '#06b6d4',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
          }],
        },
        options: darkThemeOptions,
      });
    }
  }

  // Render Category Chart
  const categoryCanvas = document.getElementById('category-chart') as HTMLCanvasElement;
  if (categoryCanvas) {
    // Destroy existing chart
    if (categoryChart) {
      categoryChart.destroy();
    }

    const ctx = categoryCanvas.getContext('2d');
    if (ctx) {
      categoryChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: categoryLabels,
          datasets: [{
            label: 'Average %',
            data: categoryAverages,
            backgroundColor: categoryLabels.map((_, i) => categoryColors[i % categoryColors.length]),
            borderRadius: 8,
            barThickness: 40,
          }],
        },
        options: {
          ...darkThemeOptions,
          plugins: {
            ...darkThemeOptions.plugins,
            tooltip: {
              callbacks: {
                label: (context: any) => `Average: ${context.raw}%`,
              },
            },
          },
        },
      });
    }
  }

}

// Delete grade handler (exposed to window for onclick)
(window as any).handleDeleteGrade = async (studentId: string, gradeId: string) => {
  if (!confirm('Are you sure you want to delete this grade?')) {
    return;
  }

  try {
    await deleteGrade(studentId, gradeId);
  } catch (error: any) {
    alert('Failed to delete grade: ' + error.message);
  }
};

// Delete student handler (exposed to window for onclick)
(window as any).handleDeleteStudent = async (studentId: string) => {
  if (!confirm('Are you sure you want to delete this student? This will also delete all their grades and attendance records.')) {
    return;
  }

  try {
    const { deleteStudent } = await import('./data');
    await deleteStudent(studentId);

    // Reload data
    await loadDashboardData();

    alert('Student deleted successfully');
  } catch (error: any) {
    alert('Failed to delete student: ' + error.message);
  }
};

// Delete teacher (demote to student) - for Registered Teachers table
(window as any).handleDeleteTeacher = async (userId: string) => {
  if (!confirm('Remove this teacher? Their role will be set back to student.')) return;
  try {
    const { updateUserRoleDirect } = await import('./data');
    const { showLoading, hideLoading } = await import('./ui');
    showLoading();
    await updateUserRoleDirect(userId, 'student');
    await loadRegisteredTeachers();
    hideLoading();
    alert('Teacher removed (role set to student).');
  } catch (err: any) {
    const { hideLoading } = await import('./ui');
    hideLoading();
    alert('Failed to remove teacher: ' + err?.message);
  }
};

// Change user role handler (exposed to window for onclick)
(window as any).handleChangeRole = async (userId: string, currentRole: string) => {
  const newRole = prompt(`Change role for this user.\n\nCurrent role: ${currentRole}\n\nEnter new role (admin, teacher, or student):`, currentRole);

  if (!newRole) return;

  const roleNormalized = newRole.trim().toLowerCase();

  if (!['admin', 'teacher', 'student'].includes(roleNormalized)) {
    alert('Invalid role. Must be: admin, teacher, or student');
    return;
  }

  if (roleNormalized === currentRole) {
    alert('No change - same role');
    return;
  }

  try {
    const { updateUserRoleDirect } = await import('./data');
    const { showLoading } = await import('./ui');

    showLoading();

    await updateUserRoleDirect(userId, roleNormalized as 'admin' | 'teacher' | 'student');

    // Reload users table
    await loadAllUsers();

    alert(`✅ User role changed to ${roleNormalized}`);
  } catch (error: any) {
    console.error('Error changing role:', error);
    alert('Failed to change role: ' + error.message);
  } finally {
    const { hideLoading } = await import('./ui');
    hideLoading();
  }
};

// Convert percentage to letter grade
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

// Get color class for letter grade
function getLetterGradeColor(letterGrade: string): string {
  if (letterGrade.startsWith('A')) return 'text-green-400';
  if (letterGrade.startsWith('B')) return 'text-blue-400';
  if (letterGrade.startsWith('C')) return 'text-yellow-400';
  if (letterGrade.startsWith('D')) return 'text-orange-400';
  return 'text-red-400';
}

// Update dashboard statistics
function updateDashboardStats(): void {
  const totalStudentsEl = document.getElementById('stats-total-students');
  const avgGradeEl = document.getElementById('stats-avg-grade');
  const letterGradeEl = document.getElementById('stats-letter-grade');
  const gradeCountEl = document.getElementById('stats-grade-count');

  if (totalStudentsEl) {
    totalStudentsEl.textContent = currentStudents.length.toString();
  }

  if (avgGradeEl && currentGrades.length > 0) {
    const avgPercentage = currentGrades.reduce((sum, grade) => {
      return sum + (grade.score / grade.totalPoints) * 100;
    }, 0) / currentGrades.length;

    avgGradeEl.textContent = avgPercentage.toFixed(1) + '%';

    // Update grade count
    if (gradeCountEl) {
      const count = currentGrades.length;
      gradeCountEl.textContent = `${count} assignment${count !== 1 ? 's' : ''}`;
    }

    // Update letter grade
    if (letterGradeEl) {
      const letterGrade = getLetterGrade(avgPercentage);
      const colorClass = getLetterGradeColor(letterGrade);
      letterGradeEl.textContent = letterGrade;
      letterGradeEl.className = `text-4xl font-bold ${colorClass}`;
    }
  } else {
    // Reset if no grades
    if (avgGradeEl) {
      avgGradeEl.textContent = '--';
    }
    if (gradeCountEl) {
      gradeCountEl.textContent = '0 assignments';
    }
    if (letterGradeEl) {
      letterGradeEl.textContent = '--';
      letterGradeEl.className = 'text-4xl font-bold text-white';
    }
  }
}

// Update dashboard statistics for a specific student (Admin/Teacher view)
async function updateDashboardStatsForStudent(studentId: string): Promise<void> {
  const student = currentStudents.find(s => s.id === studentId);
  if (!student) return;

  // Update attendance card
  const dashboardAttendanceCard = document.getElementById('dashboard-attendance-card');
  const dashboardAttendanceRate = document.getElementById('dashboard-attendance-rate');
  const dashboardAttendancePresent = document.getElementById('dashboard-attendance-present');
  const dashboardAttendanceAbsent = document.getElementById('dashboard-attendance-absent');

  if (currentAttendance.length > 0) {
    const present = currentAttendance.filter(a => a.status === 'present').length;
    const absent = currentAttendance.filter(a => a.status === 'absent').length;
    const late = currentAttendance.filter(a => a.status === 'late').length;
    const excused = currentAttendance.filter(a => a.status === 'excused').length;
    const attended = present + late + excused;
    const total = currentAttendance.length;
    const rate = total > 0 ? ((attended / total) * 100).toFixed(1) : '0';

    if (dashboardAttendanceCard) {
      dashboardAttendanceCard.classList.remove('hide');
    }
    if (dashboardAttendanceRate) {
      dashboardAttendanceRate.textContent = rate + '%';
      // Color code based on attendance rate
      const rateNum = parseFloat(rate);
      if (rateNum >= 90) {
        dashboardAttendanceRate.className = 'text-4xl font-bold text-green-400';
      } else if (rateNum >= 75) {
        dashboardAttendanceRate.className = 'text-4xl font-bold text-yellow-400';
      } else {
        dashboardAttendanceRate.className = 'text-4xl font-bold text-red-400';
      }
    }
    if (dashboardAttendancePresent) {
      dashboardAttendancePresent.textContent = `${present} Present`;
    }
    if (dashboardAttendanceAbsent) {
      dashboardAttendanceAbsent.textContent = `${absent} Absent`;
    }
  } else {
    if (dashboardAttendanceCard) {
      dashboardAttendanceCard.classList.add('hide');
    }
  }

  // Update grades stats (already handled by updateDashboardStats)
  updateDashboardStats();

  // Update recent activity for this student
  await loadRecentActivity();
}

// Load and display recent activity (grades and attendance)
async function loadRecentActivity(): Promise<void> {
  const recentActivityEl = document.getElementById('recent-activity');
  if (!recentActivityEl) return;

  try {
    const userRole = getCurrentUserRole();
    let activities: Array<{ type: 'grade' | 'attendance'; date: Date; data: any }> = [];

    // For students, show their own activity
    if (userRole === 'student' && selectedStudentId) {
      // Get recent grades
      if (currentGrades.length > 0) {
        currentGrades.slice(0, 5).forEach(grade => {
          activities.push({
            type: 'grade',
            date: new Date(grade.date),
            data: grade
          });
        });
      }

      // Get recent attendance
      if (currentAttendance.length > 0) {
        currentAttendance.slice(0, 5).forEach(attendance => {
          activities.push({
            type: 'attendance',
            date: new Date(attendance.date),
            data: attendance
          });
        });
      }
    } else if (userRole === 'admin' || userRole === 'teacher') {
      // For admin/teacher, show activity from selected student or all students
      if (selectedStudentId) {
        // Get recent grades for selected student
        if (currentGrades.length > 0) {
          currentGrades.slice(0, 5).forEach(grade => {
            activities.push({
              type: 'grade',
              date: new Date(grade.date),
              data: grade
            });
          });
        }

        // Get recent attendance for selected student
        if (currentAttendance.length > 0) {
          currentAttendance.slice(0, 5).forEach(attendance => {
            activities.push({
              type: 'attendance',
              date: new Date(attendance.date),
              data: attendance
            });
          });
        }
      }
    }

    // Sort by date (most recent first)
    activities.sort((a, b) => b.date.getTime() - a.date.getTime());

    // Take top 10 most recent
    activities = activities.slice(0, 10);

    // Display activities
    if (activities.length === 0) {
      recentActivityEl.innerHTML = `
        <div class="glass-effect rounded-xl p-4 text-dark-300">
          No recent activity
        </div>
      `;
      return;
    }

    recentActivityEl.innerHTML = activities.map(activity => {
      const dateStr = activity.date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      if (activity.type === 'grade') {
        const grade = activity.data as Grade;
        const percentage = ((grade.score / grade.totalPoints) * 100).toFixed(1);
        const percentageClass = parseFloat(percentage) >= 70 ? 'text-green-400' : 'text-red-400';

        return `
          <div class="glass-effect rounded-xl p-4 hover:bg-dark-800/50 transition-colors">
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <svg class="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path>
                  </svg>
                  <span class="text-white font-semibold">${grade.assignmentName}</span>
                </div>
                <p class="text-dark-300 text-sm">${grade.category} • ${grade.score}/${grade.totalPoints} (<span class="${percentageClass}">${percentage}%</span>)</p>
              </div>
              <span class="text-dark-400 text-xs whitespace-nowrap ml-4">${dateStr}</span>
            </div>
          </div>
        `;
      } else {
        const attendance = activity.data as Attendance;
        let statusBadge = '';
        let statusColor = '';
        switch (attendance.status) {
          case 'present':
            statusBadge = '✓ Present';
            statusColor = 'text-green-400';
            break;
          case 'absent':
            statusBadge = '✗ Absent';
            statusColor = 'text-red-400';
            break;
          case 'late':
            statusBadge = '⏰ Late';
            statusColor = 'text-yellow-400';
            break;
          case 'excused':
            statusBadge = '📝 Excused';
            statusColor = 'text-blue-400';
            break;
        }

        return `
          <div class="glass-effect rounded-xl p-4 hover:bg-dark-800/50 transition-colors">
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                  </svg>
                  <span class="${statusColor} font-semibold">${statusBadge}</span>
                </div>
                <p class="text-dark-300 text-sm">${attendance.notes || 'No notes'}</p>
              </div>
              <span class="text-dark-400 text-xs whitespace-nowrap ml-4">${dateStr}</span>
            </div>
          </div>
        `;
      }
    }).join('');

  } catch (error) {
    console.error('Error loading recent activity:', error);
    recentActivityEl.innerHTML = `
      <div class="glass-effect rounded-xl p-4 text-red-400">
        Error loading recent activity
      </div>
    `;
  }
}

// Reset application state
function resetAppState(): void {
  currentStudents = [];
  currentGrades = [];
  selectedStudentId = null;

  if (gradesUnsubscribe) {
    gradesUnsubscribe();
    gradesUnsubscribe = null;
  }
}

// ==================== AI FUNCTIONS ====================

/**
 * Generate AI Performance Summary
 * 
 * PURPOSE: Calls Cloud Function to generate AI-powered performance analysis
 * 
 * FLOW:
 * 1. Show loading indicator
 * 2. Call Cloud Function with studentId
 * 3. Display result in modal
 * 4. Handle errors gracefully
 * 
 * MIGRATION PATH:
 * - Currently calls Firebase Cloud Function
 * - When moving to dedicated API service, update the API endpoint here
 * - The Cloud Function already handles all AI logic server-side
 * 
 * DEBUG:
 * - Check browser console for errors
 * - Verify Cloud Functions are deployed
 * - Check GEMINI_API_KEY is set in Firebase Functions config
 * - Review Cloud Functions logs for AI API errors
 */
async function generatePerformanceSummary(studentId: string): Promise<void> {
  const btn = document.getElementById('ai-summary-btn') as HTMLButtonElement | null;
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }

  try {
    const { showLoading } = await import('./ui');
    const { functions, httpsCallable } = await import('./firebase');

    showLoading();

    // Call Cloud Function with 120s client-side timeout
    const getPerformanceSummary = httpsCallable(functions, 'getPerformanceSummary', { timeout: 120_000 });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out. The AI service may be busy — please try again.')), 120_000)
    );
    const result = await Promise.race([getPerformanceSummary({ studentId }), timeoutPromise]);

    const data = result.data as any;

    const { showModal } = await import('./ui');
    showModal(
      `Performance Summary - ${data.studentName}`,
      data.summaryHtml
    );

  } catch (error: any) {
    console.error('Performance summary error:', error.message);
    alert(`Failed to generate summary: ${error.message || 'Unknown error occurred'}`);
  } finally {
    const { hideLoading } = await import('./ui');
    hideLoading();
    if (btn) { btn.disabled = false; btn.textContent = 'AI Performance Summary'; }
  }
}

/**
 * Generate AI Study Tips
 * 
 * PURPOSE: Calls Cloud Function to generate personalized study recommendations
 * 
 * FLOW:
 * 1. Show loading indicator
 * 2. Call Cloud Function with studentId
 * 3. Display result in modal
 * 4. Handle errors gracefully
 * 
 * MIGRATION PATH:
 * - Currently calls Firebase Cloud Function
 * - When moving to dedicated API service, update the API endpoint here
 * - The Cloud Function already handles all AI logic server-side
 * 
 * DEBUG:
 * - Check browser console for errors
 * - Verify Cloud Functions are deployed
 * - Check GEMINI_API_KEY is set in Firebase Functions config
 * - Review Cloud Functions logs for AI API errors
 */
async function generateStudyTips(studentId: string): Promise<void> {
  const btn = document.getElementById('study-tips-btn') as HTMLButtonElement | null;
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }

  try {
    const { showLoading } = await import('./ui');
    const { functions, httpsCallable } = await import('./firebase');

    showLoading();

    // Call Cloud Function with 120s client-side timeout
    const getStudyTips = httpsCallable(functions, 'getStudyTips', { timeout: 120_000 });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out. The AI service may be busy — please try again.')), 120_000)
    );
    const result = await Promise.race([getStudyTips({ studentId }), timeoutPromise]);

    const data = result.data as any;

    const { showModal } = await import('./ui');
    showModal(
      `Study Tips - ${data.studentName}`,
      data.tipsHtml
    );

  } catch (error: any) {
    console.error('Study tips error:', error.message);
    alert(`Failed to generate study tips: ${error.message || 'Unknown error occurred'}`);
  } finally {
    const { hideLoading } = await import('./ui');
    hideLoading();
    if (btn) { btn.disabled = false; btn.textContent = 'Get Study Tips'; }
  }
}

// ==================== AI AGENT CHAT ====================

/**
 * Setup AI Agent Chat Interface
 * 
 * PURPOSE: Handles the conversational AI agent for admins
 * 
 * FEATURES:
 * - Real-time chat interface
 * - Conversation history management
 * - Message sending and receiving
 * - Clear chat functionality
 */
function setupAIAgentChat(): void {
  const chatInput = document.getElementById('ai-agent-input') as HTMLInputElement;
  const sendBtn = document.getElementById('ai-agent-send-btn') as HTMLButtonElement;
  const messagesContainer = document.getElementById('ai-agent-messages');
  const clearChatBtn = document.getElementById('clear-chat-btn');

  // Conversation history (stored in memory, can be moved to localStorage or database)
  let conversationHistory: Array<{ user: string; assistant: string }> = [];

  if (!chatInput || !sendBtn || !messagesContainer) {
    return; // AI Agent tab not available (not admin)
  }

  // Send message function
  const sendMessage = async (): Promise<void> => {
    const message = chatInput.value.trim();
    if (!message) return;

    // Disable input while processing
    chatInput.disabled = true;
    sendBtn.disabled = true;

    // Add user message to UI
    addMessageToChat('user', message);

    // Clear input
    chatInput.value = '';

    // Add typing indicator
    const typingId = addTypingIndicator();

    try {
      const { functions, httpsCallable } = await import('./firebase');

      // Call AI Agent Cloud Function
      const aiAgentChat = httpsCallable(functions, 'aiAgentChat');
      const result = await aiAgentChat({
        message,
        conversationHistory
      });

      const data = result.data as any;

      // Remove typing indicator
      removeTypingIndicator(typingId);

      // Add AI response to UI
      addMessageToChat('assistant', data.response);

      // Update conversation history
      conversationHistory.push({
        user: message,
        assistant: data.response
      });

      // Limit conversation history to last 10 exchanges
      if (conversationHistory.length > 10) {
        conversationHistory = conversationHistory.slice(-10);
      }

    } catch (error: any) {
      // Remove typing indicator
      removeTypingIndicator(typingId);

      console.error('AI Agent error:', error.message);

      // Show error message
      addMessageToChat('assistant', `Sorry, I encountered an error: ${error.message || 'Unknown error'}. Please try again.`);
    } finally {
      // Re-enable input
      chatInput.disabled = false;
      sendBtn.disabled = false;
      chatInput.focus();
    }
  };

  // Add message to chat UI
  function addMessageToChat(role: 'user' | 'assistant', content: string): void {
    if (!messagesContainer) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `flex items-start gap-4 ai-chat-message ${role}`;

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let formattedContent: string;
    if (role === 'user') {
      formattedContent = escapeHtml(content);
    } else {
      formattedContent = formatMarkdown(content);
    }

    if (role === 'user') {
      messageDiv.innerHTML = `
        <div class="flex-1 flex justify-end">
          <div class="max-w-[85%]">
            <div class="rounded-2xl rounded-tr-sm p-4 bg-gradient-to-br from-primary-500/20 to-accent-500/10 border border-primary-500/30 shadow-lg shadow-primary-500/10 hover:shadow-primary-500/20 transition-shadow">
              <p class="text-white whitespace-pre-wrap leading-relaxed">${formattedContent}</p>
            </div>
            <p class="text-dark-500 text-xs mt-1.5 mr-2 text-right">${timestamp}</p>
          </div>
        </div>
        <div class="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/25">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
          </svg>
        </div>
      `;
    } else {
      // Generate unique ID for copy functionality
      const msgId = `ai-msg-${Date.now()}`;

      // Create the structure first
      messageDiv.innerHTML = `
        <div class="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-lg shadow-primary-500/25">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>
          </svg>
        </div>
        <div class="flex-1 max-w-3xl">
          <div class="ai-message-content glass-effect rounded-2xl rounded-tl-sm p-5 border border-primary-500/20 hover:border-primary-500/30 transition-all group relative">
            <div class="ai-response-content" id="${msgId}"></div>
            <button 
              onclick="window.copyAIResponse(this, document.getElementById('${msgId}').innerText)"
              class="ai-copy-btn absolute top-3 right-3 p-2 rounded-lg bg-dark-800/80 hover:bg-dark-700 text-dark-400 hover:text-white transition-all"
              title="Copy response"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
              </svg>
            </button>
          </div>
          <div class="flex items-center gap-3 mt-2 ml-2">
            <p class="text-dark-500 text-xs">${timestamp}</p>
            <span class="text-dark-600">•</span>
            <span class="text-dark-500 text-xs flex items-center gap-1">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg>
              AI Assistant
            </span>
          </div>
        </div>
      `;

      // Now set the content separately to ensure HTML is parsed correctly
      // SECURITY FIX (2025-01-26): Sanitize AI-generated HTML content to prevent XSS
      const contentDiv = messageDiv.querySelector(`#${msgId}`);
      if (contentDiv) {
        contentDiv.innerHTML = sanitizeHTML(formattedContent);
      }
    }

    messagesContainer.appendChild(messageDiv);

    // Scroll to bottom with smooth behavior
    messagesContainer.scrollTo({
      top: messagesContainer.scrollHeight,
      behavior: 'smooth'
    });
  }

  // Add typing indicator
  function addTypingIndicator(): string {
    if (!messagesContainer) return '';

    const typingId = `typing-${Date.now()}`;
    const typingDiv = document.createElement('div');
    typingDiv.id = typingId;
    typingDiv.className = 'flex items-start gap-4 ai-chat-message animate-fade-in-up';
    typingDiv.innerHTML = `
      <div class="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-lg shadow-primary-500/25 animate-pulse-slow">
        <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>
        </svg>
      </div>
      <div class="flex-1 max-w-3xl">
        <div class="glass-effect rounded-2xl rounded-tl-sm p-5 border border-primary-500/20 ai-message-loading">
          <div class="flex items-center gap-4">
            <div class="flex gap-2">
              <div class="typing-dot w-3 h-3 bg-gradient-to-br from-primary-400 to-accent-400 rounded-full"></div>
              <div class="typing-dot w-3 h-3 bg-gradient-to-br from-primary-400 to-accent-400 rounded-full"></div>
              <div class="typing-dot w-3 h-3 bg-gradient-to-br from-primary-400 to-accent-400 rounded-full"></div>
            </div>
            <span class="text-dark-400 text-sm font-medium">Analyzing your student data...</span>
          </div>
          <p class="text-dark-500 text-xs mt-3 flex items-center gap-2">
            <svg class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            Querying Firebase database...
          </p>
        </div>
      </div>
    `;

    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTo({
      top: messagesContainer.scrollHeight,
      behavior: 'smooth'
    });

    return typingId;
  }

  // Remove typing indicator
  function removeTypingIndicator(typingId: string): void {
    if (!messagesContainer) return;
    const typingEl = document.getElementById(typingId);
    if (typingEl) {
      typingEl.remove();
    }
  }

  // Escape HTML to prevent XSS
  function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Format markdown to styled HTML for AI responses
  function formatMarkdown(text: string): string {
    let html = text.trim();

    // Check if content already contains HTML tags - look for common tags
    const hasHtmlTags = /<\/?(?:ul|ol|li|p|div|h[1-6]|strong|em|b|i|code|pre|blockquote|br|hr|span|a)[>\s]/i.test(html);

    if (hasHtmlTags) {

      // Content has HTML - apply styling classes to existing tags
      html = html.replace(/<ul([^>]*)>/gi, '<ul class="space-y-2 my-4"$1>');
      html = html.replace(/<ol([^>]*)>/gi, '<ol class="space-y-2 my-4 list-decimal list-inside"$1>');
      html = html.replace(/<li([^>]*)>/gi, '<li class="flex items-start gap-3 text-dark-200 mb-2"$1><span class="w-2 h-2 bg-gradient-to-br from-primary-400 to-accent-400 rounded-full mt-2 flex-shrink-0"></span><span>');
      html = html.replace(/<\/li>/gi, '</span></li>');
      html = html.replace(/<strong([^>]*)>/gi, '<strong class="text-white font-semibold"$1>');
      html = html.replace(/<b([^>]*)>/gi, '<strong class="text-white font-semibold"$1>');
      html = html.replace(/<\/b>/gi, '</strong>');
      html = html.replace(/<em([^>]*)>/gi, '<em class="text-primary-300"$1>');
      html = html.replace(/<i([^>]*)>/gi, '<em class="text-primary-300"$1>');
      html = html.replace(/<\/i>/gi, '</em>');
      html = html.replace(/<h1([^>]*)>/gi, '<h1 class="text-2xl font-bold text-white mt-4 mb-3"$1>');
      html = html.replace(/<h2([^>]*)>/gi, '<h2 class="text-xl font-bold text-white mt-4 mb-2"$1>');
      html = html.replace(/<h3([^>]*)>/gi, '<h3 class="text-lg font-bold text-white mt-3 mb-2"$1>');
      html = html.replace(/<h4([^>]*)>/gi, '<h4 class="text-base font-bold text-white mt-3 mb-2"$1>');
      html = html.replace(/<p([^>]*)>/gi, '<p class="mb-3 text-dark-200 leading-relaxed"$1>');
      html = html.replace(/<code([^>]*)>/gi, '<code class="px-2 py-0.5 bg-dark-800 rounded text-accent-400 text-sm font-mono"$1>');
      html = html.replace(/<pre([^>]*)>/gi, '<pre class="bg-dark-900/80 rounded-xl p-4 my-3 overflow-x-auto border border-dark-700"$1>');
      html = html.replace(/<blockquote([^>]*)>/gi, '<blockquote class="border-l-4 border-primary-500 pl-4 py-2 my-3 bg-primary-500/5 rounded-r-lg italic text-dark-300"$1>');

      // Clean up newlines around tags for cleaner rendering
      html = html.replace(/>\s*\n+\s*</g, '> <');

      // Wrap plain text between tags in spans for styling
      html = html.replace(/>([^<]+)</g, (_match, content) => {
        // Highlight percentages
        let styled = content.replace(/(\d+(?:\.\d+)?%)/g, '<span class="text-accent-400 font-semibold">$1</span>');
        // Highlight fractions
        styled = styled.replace(/(\d+\/\d+)/g, '<span class="text-primary-400 font-medium">$1</span>');
        return `>${styled}<`;
      });

      return html;
    }

    // Content is plain text/markdown - convert to styled HTML

    // Headers (## Header)
    html = html.replace(/^### (.+)$/gm, '<h4 class="text-lg font-bold text-white mt-4 mb-2 flex items-center gap-2"><span class="w-1.5 h-1.5 bg-accent-400 rounded-full"></span>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3 class="text-xl font-bold text-white mt-5 mb-3 pb-2 border-b border-primary-500/20">$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2 class="text-2xl font-bold bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent mt-4 mb-3">$1</h2>');

    // Bold text **text** or __text__
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong class="text-white font-semibold">$1</strong>');

    // Italic text *text* or _text_ (but not if part of bold)
    html = html.replace(/(?<![*_])([*_])(?![*_])(.+?)(?<![*_])\1(?![*_])/g, '<em class="text-primary-300 italic">$2</em>');

    // Code blocks ```code```
    html = html.replace(/```(\w+)?\n?([\s\S]*?)```/g, '<pre class="bg-dark-900/80 rounded-xl p-4 my-3 overflow-x-auto border border-dark-700"><code class="text-accent-300 text-sm font-mono">$2</code></pre>');

    // Inline code `code`
    html = html.replace(/`([^`]+)`/g, '<code class="px-2 py-0.5 bg-dark-800 rounded text-accent-400 text-sm font-mono">$1</code>');

    // Bullet points
    html = html.replace(/^\* (.+)$/gm, '<div class="flex items-start gap-3 mb-2"><span class="w-2 h-2 bg-gradient-to-br from-primary-400 to-accent-400 rounded-full mt-2 flex-shrink-0"></span><span class="text-dark-200">$1</span></div>');
    html = html.replace(/^- (.+)$/gm, '<div class="flex items-start gap-3 mb-2"><span class="w-2 h-2 bg-gradient-to-br from-primary-400 to-accent-400 rounded-full mt-2 flex-shrink-0"></span><span class="text-dark-200">$1</span></div>');

    // Numbered lists
    html = html.replace(/^(\d+)\. (.+)$/gm, (_match, num, content) => {
      return `<div class="flex items-start gap-3 mb-2"><span class="w-6 h-6 bg-gradient-to-br from-primary-500/20 to-accent-500/20 rounded-lg flex items-center justify-center text-xs font-bold text-primary-400 flex-shrink-0">${num}</span><span class="text-dark-200">${content}</span></div>`;
    });

    // Blockquotes > text
    html = html.replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-primary-500 pl-4 py-2 my-3 bg-primary-500/5 rounded-r-lg italic text-dark-300">$1</blockquote>');

    // Horizontal rules ---
    html = html.replace(/^---$/gm, '<hr class="my-4 border-dark-700">');

    // Links [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary-400 hover:text-primary-300 underline" target="_blank">$1</a>');

    // Highlight percentages and fractions
    html = html.replace(/(\d+(?:\.\d+)?%)/g, '<span class="text-accent-400 font-semibold">$1</span>');
    html = html.replace(/(\d+\/\d+)(?!<)/g, '<span class="text-primary-400 font-medium">$1</span>');

    // Double line breaks to paragraph breaks
    html = html.replace(/\n\n+/g, '</p><p class="mb-3 text-dark-200 leading-relaxed">');

    // Single line breaks
    html = html.replace(/\n/g, '<br>');

    // Wrap in paragraph
    html = `<p class="mb-3 text-dark-200 leading-relaxed">${html}</p>`;

    // Clean up empty paragraphs and fix double wrapping
    html = html.replace(/<p class="[^"]*">(<(?:h[1-6]|div|ul|ol|pre|blockquote)[^>]*>)/g, '$1');
    html = html.replace(/(<\/(?:h[1-6]|div|ul|ol|pre|blockquote)>)<\/p>/g, '$1');
    html = html.replace(/<p class="[^"]*"><\/p>/g, '');
    html = html.replace(/<p class="[^"]*"><br><\/p>/g, '');
    html = html.replace(/<br><br>/g, '</p><p class="mb-3 text-dark-200 leading-relaxed">');

    return html;
  }

  // Event listeners
  sendBtn.addEventListener('click', sendMessage);

  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Clear chat
  if (clearChatBtn) {
    clearChatBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear the chat history?')) {
        conversationHistory = [];
        if (messagesContainer) {
          // Keep only the welcome message
          const welcomeMsg = messagesContainer.querySelector('.flex.items-start.gap-3');
          messagesContainer.innerHTML = '';
          if (welcomeMsg) {
            messagesContainer.appendChild(welcomeMsg);
          }
        }
      }
    });
  }
}

// ==================== ATTENDANCE TRACKING ====================

// Load attendance for a specific student
async function loadStudentAttendance(studentId: string): Promise<void> {
  try {
    currentAttendance = await fetchAttendance(studentId);
    displayAttendance(currentAttendance);
    updateAttendanceStats(currentAttendance);
    // Update recent activity when attendance changes
    loadRecentActivity();
  } catch (error) {
    console.error('Error loading attendance:', error);
    displayAttendance([]);
    updateAttendanceStats([]);
  }
}

// Display attendance in the table
function displayAttendance(attendance: Attendance[]): void {
  const attendanceTableBody = document.getElementById('attendance-history-body')!;

  if (attendance.length === 0) {
    attendanceTableBody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center py-8 text-dark-300">
          No attendance records yet
        </td>
      </tr>
    `;
    return;
  }

  attendanceTableBody.innerHTML = attendance.map(record => {
    const date = new Date(record.date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    const student = currentStudents.find(s => s.id === record.studentId);
    const studentName = student ? student.name : 'Unknown';

    // Status badge styling
    let statusBadge = '';
    switch (record.status) {
      case 'present':
        statusBadge = '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-green-500/20 text-green-400">✓ Present</span>';
        break;
      case 'absent':
        statusBadge = '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-red-500/20 text-red-400">✗ Absent</span>';
        break;
      case 'late':
        statusBadge = '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-yellow-500/20 text-yellow-400">⏰ Late</span>';
        break;
      case 'excused':
        statusBadge = '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-400">📝 Excused</span>';
        break;
    }

    return `
      <tr class="border-b border-dark-700 hover:bg-dark-800/50 transition-colors">
        <td class="py-3 px-4 text-white">${date}</td>
        <td class="py-3 px-4 text-dark-300">${studentName}</td>
        <td class="py-3 px-4 text-center">${statusBadge}</td>
        <td class="py-3 px-4 text-dark-400 text-sm">${record.notes || '-'}</td>
      </tr>
    `;
  }).join('');
}

// Update attendance statistics
function updateAttendanceStats(attendance: Attendance[]): void {
  const total = attendance.length;
  const present = attendance.filter(a => a.status === 'present').length;
  const absent = attendance.filter(a => a.status === 'absent').length;
  const late = attendance.filter(a => a.status === 'late').length;
  const excused = attendance.filter(a => a.status === 'excused').length;

  // Calculate attendance rate (present + late + excused = attended)
  const attended = present + late + excused;
  const rate = total > 0 ? ((attended / total) * 100).toFixed(1) : '0';

  // Update UI
  document.getElementById('attendance-total')!.textContent = total.toString();
  document.getElementById('attendance-present')!.textContent = present.toString();
  document.getElementById('attendance-absent')!.textContent = absent.toString();
  document.getElementById('attendance-rate')!.textContent = rate + '%';
}

// ==================== STUDENT PROFILE ====================

// Track if password toggle listener has been set up
let passwordToggleInitialized = false;

// Load and display student profile information
function loadStudentProfile(): void {
  const userRole = getCurrentUserRole();
  if (userRole !== 'student') return;

  // Get current user
  const user = auth.currentUser;
  if (!user) {
    return;
  }

  // Find student record
  const student = currentStudents.find(s => s.studentUid === user.uid);
  if (!student) {
    return;
  }

  // Update profile fields
  const profileName = document.getElementById('profile-name');
  const profileMemberId = document.getElementById('profile-member-id');
  const profileYearOfBirth = document.getElementById('profile-year-of-birth');
  const profileUid = document.getElementById('profile-uid');
  const profileEmail = document.getElementById('profile-email');
  const profileContactPhone = document.getElementById('profile-contact-phone');
  const profileContactEmail = document.getElementById('profile-contact-email');
  const profileNotes = document.getElementById('profile-notes');
  const profileNotesSection = document.getElementById('profile-notes-section');

  if (profileName) profileName.textContent = student.name || '--';
  if (profileMemberId) profileMemberId.textContent = student.memberId || 'Not assigned';
  if (profileYearOfBirth) profileYearOfBirth.textContent = student.yearOfBirth ? student.yearOfBirth.toString() : '--';
  if (profileUid) profileUid.textContent = user.uid;
  if (profileEmail) profileEmail.textContent = user.email || '--';
  if (profileContactPhone) profileContactPhone.textContent = student.contactPhone || 'Not provided';
  if (profileContactEmail) profileContactEmail.textContent = student.contactEmail || 'Not provided';

  // Show notes section if notes exist
  if (profileNotes && profileNotesSection) {
    if (student.notes && student.notes.trim()) {
      profileNotes.textContent = student.notes;
      profileNotesSection.classList.remove('hide');
    } else {
      profileNotesSection.classList.add('hide');
    }
  }

  // Setup password visibility toggle (only once)
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
        // Change icon to eye-slash
        passwordEyeIcon.innerHTML = `
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path>
        `;
      } else {
        passwordInput.type = 'password';
        passwordInput.value = '••••••••••••';
        passwordInput.classList.remove('text-yellow-400');
        // Change icon back to eye
        passwordEyeIcon.innerHTML = `
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
        `;
      }
    });

    passwordToggleInitialized = true;
  }
}

// ==================== UID DISPLAY SECTION ====================

// Track if UID event listeners have been set up (prevent duplicate listeners)
let uidListenersInitialized = false;

/**
 * Display student's UID in navbar dropdown
 * 
 * PURPOSE: Allow students to easily access and copy their UID anytime
 * 
 * DEBUG: If UID doesn't show, check:
 * 1. User has 'student' role
 * 2. User is authenticated
 * 3. Console logs show UID value
 */
function displayStudentUid(): void {
  const uidDisplay = document.getElementById('navbar-uid-display') as HTMLInputElement;
  const copyBtn = document.getElementById('navbar-copy-uid-btn');
  const showUidBtn = document.getElementById('show-uid-btn');
  const uidDropdown = document.getElementById('uid-dropdown');

  if (!uidDisplay || !copyBtn || !showUidBtn || !uidDropdown) return;

  const user = auth.currentUser;
  if (!user) return;

  // Set the UID value
  uidDisplay.value = user.uid;

  // Only add event listeners once to prevent duplicates
  if (!uidListenersInitialized) {
    showUidBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      uidDropdown.classList.toggle('hide');
    });

    document.addEventListener('click', (e) => {
      const target = e.target as Node;
      if (!uidDropdown.contains(target) && !showUidBtn.contains(target)) {
        uidDropdown.classList.add('hide');
      }
    });

    copyBtn.addEventListener('click', () => {
      const currentUid = uidDisplay.value;
      uidDisplay.select();
      navigator.clipboard.writeText(currentUid).then(() => {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '✓ Copied!';
        copyBtn.classList.add('bg-green-500', 'hover:bg-green-600');
        copyBtn.classList.remove('bg-primary-500', 'hover:bg-primary-600');
        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.classList.remove('bg-green-500', 'hover:bg-green-600');
          copyBtn.classList.add('bg-primary-500', 'hover:bg-primary-600');
        }, 2000);
      }).catch(() => {
        alert('Failed to copy. Please select and copy manually.');
      });
    });

    uidListenersInitialized = true;
  }
}

/**
 * Show UID modal to user after signup
 * 
 * PURPOSE: Display UID prominently so student can share it with admin for registration
 * 
 * IMPORTANT: This is the ONLY way students know their UID without checking Firebase Console
 */
function showUidModal(uid: string, email: string): void {


  const modalHtml = `
    <div class="space-y-4">
      <div class="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
        <p class="text-green-400 font-semibold mb-2">✅ Account Created Successfully!</p>
        <p class="text-dark-300 text-sm">Welcome, <strong class="text-white">${email}</strong></p>
      </div>
      
      <div class="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <p class="text-blue-400 font-semibold mb-2">🔑 Your Account ID (UID)</p>
        <p class="text-dark-300 text-sm mb-3">
          You MUST share this ID with your teacher/admin so they can register you in the system.
        </p>
        
        <div class="relative">
          <input 
            type="text" 
            id="uid-display"
            value="${uid}" 
            readonly 
            class="w-full px-4 py-3 pr-24 rounded-lg bg-dark-800 border border-dark-600 text-white font-mono text-sm focus:outline-none focus:border-primary-500"
          >
          <button 
            id="copy-uid-btn"
            class="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded text-sm font-semibold transition-all"
          >
            Copy
          </button>
        </div>
        
        <p class="text-xs text-dark-400 mt-2">
          💡 Click "Copy" and send this ID to your teacher via email or message.
        </p>
      </div>
      
      <div class="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
        <p class="text-yellow-400 font-semibold mb-2">📝 Next Steps:</p>
        <ol class="text-dark-300 text-sm space-y-1 ml-4 list-decimal">
          <li>Copy your Account ID using the button above</li>
          <li>Send it to your teacher/administrator</li>
          <li>Wait for them to register you in the system</li>
          <li>Log back in to see your grades and attendance</li>
        </ol>
      </div>
      
      <div class="text-center">
        <button 
          id="close-uid-modal-btn"
          class="px-6 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-semibold rounded-lg hover:from-primary-600 hover:to-primary-700 transition-all shadow-lg"
        >
          I've Copied My ID
        </button>
      </div>
    </div>
  `;

  // Use existing showModal from ui.ts
  showModal('🎉 Account Created!', modalHtml);

  // Add copy functionality
  setTimeout(() => {
    const copyBtn = document.getElementById('copy-uid-btn');
    const uidInput = document.getElementById('uid-display') as HTMLInputElement;
    const closeBtn = document.getElementById('close-uid-modal-btn');

    if (copyBtn && uidInput) {
      copyBtn.addEventListener('click', () => {
        uidInput.select();
        navigator.clipboard.writeText(uid).then(() => {
          copyBtn.textContent = '✓ Copied!';
          copyBtn.classList.add('bg-green-500', 'hover:bg-green-600');
          copyBtn.classList.remove('bg-primary-500', 'hover:bg-primary-600');

          setTimeout(() => {
            copyBtn.textContent = 'Copy';
            copyBtn.classList.remove('bg-green-500', 'hover:bg-green-600');
            copyBtn.classList.add('bg-primary-500', 'hover:bg-primary-600');
          }, 2000);
        }).catch(() => {
          alert('Failed to copy. Please select and copy manually.');
        });
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        // Close modal by clicking the backdrop
        const modal = document.getElementById('modal');
        if (modal) {
          modal.classList.add('hide');
        }
      });
    }
  }, 100);
}

// Initialize the application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

