/**
 * Attendance — Attendance tracking, display, and stats
 */

import { fetchAttendance, markAttendance } from './attendance-data';
import { showLoading, hideLoading } from '../../ui';
import { getStudents, setAttendance, getSelectedStudentId } from '../../state';
import { Attendance } from '../../types';
import { loadRecentActivity } from '../dashboard/dashboard';

/** Load attendance for a specific student */
export async function loadStudentAttendance(studentId: string): Promise<void> {
  try {
    const attendance = await fetchAttendance(studentId);
    setAttendance(attendance);
    displayAttendance(attendance);
    updateAttendanceStats(attendance);
    loadRecentActivity();
    console.log('✅ Loaded', attendance.length, 'attendance records');
  } catch (error) {
    console.error('Error loading attendance:', error);
    displayAttendance([]);
    updateAttendanceStats([]);
  }
}

/** Display attendance in the table */
export function displayAttendance(attendance: Attendance[]): void {
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

  const students = getStudents();

  attendanceTableBody.innerHTML = attendance.map(record => {
    const date = new Date(record.date).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });

    const student = students.find(s => s.id === record.studentId);
    const studentName = student ? student.name : 'Unknown';

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

/** Update attendance statistics display */
export function updateAttendanceStats(attendance: Attendance[]): void {
  const total = attendance.length;
  const present = attendance.filter(a => a.status === 'present').length;
  const absent = attendance.filter(a => a.status === 'absent').length;
  const late = attendance.filter(a => a.status === 'late').length;
  const excused = attendance.filter(a => a.status === 'excused').length;

  const attended = present + late + excused;
  const rate = total > 0 ? ((attended / total) * 100).toFixed(1) : '0';

  const totalEl = document.getElementById('attendance-total');
  const presentEl = document.getElementById('attendance-present');
  const absentEl = document.getElementById('attendance-absent');
  const rateEl = document.getElementById('attendance-rate');

  if (totalEl) totalEl.textContent = total.toString();
  if (presentEl) presentEl.textContent = present.toString();
  if (absentEl) absentEl.textContent = absent.toString();
  if (rateEl) rateEl.textContent = rate + '%';
}

/**
 * Setup attendance-related event handlers
 */
export function setupAttendanceHandlers(): void {
  // Mark Attendance Form
  const markAttendanceForm = document.getElementById('mark-attendance-form') as HTMLFormElement;
  if (markAttendanceForm) {
    const dateInput = document.getElementById('attendance-date') as HTMLInputElement;
    if (dateInput) dateInput.valueAsDate = new Date();

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
        markedBy: ''
      };

      try {
        showLoading();
        await markAttendance(attendanceStudentId, attendanceData);

        successEl.textContent = '✅ Attendance marked successfully!';
        successEl.classList.remove('hide');

        markAttendanceForm.reset();
        if (dateInput) dateInput.valueAsDate = new Date();

        const selectedId = getSelectedStudentId();
        if (selectedId === attendanceStudentId) {
          await loadStudentAttendance(attendanceStudentId);
        }

        console.log('✅ Attendance marked successfully');
      } catch (error: any) {
        console.error('Error marking attendance:', error);
        errorEl.textContent = 'Failed to mark attendance: ' + error.message;
        errorEl.classList.remove('hide');
      } finally {
        hideLoading();
      }
    });
  }

  // Attendance student selector change
  const attendanceStudentSelect = document.getElementById('attendance-student-select') as HTMLSelectElement;
  if (attendanceStudentSelect) {
    attendanceStudentSelect.addEventListener('change', async (e) => {
      const studentId = (e.target as HTMLSelectElement).value;
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
      const select = document.getElementById('attendance-student-select') as HTMLSelectElement;
      const studentId = select?.value;
      if (studentId) await loadStudentAttendance(studentId);
    });
  }
}
