import { FieldValue } from 'firebase-admin/firestore';

/** Must match `LEGAL_USER_AGENT_MAX_LEN` in `src/core/auth.ts`. */
export const LEGAL_USER_AGENT_MAX_LEN = 300;

/**
 * Strips ASCII control characters, trims, then truncates (mirrors client signup forensic hardening).
 */
export function normalizeLegalUserAgent(raw: unknown): string {
  const s = String(raw ?? '');
  const stripped = s.replace(/[\x00-\x1f\x7f]/g, '').trim();
  return stripped.slice(0, LEGAL_USER_AGENT_MAX_LEN);
}

/** Use for any server-side `legalAcceptance.acceptedAt` write so it matches client `serverTimestamp()`. */
export function legalAcceptanceAcceptedAtField() {
  return FieldValue.serverTimestamp();
}
