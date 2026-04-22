/**
 * Grades — Grade display, charts, and management
 */

import { listenToGrades, deleteGrade, addGrade, exportGradesToCSV } from './grades-data';
import { getCurrentUserRole } from '../../ui';
import {
  getStudents, getGrades, setGrades,
  getSelectedStudentId, getGradesUnsubscribe, setGradesUnsubscribe
} from '../../state';
import { Grade } from '../../types';
import { loadRecentActivity } from '../dashboard/dashboard';

// Chart instance references for cleanup
let gradeTrendChart: any = null;
let categoryChart: any = null;

/** Convert percentage to letter grade */
export function getLetterGrade(percentage: number): string {
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

/** Get color class for letter grade */
export function getLetterGradeColor(letterGrade: string): string {
  if (letterGrade.startsWith('A')) return 'text-green-400';
  if (letterGrade.startsWith('B')) return 'text-blue-400';
  if (letterGrade.startsWith('C')) return 'text-yellow-400';
  if (letterGrade.startsWith('D')) return 'text-orange-400';
  return 'text-red-400';
}

/** Show skeleton loading state for grades table */
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

  if (chartsSection) {
    chartsSection.classList.add('hide');
  }
}

/** Load grades for a specific student with real-time listener */
export async function loadStudentGrades(studentId: string): Promise<void> {
  try {
    showGradesSkeletonLoading();

    // Unsubscribe from previous listener
    const prevUnsub = getGradesUnsubscribe();
    if (prevUnsub) prevUnsub();

    // Set up real-time listener
    const unsub = listenToGrades(studentId, (grades) => {
      setGrades(grades);
      displayGrades(grades);
      loadRecentActivity();
      // Dashboard stats are updated via the dashboard module
    });
    setGradesUnsubscribe(unsub);

    console.log('✅ Loaded grades for student:', studentId);
  } catch (error) {
    console.error('Error loading student grades:', error);
    displayGrades([]);
  }
}

/** Display grades in the table */
export function displayGrades(grades: Grade[]): void {
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
    if (chartsSection) chartsSection.classList.add('hide');
    return;
  }

  if (chartsSection) chartsSection.classList.remove('hide');

  const userRole = getCurrentUserRole();
  const showActions = userRole === 'teacher' || userRole === 'admin';
  const selectedStudentId = getSelectedStudentId();

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
              data-action="delete-grade"
              data-student-id="${selectedStudentId}"
              data-grade-id="${grade.id}"
              class="px-3 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all text-sm"
            >
              Delete
            </button>
          </td>
        ` : ''}
      </tr>
    `;
  }).join('');

  renderGradeCharts(grades);
}

/** Render grade visualization charts */
function renderGradeCharts(grades: Grade[]): void {
  if (typeof (window as any).Chart === 'undefined') {
    console.warn('Chart.js not loaded, skipping chart rendering');
    return;
  }

  const Chart = (window as any).Chart;

  // Trend chart data
  const sortedGrades = [...grades].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const trendLabels = sortedGrades.map((g) => g.assignmentName.substring(0, 12) + (g.assignmentName.length > 12 ? '...' : ''));
  const trendData = sortedGrades.map(g => ((g.score / g.totalPoints) * 100).toFixed(1));

  // Category chart data
  const categoryData: { [key: string]: { total: number; count: number } } = {};
  grades.forEach(grade => {
    const cat = grade.category;
    if (!categoryData[cat]) categoryData[cat] = { total: 0, count: 0 };
    categoryData[cat].total += (grade.score / grade.totalPoints) * 100;
    categoryData[cat].count += 1;
  });
  const categoryLabels = Object.keys(categoryData);
  const categoryAverages = categoryLabels.map(cat =>
    (categoryData[cat].total / categoryData[cat].count).toFixed(1)
  );

  const categoryColors = ['#06b6d4', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#3b82f6'];

  const darkThemeOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: 'rgba(255, 255, 255, 0.6)', maxRotation: 45, minRotation: 0 },
      },
      y: {
        beginAtZero: true,
        max: 100,
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: 'rgba(255, 255, 255, 0.6)', callback: (value: number) => value + '%' },
      },
    },
  };

  // Render Trend Chart
  const trendCanvas = document.getElementById('grade-trend-chart') as HTMLCanvasElement;
  if (trendCanvas) {
    if (gradeTrendChart) gradeTrendChart.destroy();
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
    if (categoryChart) categoryChart.destroy();
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

  console.log('📊 [Charts] Grade charts rendered');
}

/**
 * Setup grade-related event handlers
 */
export function setupGradeHandlers(): void {
  const gradeEntryForm = document.getElementById('grade-entry-form') as HTMLFormElement;
  if (gradeEntryForm) {
    gradeEntryForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const selectedId = getSelectedStudentId();
      if (!selectedId) {
        alert('Please select a student first');
        return;
      }

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
        
        await addGrade(selectedId, gradeData);
        gradeEntryForm.reset();
        console.log('✅ Grade added successfully');
      } catch (error: any) {
        alert('Failed to add grade: ' + error.message);
      }
    });
  }

  // Export CSV button
  const exportCsvBtn = document.getElementById('export-csv-btn');
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
      const grades = getGrades();
      if (grades.length === 0) {
        alert('No grades to export. Please select a student with grades.');
        return;
      }
      const student = getStudents().find(s => s.id === getSelectedStudentId());
      exportGradesToCSV(grades, student ? student.name : 'Unknown');
    });
  }

  // Delete grade - event delegation on table body
  const gradesTableBody = document.getElementById('grades-table-body');
  if (gradesTableBody) {
    gradesTableBody.addEventListener('click', async (e) => {
      const btn = (e.target as HTMLElement).closest('[data-action="delete-grade"]') as HTMLElement;
      if (!btn) return;

      if (!confirm('Are you sure you want to delete this grade?')) return;

      const studentId = btn.dataset.studentId!;
      const gradeId = btn.dataset.gradeId!;

      try {
        await deleteGrade(studentId, gradeId);
        console.log('✅ Grade deleted successfully');
      } catch (error: any) {
        alert('Failed to delete grade: ' + error.message);
      }
    });
  }
}
