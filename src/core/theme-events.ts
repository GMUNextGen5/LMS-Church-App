/**
 * Bridges the document `lms-theme-changed` CustomEvent (dispatched from `index.html` `applyTheme`)
 * to registered refresh callbacks (Chart.js, etc.) so non-CSS surfaces stay in sync without reload.
 */
import { agentDebugLog } from './debug-ingest';

export const LMS_THEME_CHANGE_EVENT = 'lms-theme-changed';

export type AppTheme = 'light' | 'dark';

/** Resolves the active app theme from `<html data-theme="...">`. */
export function getAppTheme(): AppTheme {
  if (typeof document === 'undefined' || !document.documentElement) return 'dark';
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

const themeRefreshHandlers = new Set<() => void>();

let bridgeInstalled = false;

/**
 * Registers a callback invoked on every theme change. Returns an unsubscribe function.
 * Safe to call multiple times; handlers are deduplicated by function reference.
 */
export function registerThemeRefreshHandler(handler: () => void): () => void {
  themeRefreshHandlers.add(handler);
  return () => themeRefreshHandlers.delete(handler);
}

/** Attaches a single document listener that runs all registered handlers. Idempotent. */
export function installThemeChangeBridge(): void {
  if (bridgeInstalled) return;
  if (typeof document === 'undefined') return;
  bridgeInstalled = true;
  document.addEventListener(LMS_THEME_CHANGE_EVENT, () => {
    // #region agent log
    agentDebugLog({
      sessionId: 'ecf1fb',
      hypothesisId: 'A',
      runId: 'pre',
      location: 'theme-events.ts:installThemeChangeBridge',
      message: 'lms-theme-changed received',
      data: {
        handlerCount: themeRefreshHandlers.size,
        theme: document.documentElement?.getAttribute('data-theme') ?? 'unknown',
      },
    });
    // #endregion
    themeRefreshHandlers.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        // #region agent log
        agentDebugLog({
          sessionId: 'ecf1fb',
          hypothesisId: 'B',
          runId: 'pre',
          location: 'theme-events.ts:handler',
          message: 'theme refresh handler threw',
          data: {
            err: e instanceof Error ? e.message : String(e),
          },
        });
        // #endregion
        /* Do not let one handler block others */
      }
    });
  });
}
