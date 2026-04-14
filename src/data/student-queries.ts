/**
 * Shared learner-roster semantics for `students/{id}` (mirrors Firestore rules + auth mapping).
 * Active rows: `deletedAt` absent, null, empty string, or whitespace-only string.
 * Archived: non-empty string (typically ISO) or Firestore Timestamp / other non-null sentinel.
 *
 * Note: Prefer filtering in application code after `where('studentUid', '==', uid)` because
 * `where('deletedAt', '==', null)` does not match documents where the field is omitted.
 */
export function studentDocumentIsActive(raw: Record<string, unknown>): boolean {
  const v = raw.deletedAt;
  if (v == null || v === '') return true;
  if (typeof v === 'string') return v.trim().length === 0;
  return false;
}
