/**
 * Canonical Firestore `users/{uid}.role` values.
 * Keep aligned with frontend `src/types/index.ts` (`UserRole`).
 */
export const USER_ROLES = ['admin', 'teacher', 'student'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

/** Roles allowed to invoke teacher/admin AI callables. */
export function isPrivilegedAiRole(role: unknown): role is 'admin' | 'teacher' {
  return role === 'admin' || role === 'teacher';
}
