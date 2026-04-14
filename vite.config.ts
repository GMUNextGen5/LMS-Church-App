import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Route Rollup module ids into named async chunks.
 * Firebase app/auth/firestore/functions share `vendor-firebase`; heavy UI effects share `ui-vendor`.
 */
function manualChunks(id: string): string | undefined {
  const normalized = id.split(path.sep).join('/');
  if (
    normalized.includes('node_modules/firebase/') ||
    normalized.includes('node_modules/@firebase/')
  ) {
    return 'vendor-firebase';
  }
  if (normalized.includes('node_modules/chart.js')) return 'vendor-chart';
  if (normalized.includes('node_modules/jspdf')) return 'vendor-jspdf';
  if (normalized.includes('node_modules/lucide')) return 'vendor-lucide';
  if (normalized.includes('node_modules/dompurify')) return 'vendor-sanitize';
  if (normalized.includes('/src/ui/particles') || normalized.includes('/src/ui/lucide-hydrate')) {
    return 'ui-vendor';
  }
  if (normalized.includes('/src/ui/templates.part')) return 'ui-templates-shell';
  if (normalized.includes('/src/ui/assessment-ui')) return 'ui-assessments';
  if (normalized.includes('/src/ui/classes-ui')) return 'ui-classes';
  if (normalized.includes('/src/ui/attendance-ui')) return 'ui-attendance';
  if (normalized.includes('/src/ui/grades-mobile-ui')) return 'ui-grades-mobile';
  if (normalized.includes('/src/ui/grade-charts')) return 'ui-grade-charts';
  if (normalized.includes('/src/bootstrap/lazy-tab-panels')) return 'bootstrap-tab-panels';
  if (normalized.includes('/src/data/')) return 'data-layer';
  return undefined;
}

export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './index.html',
        privacy: './privacy.html',
        terms: './terms.html',
      },
      output: {
        manualChunks,
      },
    },
    chunkSizeWarningLimit: 500,
  },
  server: {
    port: 3000,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/**', 'dist/**', '**/*.test.ts'],
    },
  },
});
