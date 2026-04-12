/**
 * Breaks import cycles between `data/*` and `main.ts`: Firestore helpers call into UI when
 * permission-denied must surface a safe shell state instead of an empty list.
 */

export type VoidHandler = () => void;

let gradesAccessDeniedHandler: VoidHandler | null = null;

export function setGradesFirestoreAccessDeniedHandler(fn: VoidHandler | null): void {
  gradesAccessDeniedHandler = fn;
}

export function notifyGradesFirestoreAccessDenied(): void {
  try {
    gradesAccessDeniedHandler?.();
  } catch {
    /* host DOM may be cleared (logout / navigation) */
  }
}
