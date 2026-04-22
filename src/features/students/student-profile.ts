/**
 * Student Profile — Profile view, UID display, and password toggle
 */

import { getCurrentUser } from '../auth/auth';
import { getCurrentUserRole, showModal } from '../../ui';
import { getStudents, getGrades, getAttendance } from '../../state';
import { getLetterGrade, getLetterGradeColor } from '../grades/grades';
import { copyToClipboard } from '../../utils';

/**
 * Load and display the student profile tab
 */
export function loadStudentProfile(): void {
  const profileContent = document.getElementById('profile-content');
  if (!profileContent) return;

  const role = getCurrentUserRole();
  const user = getCurrentUser();
  const students = getStudents();

  if (role === 'student' && students.length > 0) {
    const student = students[0];
    const grades = getGrades();
    const attendance = getAttendance();

    const avgGrade = grades.length > 0
      ? (grades.reduce((sum, g) => sum + (g.score / g.totalPoints) * 100, 0) / grades.length).toFixed(1)
      : 'N/A';

    const totalClasses = attendance.length;
    const present = attendance.filter(a => a.status === 'present' || a.status === 'late' || a.status === 'excused').length;
    const attendanceRate = totalClasses > 0 ? ((present / totalClasses) * 100).toFixed(1) : 'N/A';

    const letterGrade = avgGrade !== 'N/A' ? getLetterGrade(parseFloat(avgGrade)) : 'N/A';
    const gradeColor = letterGrade !== 'N/A' ? getLetterGradeColor(letterGrade) : 'text-dark-400';

    profileContent.innerHTML = `
      <div class="max-w-2xl mx-auto space-y-6">
        <div class="glass-effect rounded-xl p-6 text-center">
          <div class="w-20 h-20 bg-gradient-to-br from-primary-500 to-accent-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <span class="text-3xl font-bold text-white">${student.name.charAt(0).toUpperCase()}</span>
          </div>
          <h3 class="text-2xl font-bold text-white mb-1">${student.name}</h3>
          <p class="text-dark-300 text-sm">Member ID: ${student.memberId || 'N/A'}</p>
          ${user ? `<p class="text-dark-400 text-xs mt-1">${user.email}</p>` : ''}
        </div>

        <div class="grid grid-cols-3 gap-4">
          <div class="glass-effect rounded-xl p-4 text-center">
            <div class="text-2xl font-bold ${gradeColor}">${letterGrade}</div>
            <div class="text-dark-400 text-xs mt-1">Overall Grade</div>
            <div class="text-dark-300 text-sm mt-1">${avgGrade !== 'N/A' ? avgGrade + '%' : '-'}</div>
          </div>
          <div class="glass-effect rounded-xl p-4 text-center">
            <div class="text-2xl font-bold text-primary-400">${grades.length}</div>
            <div class="text-dark-400 text-xs mt-1">Assignments</div>
          </div>
          <div class="glass-effect rounded-xl p-4 text-center">
            <div class="text-2xl font-bold text-accent-400">${attendanceRate !== 'N/A' ? attendanceRate + '%' : '-'}</div>
            <div class="text-dark-400 text-xs mt-1">Attendance</div>
          </div>
        </div>

        <div class="glass-effect rounded-xl p-6">
          <h4 class="text-lg font-semibold text-white mb-4">Contact Information</h4>
          <div class="space-y-3">
            <div class="flex justify-between items-center">
              <span class="text-dark-300">Email</span>
              <span class="text-white">${(student as any).contactEmail || 'N/A'}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-dark-300">Phone</span>
              <span class="text-white">${(student as any).contactPhone || 'N/A'}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-dark-300">Year of Birth</span>
              <span class="text-white">${(student as any).yearOfBirth || 'N/A'}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  } else if (role === 'teacher' || role === 'admin') {
    profileContent.innerHTML = `
      <div class="text-center py-12 text-dark-300">
        <svg class="w-16 h-16 mx-auto mb-4 text-dark-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
        </svg>
        <p class="text-lg mb-2">Profile view is for students</p>
        <p class="text-sm text-dark-400">
          You are logged in as a <strong class="text-white">${role}</strong>.
          Use the Dashboard and Grades tabs to manage students.
        </p>
      </div>
    `;
  } else {
    profileContent.innerHTML = `
      <div class="text-center py-12 text-dark-300">
        <p>Loading profile...</p>
      </div>
    `;
  }
}

/**
 * Show UID in a modal (for copying)
 */
export function displayStudentUid(): void {
  const user = getCurrentUser();
  if (!user) return;

  const modalHtml = `
    <div class="space-y-4">
      <div class="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <p class="text-blue-400 font-semibold mb-2">🔑 Your Account ID (UID)</p>
        <p class="text-dark-300 text-sm mb-3">Share this with your teacher/admin to get registered.</p>
        <div class="relative">
          <input type="text" id="uid-modal-display" value="${user.uid}" readonly
            class="w-full px-4 py-3 pr-24 rounded-lg bg-dark-800 border border-dark-600 text-white font-mono text-sm">
          <button id="copy-uid-modal-btn"
            class="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded text-sm font-semibold transition-all">
            Copy
          </button>
        </div>
      </div>
    </div>
  `;

  showModal('Your Account ID', modalHtml);

  setTimeout(() => {
    const copyBtn = document.getElementById('copy-uid-modal-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        copyToClipboard(user.uid, copyBtn);
      });
    }
  }, 100);
}

/**
 * Setup profile-related handlers
 */
export function setupProfileHandlers(): void {
  // Password visibility toggle
  const toggleBtns = document.querySelectorAll('.password-toggle');
  toggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      if (!targetId) return;
      const input = document.getElementById(targetId) as HTMLInputElement;
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  });

  // Show UID button
  const showUidBtn = document.getElementById('show-uid-btn');
  if (showUidBtn) {
    showUidBtn.addEventListener('click', displayStudentUid);
  }
}
