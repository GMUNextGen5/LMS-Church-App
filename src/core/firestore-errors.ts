/** Shared Firestore / Firebase client error shape checks (no SDK coupling). */

export function isFirebasePermissionDenied(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: string }).code;
  return code === 'permission-denied' || code === 'PERMISSION_DENIED';
}
