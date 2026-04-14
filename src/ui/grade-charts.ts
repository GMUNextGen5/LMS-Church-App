import '../core/shims/chart-bridge';
import { Chart } from 'chart.js';
import type { ChartConfiguration, TooltipItem } from 'chart.js';
import type { Grade } from '../types';
import { getAppTheme } from '../core/theme-events';
import { safeAssignmentTitle } from '../core/display-fallbacks';
import { gradePercent100 } from '../core/grade-math';

type AnyChartInstance = InstanceType<typeof Chart>;

let gradeTrendChart: AnyChartInstance | null = null;
let categoryChart: AnyChartInstance | null = null;

function isAppLightTheme(): boolean {
  return getAppTheme() === 'light';
}

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

/** Renders or updates grade trend and category charts. */
export function renderGradeCharts(grades: Grade[]): void {
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
