/**
 * Dev-only: POST structured payloads to Vite middleware → `debug-ecf1fb.log` (NDJSON).
 * No-op in production builds.
 */
export function agentDebugLog(payload: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  void fetch('/__debug/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, timestamp: Date.now() }),
  }).catch(() => {});
}
