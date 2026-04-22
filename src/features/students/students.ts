/**
 * Students — Registration, management, and dropdown population
 */

import { showLoading, hideLoading, getCurrentUserRole } from '../../ui';
import { functions, httpsCallable } from '../../firebase';
import {
  getStudents, setStudents, setSelectedStudentId, getSelectedStudentId
} from '../../state';
import { fetchStudents } from '../../data';
import { deleteStudent, createStudent } from '../../data';
import { displayGrades } from '../grades/grades';
import { loadStudentGrades } from '../grades/grades';
import { loadStudentAttendance } from '../attendance/attendance';
import { loadRecentActivity } from '../dashboard/dashboard';

/**
 * Populate student account dropdown with Firebase Auth users (admin only)
 */
export async function populateStudentAccountDropdown(): Promise<void> {
  const accountSelect = document.getElementById('student-account-select') as HTMLSelectElement;
  if (!accountSelect) return;

  const role = getCurrentUserRole();
  if (role !== 'admin') return;

  try {
    const getAllUsers = httpsCallable(functions, 'getAllUsers');
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timed out')), 5000);
    });

    const result: any = await Promise.race([getAllUsers({}), timeoutPromise]);
    const users = result.data?.users || [];

    accountSelect.innerHTML = '<option value="">-- Select Registered Account --</option>';
    users.sort((a: any, b: any) => a.email.localeCompare(b.email));

    users.forEach((user: any) => {
      const option = document.createElement('option');
      option.value = user.uid;
      let displayText = user.email;
      if (user.displayName) displayText += ` (${user.displayName})`;
      displayText += ` - ${user.role}`;
      option.textContent = displayText;
      accountSelect.appendChild(option);
    });

    console.log(`✅ Loaded ${users.length} accounts into dropdown`);
  } catch (error: any) {
    console.warn('⚠️ Could not load accounts — use manual UID entry');
    accountSelect.innerHTML = '<option value="">Cloud Functions not deployed - use manual entry</option>';
  }
}

/**
 * Load registered students for the registration tab (admin only)
 */
export async function loadRegisteredStudents(): Promise<void> {
  const tableBody = document.getElementById('registered-students-table-body');
  if (!tableBody) return;

  const role = getCurrentUserRole();
  if (role !== 'admin') return;

  const students = getStudents();

  if (students.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-dark-300">No students registered yet</td></tr>`;
    return;
  }

  tableBody.innerHTML = students.map(student => `
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
          data-action="delete-student"
          data-student-id="${student.id}"
          class="px-3 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all text-sm"
        >
          Delete
        </button>
      </td>
    </tr>
  `).join('');

  // Event delegation for delete buttons
  tableBody.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('[data-action="delete-student"]') as HTMLElement;
    if (!btn) return;
    const studentId = btn.dataset.studentId!;
    await handleDeleteStudent(studentId);
  });
}

/** Delete student handler */
async function handleDeleteStudent(studentId: string): Promise<void> {
  if (!confirm('Are you sure you want to delete this student? This will also delete all their grades and attendance records.')) {
    return;
  }

  try {
    
    await deleteStudent(studentId);

    // Reload data
    const students = await fetchStudents();
    setStudents(students);
    updateStudentSelect();
    await loadRegisteredStudents();
    await loadRecentActivity();

    alert('✅ Student deleted successfully');
  } catch (error: any) {
    alert('Failed to delete student: ' + error.message);
  }
}

/**
 * Update all student selection dropdowns
 */
