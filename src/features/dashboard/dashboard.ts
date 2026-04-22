/**
 * Dashboard — Stats, student selection, and recent activity
 */

import { getCurrentUserRole } from '../../ui';
import {
  getStudents, getGrades, getAttendance,
  getSelectedStudentId, setStudents
} from '../../state';
import { fetchStudents } from '../students/student-data';
import { getLetterGrade, getLetterGradeColor, loadStudentGrades } from '../grades/grades';
import { loadStudentAttendance } from '../attendance/attendance';
import { updateStudentSelect, loadRegisteredStudents, populateStudentAccountDropdown } from '../students/students';
import { loadAllUsers } from '../users/users';
import { loadStudentProfile, displayStudentUid } from '../students/student-profile';
import { Grade, Attendance } from '../../types';

/**
 * Load all dashboard data — called once after auth
 */
export async function loadDashboardData(): Promise<void> {
  try {
    const students = await fetchStudents();
    setStudents(students);
    updateStudentSelect();
    updateDashboardStats();
    await loadRecentActivity();
    await loadRegisteredStudents();
    await loadAllUsers();
    await populateStudentAccountDropdown();
    displayStudentUid();
    console.log('✅ Dashboard data loaded');
  } catch (error) {
    console.error('Error loading dashboard data:', error);
  }
}

/**
 * Update dashboard statistics
 */
export function updateDashboardStats(): void {
  const totalStudentsEl = document.getElementById('stats-total-students');
  const avgGradeEl = document.getElementById('stats-avg-grade');
  const letterGradeEl = document.getElementById('stats-letter-grade');
  const gradeCountEl = document.getElementById('stats-grade-count');
  const grades = getGrades();
  const students = getStudents();

  if (totalStudentsEl) totalStudentsEl.textContent = students.length.toString();

  if (avgGradeEl && grades.length > 0) {
    const avgPercentage = grades.reduce((sum, grade) => {
      return sum + (grade.score / grade.totalPoints) * 100;
    }, 0) / grades.length;

    avgGradeEl.textContent = avgPercentage.toFixed(1) + '%';

    if (gradeCountEl) {
      gradeCountEl.textContent = `${grades.length} assignment${grades.length !== 1 ? 's' : ''}`;
    }
    if (letterGradeEl) {
      const letterGrade = getLetterGrade(avgPercentage);
      const colorClass = getLetterGradeColor(letterGrade);
      letterGradeEl.textContent = letterGrade;
      letterGradeEl.className = `text-4xl font-bold ${colorClass}`;
    }
  } else {
    if (avgGradeEl) avgGradeEl.textContent = '--';
    if (gradeCountEl) gradeCountEl.textContent = '0 assignments';
    if (letterGradeEl) {
      letterGradeEl.textContent = '--';
      letterGradeEl.className = 'text-4xl font-bold text-white';
    }
  }
}

/**
 * Update dashboard stats for a specific student (Admin/Teacher)
 */
export async function updateDashboardStatsForStudent(studentId: string): Promise<void> {
  const student = getStudents().find(s => s.id === studentId);
  if (!student) return;

  const attendance = getAttendance();
  const dashboardAttendanceCard = document.getElementById('dashboard-attendance-card');
  const dashboardAttendanceRate = document.getElementById('dashboard-attendance-rate');
  const dashboardAttendancePresent = document.getElementById('dashboard-attendance-present');
  const dashboardAttendanceAbsent = document.getElementById('dashboard-attendance-absent');

  if (attendance.length > 0) {
    const present = attendance.filter(a => a.status === 'present').length;
    const absent = attendance.filter(a => a.status === 'absent').length;
    const late = attendance.filter(a => a.status === 'late').length;
    const excused = attendance.filter(a => a.status === 'excused').length;
    const attended = present + late + excused;
    const total = attendance.length;
    const rate = total > 0 ? ((attended / total) * 100).toFixed(1) : '0';

    if (dashboardAttendanceCard) dashboardAttendanceCard.classList.remove('hide');
    if (dashboardAttendanceRate) {
      dashboardAttendanceRate.textContent = rate + '%';
      const rateNum = parseFloat(rate);
      if (rateNum >= 90) {
        dashboardAttendanceRate.className = 'text-4xl font-bold text-green-400';
      } else if (rateNum >= 75) {
        dashboardAttendanceRate.className = 'text-4xl font-bold text-yellow-400';
      } else {
        dashboardAttendanceRate.className = 'text-4xl font-bold text-red-400';
      }
    }
    if (dashboardAttendancePresent) dashboardAttendancePresent.textContent = `${present} Present`;
    if (dashboardAttendanceAbsent) dashboardAttendanceAbsent.textContent = `${absent} Absent`;
  } else {
    if (dashboardAttendanceCard) dashboardAttendanceCard.classList.add('hide');
  }

  updateDashboardStats();
  await loadRecentActivity();
}

/**
 * Load and display recent activity feed
 */
export async function loadRecentActivity(): Promise<void> {
  const recentActivityEl = document.getElementById('recent-activity');
  if (!recentActivityEl) return;

  try {
    const userRole = getCurrentUserRole();
    const selectedId = getSelectedStudentId();
    const grades = getGrades();
    const attendance = getAttendance();
    let activities: Array<{ type: 'grade' | 'attendance'; date: Date; data: any }> = [];

    if ((userRole === 'student' && selectedId) || ((userRole === 'admin' || userRole === 'teacher') && selectedId)) {
      if (grades.length > 0) {
        grades.slice(0, 5).forEach(grade => {
          activities.push({ type: 'grade', date: new Date(grade.date), data: grade });
        });
      }
      if (attendance.length > 0) {
        attendance.slice(0, 5).forEach(att => {
          activities.push({ type: 'attendance', date: new Date(att.date), data: att });
        });
      }
    }

    activities.sort((a, b) => b.date.getTime() - a.date.getTime());
    activities = activities.slice(0, 10);

    if (activities.length === 0) {
      recentActivityEl.innerHTML = `<div class="glass-effect rounded-xl p-4 text-dark-300">No recent activity</div>`;
      return;
    }

    recentActivityEl.innerHTML = activities.map(activity => {
      const dateStr = activity.date.toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
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
                  <svg class="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path></svg>
                  <span class="text-white font-semibold">${grade.assignmentName}</span>
                </div>
                <p class="text-dark-300 text-sm">${grade.category} • ${grade.score}/${grade.totalPoints} (<span class="${percentageClass}">${percentage}%</span>)</p>
              </div>
              <span class="text-dark-400 text-xs whitespace-nowrap ml-4">${dateStr}</span>
            </div>
          </div>
        `;
      } else {
        const att = activity.data as Attendance;
        let statusBadge = '', statusColor = '';
        switch (att.status) {
          case 'present': statusBadge = '✓ Present'; statusColor = 'text-green-400'; break;
          case 'absent': statusBadge = '✗ Absent'; statusColor = 'text-red-400'; break;
          case 'late': statusBadge = '⏰ Late'; statusColor = 'text-yellow-400'; break;
          case 'excused': statusBadge = '📝 Excused'; statusColor = 'text-blue-400'; break;
        }
        return `
          <div class="glass-effect rounded-xl p-4 hover:bg-dark-800/50 transition-colors">
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                  <span class="${statusColor} font-semibold">${statusBadge}</span>
                </div>
                <p class="text-dark-300 text-sm">${att.notes || 'No notes'}</p>
              </div>
              <span class="text-dark-400 text-xs whitespace-nowrap ml-4">${dateStr}</span>
            </div>
          </div>
        `;
      }
    }).join('');
  } catch (error) {
    console.error('Error loading recent activity:', error);
    recentActivityEl.innerHTML = `<div class="glass-effect rounded-xl p-4 text-red-400">Error loading recent activity</div>`;
  }
}

/**
 * Setup dashboard-specific event handlers
 */
export function setupDashboardHandlers(): void {
  const dashboardStudentSelect = document.getElementById('dashboard-student-select') as HTMLSelectElement;
  const dashboardStudentSearch = document.getElementById('dashboard-student-search') as HTMLInputElement;
  const selectedStudentInfo = document.getElementById('selected-student-info');
  const selectedStudentNameEl = document.getElementById('selected-student-name');
  const selectedStudentIdEl = document.getElementById('selected-student-id');
  const clearStudentSelection = document.getElementById('clear-student-selection');
  const dashboardAttendanceCard = document.getElementById('dashboard-attendance-card');

  // Dashboard student select
  if (dashboardStudentSelect) {
    dashboardStudentSelect.addEventListener('change', async (e) => {
      const studentId = (e.target as HTMLSelectElement).value;
      if (studentId) {
        const student = getStudents().find(s => s.id === studentId);
        if (student) {
          if (selectedStudentInfo && selectedStudentNameEl && selectedStudentIdEl) {
            selectedStudentNameEl.textContent = student.name;
            selectedStudentIdEl.textContent = `Member ID: ${student.memberId || 'N/A'}`;
            selectedStudentInfo.classList.remove('hide');
          }
          await loadStudentGrades(studentId);
          await loadStudentAttendance(studentId);
          updateDashboardStatsForStudent(studentId);
        }
      } else {
        if (selectedStudentInfo) selectedStudentInfo.classList.add('hide');
        if (dashboardAttendanceCard) dashboardAttendanceCard.classList.add('hide');
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
        if (option.value === '') return;
        const name = option.getAttribute('data-name') || '';
        const memberId = option.getAttribute('data-member-id') || '';
        const text = option.textContent?.toLowerCase() || '';
        option.style.display = (searchTerm === '' || name.includes(searchTerm) || memberId.includes(searchTerm) || text.includes(searchTerm)) ? '' : 'none';
      });
      const visibleOptions = Array.from(options).filter(opt => opt.style.display !== 'none' && opt.value !== '');
      if (visibleOptions.length === 1 && searchTerm) {
        dashboardStudentSelect.value = visibleOptions[0].value;
        dashboardStudentSelect.dispatchEvent(new Event('change'));
      }
    });
  }

  // Clear student selection
  if (clearStudentSelection) {
    clearStudentSelection.addEventListener('click', () => {
      if (dashboardStudentSelect) {
        dashboardStudentSelect.value = '';
        dashboardStudentSelect.dispatchEvent(new Event('change'));
      }
      if (dashboardStudentSearch) dashboardStudentSearch.value = '';
    });
  }

  // Student profile button
  const studentProfileBtn = document.getElementById('student-profile-btn');
  if (studentProfileBtn) {
    studentProfileBtn.addEventListener('click', () => {
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hide'));
      const profileContent = document.getElementById('student-profile-content');
      if (profileContent) profileContent.classList.remove('hide');
      loadStudentProfile();
    });
  }
}