export function updateStudentSelect(): void {
  const students = getStudents();
  console.log(`🔄 Updating dropdowns with ${students.length} students`);

  const studentSelect = document.getElementById('student-select') as HTMLSelectElement;
  const attendanceStudentSelect = document.getElementById('attendance-student-select') as HTMLSelectElement;
  const dashboardStudentSelect = document.getElementById('dashboard-student-select') as HTMLSelectElement;

  // Grades dropdown
  studentSelect.innerHTML = '<option value="">-- Select a student --</option>';
  students.forEach(student => {
    const option = document.createElement('option');
    option.value = student.id;
    option.textContent = student.name + (student.memberId ? ` (ID: ${student.memberId})` : '');
    studentSelect.appendChild(option);
  });

  // Attendance dropdown
  if (attendanceStudentSelect) {
    attendanceStudentSelect.innerHTML = '<option value="">-- Select a student --</option>';
    students.forEach(student => {
      const option = document.createElement('option');
      option.value = student.id;
      option.textContent = student.name + (student.memberId ? ` (ID: ${student.memberId})` : '');
      attendanceStudentSelect.appendChild(option);
    });
  }

  // Dashboard dropdown
  if (dashboardStudentSelect) {
    dashboardStudentSelect.innerHTML = '<option value="">-- Select a student --</option>';
    students.forEach(student => {
      const option = document.createElement('option');
      option.value = student.id;
      option.textContent = student.name + (student.memberId ? ` (ID: ${student.memberId})` : '');
      option.setAttribute('data-name', student.name.toLowerCase());
      option.setAttribute('data-member-id', (student.memberId || '').toLowerCase());
      dashboardStudentSelect.appendChild(option);
    });
  }

  // Auto-select for students
  const userRole = getCurrentUserRole();
  if (userRole === 'student' && students.length === 1) {
    const ownRecord = students[0];
    studentSelect.value = ownRecord.id;
    setSelectedStudentId(ownRecord.id);

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

  // Initialize PDF report buttons
  setTimeout(() => {
    if (typeof (window as any).setupPDFReportGeneration === 'function') {
      (window as any).setupPDFReportGeneration();
    }
  }, 100);
}

/**
 * Setup student-related form handlers
 */
export function setupStudentHandlers(): void {
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
        memberId: formData.get('memberId') as string,
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

        successEl.textContent = `✅ Student "${studentData.name}" registered successfully! (ID: ${studentId})`;
        successEl.classList.remove('hide');
        studentRegForm.reset();

        // Reload
        const students = await fetchStudents();
        setStudents(students);
        updateStudentSelect();
        await loadRegisteredStudents();
      } catch (error: any) {
        errorEl.textContent = 'Failed to register student: ' + error.message;
        errorEl.classList.remove('hide');
      } finally {
        hideLoading();
      }
    });
  }

  // Student selection (grades tab)
  const studentSelect = document.getElementById('student-select') as HTMLSelectElement;
  if (studentSelect) {
    studentSelect.addEventListener('change', async (e) => {
      const selectedId = (e.target as HTMLSelectElement).value;
      setSelectedStudentId(selectedId || null);

      const pdfSection = document.getElementById('pdf-report-section');
      if (pdfSection) {
        selectedId ? pdfSection.classList.remove('hide') : pdfSection.classList.add('hide');
      }

      if (selectedId) {
        loadStudentGrades(selectedId);
      } else {
        
        displayGrades([]);
      }
    });
  }

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

  // Refresh Accounts button
  const refreshAccountsBtn = document.getElementById('refresh-accounts-btn');
  if (refreshAccountsBtn) {
    refreshAccountsBtn.addEventListener('click', async () => {
      await populateStudentAccountDropdown();
    });
  }

  // AI buttons
  const aiSummaryBtn = document.getElementById('ai-summary-btn');
  if (aiSummaryBtn) {
    aiSummaryBtn.addEventListener('click', async () => {
      const selectedId = getSelectedStudentId();
      if (!selectedId) { alert('Please select a student first'); return; }
      const { generatePerformanceSummary } = await import('../ai/ai-summary');
      await generatePerformanceSummary(selectedId);
    });
  }

  const studyTipsBtn = document.getElementById('study-tips-btn');
  if (studyTipsBtn) {
    studyTipsBtn.addEventListener('click', async () => {
      const selectedId = getSelectedStudentId();
      if (!selectedId) { alert('Please select a student first'); return; }
      const { generateStudyTips } = await import('../ai/ai-summary');
      await generateStudyTips(selectedId);
    });
  }
}
