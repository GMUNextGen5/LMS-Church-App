import {
  auth,
  db,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  deleteUser,
  sendPasswordResetEmail,
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  setDoc,
  serverTimestamp,
  onSnapshot,
  FirebaseUser,
} from './firebase';
import { User, UserRole, Student } from '../types';
import { studentDocumentIsActive } from '../data/student-queries';
import { LEGAL_PRIVACY_VERSION, LEGAL_TERMS_VERSION } from './legal-versions';
import { showLoading, hideLoading, showBootstrapError, showAuthContainer } from '../ui/ui';
import { reportClientFault } from './client-errors';
import { runSessionTeardown } from './session-teardown';

let currentUser: User | null = null;

let userDocumentUnsubscribe: (() => void) | null = null;
let userProfileSnapshotHandler: ((user: User) => void) | null = null;

/** Detaches `users/{uid}` snapshot listener — call before full navigation or sign-out to avoid ghost work. */
export function stopUserDocumentListener(): void {
  if (userDocumentUnsubscribe) {
    userDocumentUnsubscribe();
    userDocumentUnsubscribe = null;
  }
}

/**
 * Registers a lightweight UI refresh when `users/{uid}` changes (e.g. staff edited the signed-in profile,
 * or another tab saved self-service fields). Full auth boot stays on `onAuthStateChanged` only.
 */
export function setUserProfileSnapshotHandler(handler: ((user: User) => void) | null): void {
  userProfileSnapshotHandler = handler;
}

function startUserDocumentListener(firebaseUser: FirebaseUser): void {
  stopUserDocumentListener();
  const uid = firebaseUser.uid;
  let skipInitialSnapshot = true;
  userDocumentUnsubscribe = onSnapshot(
    doc(db, 'users', uid),
    async (snap) => {
      if (!auth.currentUser || auth.currentUser.uid !== uid) return;
      if (!snap.exists()) return;
      const data = snap.data() as Record<string, unknown>;
      const role = data?.role;
      const validRoles = [UserRole.Admin, UserRole.Teacher, UserRole.Student] as const;
      const isValidRole =
        typeof role === 'string' && (validRoles as readonly string[]).includes(role);
      if (!isValidRole) return;
      const roleTyped = role as UserRole;
      try {
        currentUser = await mapFirestoreUserDocumentToUser(firebaseUser, data, roleTyped);
      } catch {
        currentUser = buildFallbackUserFromFirebase(firebaseUser, roleTyped, data);
      }
      if (skipInitialSnapshot) {
        skipInitialSnapshot = false;
        return;
      }
      try {
        userProfileSnapshotHandler?.(currentUser);
      } catch {
        /* host may not have bound a handler yet */
      }
    },
    () => {
      /* Listener errors are non-fatal; auth state remains authoritative. */
    }
  );
}

/**
 * Defers auth-driven DOM updates until after the next paint (strict / InPrivate timing races).
 * Double rAF aligns with layout so the shell is not manipulated before the browser paints.
 */
function scheduleAuthUi(fn: () => void): void {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        try {
          fn();
        } catch {
          /* DOM not ready */
        }
      });
    });
  } else {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

type TimestampLike = { toDate?: () => Date; seconds?: unknown; nanoseconds?: unknown };

/**
 * Normalizes Firestore Timestamp, ISO string, number, or Date-like values to an ISO string.
 * Handles `createdAt` as ISO strings and `acceptedAt` as Firestore Timestamp instances or
 * plain `{ seconds, nanoseconds }` shapes. Never throws; missing/invalid input yields "now".
 */
export function coerceFirestoreDateToIso(value: unknown): string {
  const now = (): string => new Date().toISOString();
  try {
    if (value == null || value === '') {
      return now();
    }
    const tsLike = value as TimestampLike;
    if (typeof value === 'object' && value !== null && typeof tsLike.toDate === 'function') {
      try {
        const date = tsLike.toDate!();
        if (date instanceof Date && !Number.isNaN(date.getTime())) {
          return date.toISOString();
        }
      } catch {
        /* fall through */
      }
    }
    if (typeof value === 'object' && value !== null) {
      const sec = tsLike.seconds;
      if (typeof sec === 'number' && Number.isFinite(sec)) {
        const ns = tsLike.nanoseconds;
        const ms =
          sec * 1000 + (typeof ns === 'number' && Number.isFinite(ns) ? Math.floor(ns / 1e6) : 0);
        const fromSec = new Date(ms);
        if (!Number.isNaN(fromSec.getTime())) {
          return fromSec.toISOString();
        }
      }
    }
    if (typeof value === 'string' || typeof value === 'number' || value instanceof Date) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
  } catch {
    /* ignore */
  }
  return now();
}

function pickSelfServiceUserFields(
  userData: Record<string, unknown>
): Pick<User, 'phoneNumber' | 'birthYear'> {
  const rawPhone = userData.phoneNumber;
  const phoneNumber =
    typeof rawPhone === 'string' && rawPhone.trim() ? rawPhone.trim().slice(0, 40) : undefined;
  const by = userData.birthYear;
  const birthYear = typeof by === 'number' && Number.isFinite(by) ? Math.round(by) : undefined;
  return { phoneNumber, birthYear };
}

function mapStudentFirestoreToStudent(id: string, raw: Record<string, unknown>): Student | null {
  try {
    if (!studentDocumentIsActive(raw)) return null;
    const name = typeof raw.name === 'string' ? raw.name : '';
    const parentUid = typeof raw.parentUid === 'string' ? raw.parentUid : '';
    const studentUid = typeof raw.studentUid === 'string' ? raw.studentUid : '';
    return {
      id,
      name: name.trim() ? name : 'Student',
      memberId: typeof raw.memberId === 'string' ? raw.memberId : undefined,
      yearOfBirth: typeof raw.yearOfBirth === 'number' ? raw.yearOfBirth : undefined,
      contactPhone: typeof raw.contactPhone === 'string' ? raw.contactPhone : undefined,
      contactEmail: typeof raw.contactEmail === 'string' ? raw.contactEmail : undefined,
      parentUid,
      studentUid,
      teacherIds: Array.isArray(raw.teacherIds)
        ? raw.teacherIds.filter((t): t is string => typeof t === 'string')
        : undefined,
      notes: typeof raw.notes === 'string' ? raw.notes : undefined,
      createdAt: coerceFirestoreDateToIso(raw.createdAt),
      createdBy: typeof raw.createdBy === 'string' ? raw.createdBy : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Resolves `students/{id}` for the signed-in learner: explicit `studentProfileId` on the user doc,
 * else the first document with `studentUid` matching Firebase Auth. Missing or denied reads yield `null`.
 */
async function resolveStudentProfileForUid(
  uid: string,
  userData: Record<string, unknown>
): Promise<Student | null> {
  try {
    const spIdRaw = userData.studentProfileId;
    const spId = typeof spIdRaw === 'string' && spIdRaw.trim() ? spIdRaw.trim() : '';

    if (spId) {
      const snap = await getDoc(doc(db, 'students', spId));
      if (snap.exists()) {
        return mapStudentFirestoreToStudent(snap.id, snap.data() as Record<string, unknown>);
      }
      return null;
    }

    const q = query(collection(db, 'students'), where('studentUid', '==', uid));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const d = snapshot.docs[0];
    return mapStudentFirestoreToStudent(d.id, d.data() as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** Best-effort fields from Firestore when full normalization throws (keeps legal gate accurate). */
function buildFallbackUserFromFirebase(
  firebaseUser: FirebaseUser,
  role: UserRole,
  userData: Record<string, unknown>
): User {
  let legalAcceptance: User['legalAcceptance'] = undefined;
  try {
    const laRaw = userData?.legalAcceptance;
    if (laRaw != null && typeof laRaw === 'object') {
      const o = laRaw as Record<string, unknown>;
      legalAcceptance = {
        termsVersion: typeof o.termsVersion === 'string' ? o.termsVersion : undefined,
        privacyVersion: typeof o.privacyVersion === 'string' ? o.privacyVersion : undefined,
        acceptedAt: o.acceptedAt !== undefined ? coerceFirestoreDateToIso(o.acceptedAt) : undefined,
      };
    }
  } catch {
    legalAcceptance = undefined;
  }
  const fromDoc =
    (typeof userData?.displayName === 'string' && userData.displayName.trim()) ||
    (typeof userData?.fullName === 'string' && userData.fullName.trim()) ||
    (typeof userData?.name === 'string' && userData.name.trim()) ||
    '';
  const fromAuth = firebaseUser.displayName?.trim() || '';
  const displayName = fromDoc || fromAuth || undefined;
  const { phoneNumber, birthYear } = pickSelfServiceUserFields(userData);
  const memberIdRaw = userData?.memberId;
  const memberId =
    typeof memberIdRaw === 'string' && memberIdRaw.trim()
      ? memberIdRaw.trim().slice(0, 40)
      : undefined;
  const summaryNameRaw = userData?.summaryName;
  const summaryName =
    typeof summaryNameRaw === 'string' && summaryNameRaw.trim()
      ? summaryNameRaw.trim().slice(0, 120)
      : undefined;
  const preferredNameRaw = userData?.preferredName;
  const preferredName =
    typeof preferredNameRaw === 'string' && preferredNameRaw.trim()
      ? preferredNameRaw.trim().slice(0, 120)
      : undefined;

  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email ?? '',
    role,
    createdAt: coerceFirestoreDateToIso(userData?.createdAt),
    displayName,
    summaryName,
    preferredName,
    legalAcceptance,
    studentProfile: role === UserRole.Student ? null : undefined,
    phoneNumber,
    birthYear,
    memberId,
  };
}

/**
 * Maps `users/{uid}` (and optional `students` link) into a {@link User}. Throws only for invalid role
 * (caller handles); mapping errors should be caught by the caller for fallback behavior.
 */
async function mapFirestoreUserDocumentToUser(
  firebaseUser: FirebaseUser,
  userData: Record<string, unknown>,
  role: UserRole
): Promise<User> {
  const fromDoc =
    (typeof userData?.displayName === 'string' && userData.displayName.trim()) ||
    (typeof userData?.fullName === 'string' && userData.fullName.trim()) ||
    (typeof userData?.name === 'string' && userData.name.trim()) ||
    '';
  const fromAuth = firebaseUser.displayName?.trim() || '';
  const displayName = fromDoc || fromAuth || undefined;

  let legalAcceptance: User['legalAcceptance'] = undefined;
  try {
    const laRaw = userData?.legalAcceptance;
    if (laRaw != null && typeof laRaw === 'object') {
      const o = laRaw as Record<string, unknown>;
      const acceptedAtRaw = o.acceptedAt;
      let acceptedAt: string | undefined;
      if (acceptedAtRaw !== undefined) {
        acceptedAt = coerceFirestoreDateToIso(acceptedAtRaw);
      }
      legalAcceptance = {
        termsVersion: typeof o.termsVersion === 'string' ? o.termsVersion : undefined,
        privacyVersion: typeof o.privacyVersion === 'string' ? o.privacyVersion : undefined,
        acceptedAt,
      };
    }
  } catch {
    legalAcceptance = undefined;
  }

  let studentProfile: Student | null | undefined;
  if (role === UserRole.Student) {
    studentProfile = await resolveStudentProfileForUid(firebaseUser.uid, userData);
  }

  const { phoneNumber, birthYear } = pickSelfServiceUserFields(userData);
  const memberIdRaw = userData?.memberId;
  const memberId =
    typeof memberIdRaw === 'string' && memberIdRaw.trim()
      ? memberIdRaw.trim().slice(0, 40)
      : undefined;
  const summaryNameRaw = userData?.summaryName;
  const summaryName =
    typeof summaryNameRaw === 'string' && summaryNameRaw.trim()
      ? summaryNameRaw.trim().slice(0, 120)
      : undefined;
  const preferredNameRaw = userData?.preferredName;
  const preferredName =
    typeof preferredNameRaw === 'string' && preferredNameRaw.trim()
      ? preferredNameRaw.trim().slice(0, 120)
      : undefined;

  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email ?? '',
    role,
    createdAt: coerceFirestoreDateToIso(userData?.createdAt),
    displayName,
    summaryName,
    preferredName,
    legalAcceptance,
    studentProfile,
    phoneNumber,
    birthYear,
    memberId,
  };
}

/**
 * True when the account must acknowledge the current in-app Terms version (`LEGAL_TERMS_VERSION`).
 *
 * Audit consistency: **admin**, **student**, and **teacher** (when a `legalAcceptance` object exists on the profile)
 * all require `termsVersion === LEGAL_TERMS_VERSION`.
 *
 * Exception (provisioning only): **teacher** accounts with **no** `legalAcceptance` object (`null`/`undefined`)
 * are not blocked, so manually provisioned teachers without that block are not locked out.
 */
export function userLegalAcceptanceIncomplete(user: User): boolean {
  const la = user?.legalAcceptance;
  if (user?.role === 'teacher' && la == null) return false;
  const terms = la?.termsVersion?.trim() ?? '';
  return terms !== LEGAL_TERMS_VERSION;
}

export function getCurrentUser(): User | null {
  return currentUser;
}

/**
 * Re-reads `users/{uid}` into the in-memory session after a self-service merge write
 * (Firestore updates do not re-run `onAuthStateChanged`).
 */
export async function reloadCurrentUserFromFirestore(): Promise<User | null> {
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) return null;
  try {
    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
    if (!userDoc.exists()) return currentUser;
    const userData = userDoc.data() as Record<string, unknown>;
    const role = userData?.role;
    const validRoles = [UserRole.Admin, UserRole.Teacher, UserRole.Student] as const;
    const isValidRole =
      typeof role === 'string' && (validRoles as readonly string[]).includes(role);
    if (!isValidRole) return currentUser;
    const roleTyped = role as UserRole;
    try {
      currentUser = await mapFirestoreUserDocumentToUser(firebaseUser, userData, roleTyped);
    } catch {
      currentUser = buildFallbackUserFromFirebase(firebaseUser, roleTyped, userData);
    }
    return currentUser;
  } catch {
    return currentUser;
  }
}

export type LegalAcceptanceRecord = {
  termsVersion: string;
  privacyVersion: string;
  acceptedAt: unknown; // serverTimestamp()
  userAgent: string;
};

/** Max length for stored signup `legalAcceptance.userAgent` (matches Firestore trigger / functions). */
export const LEGAL_USER_AGENT_MAX_LEN = 300;

/**
 * Strips ASCII control characters and whitespace-normalizes before truncation.
 * Keeps client writes aligned with Cloud Functions / rules expectations (no `\x00`–`\x1f` / `\x7f` in UA).
 */
export function normalizeLegalUserAgent(raw: unknown): string {
  const s = String(raw ?? '');
  const stripped = s.replace(/[\x00-\x1f\x7f]/g, '').trim();
  return stripped.slice(0, LEGAL_USER_AGENT_MAX_LEN);
}

/**
 * Subscribes to Firebase auth state, loads `users/{uid}` for role and email, and notifies the app.
 * If the profile is missing/invalid or reads are denied, the app shows a clear message and signs out
 * instead of crashing during post-login UI boot.
 */
const AUTH_HANDSHAKE_TIMEOUT_MS = 3000;

export function initAuth(onUserChanged: (user: User | null) => void): void {
  try {
    onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
      void (async () => {
        try {
          if (firebaseUser) {
            let handshakeTimer: number | undefined;
            try {
              try {
                sessionStorage.clear();
                localStorage.removeItem('last_viewed_student');
              } catch {
                /* storage may be blocked */
              }
              scheduleAuthUi(() => {
                showLoading();
              });
              const work = (async (): Promise<void> => {
                const userDocRef = doc(db, 'users', firebaseUser.uid);
                const userDoc = await getDoc(userDocRef);

                if (userDoc.exists()) {
                  const userData = userDoc.data() as Record<string, unknown>;
                  const role = userData?.role;
                  const validRoles = [UserRole.Admin, UserRole.Teacher, UserRole.Student] as const;
                  const isValidRole =
                    typeof role === 'string' && (validRoles as readonly string[]).includes(role);
                  if (!isValidRole) {
                    throw new Error(
                      'Your account profile is incomplete (missing role). ' +
                        'Please contact an administrator to finish account setup.'
                    );
                  }
                  const roleTyped = role as UserRole;
                  try {
                    currentUser = await mapFirestoreUserDocumentToUser(
                      firebaseUser,
                      userData,
                      roleTyped
                    );
                  } catch {
                    currentUser = buildFallbackUserFromFirebase(firebaseUser, roleTyped, userData);
                  }
                  onUserChanged(currentUser);
                  startUserDocumentListener(firebaseUser);
                } else {
                  throw new Error(
                    'Your account profile was not found. Please contact an administrator to finish account setup.'
                  );
                }
              })();

              const timeoutPromise = new Promise<'timeout'>((resolve) => {
                handshakeTimer = window.setTimeout(
                  () => resolve('timeout'),
                  AUTH_HANDSHAKE_TIMEOUT_MS
                );
              });
              const first = await Promise.race([
                work.then(() => 'profile' as const),
                timeoutPromise,
              ]);
              if (first === 'timeout') {
                scheduleAuthUi(() => {
                  try {
                    hideLoading();
                  } catch {
                    /* ignore */
                  }
                  try {
                    showAuthContainer();
                  } catch {
                    /* ignore */
                  }
                });
              }

              await work;
            } catch (error: unknown) {
              const code = (error as { code?: string })?.code ?? '';
              if (code === 'permission-denied') {
                reportClientFault(error);
                scheduleAuthUi(() => {
                  showBootstrapError(
                    'Permission denied while loading your profile. This usually means Firestore rules are ' +
                      'blocking access to `users/{uid}`. Please contact support or try again shortly.'
                  );
                });
              } else {
                const msg = error instanceof Error ? error.message : '';
                scheduleAuthUi(() => {
                  showBootstrapError(
                    msg || 'We could not load your account profile. Please try again.'
                  );
                });
              }
              currentUser = null;
              stopUserDocumentListener();
              onUserChanged(null);
              try {
                await Promise.race([
                  signOut(auth),
                  new Promise<void>((resolve) => {
                    window.setTimeout(() => resolve(), 5000);
                  }),
                ]);
              } catch {
                /* ignore */
              }
            } finally {
              if (handshakeTimer !== undefined) {
                window.clearTimeout(handshakeTimer);
              }
              scheduleAuthUi(() => {
                hideLoading();
              });
            }
          } else {
            try {
              sessionStorage.clear();
              localStorage.removeItem('last_viewed_student');
            } catch {
              /* storage may be blocked */
            }
            stopUserDocumentListener();
            currentUser = null;
            onUserChanged(null);
          }
        } catch {
          scheduleAuthUi(() => {
            try {
              hideLoading();
            } catch {
              /* ignore */
            }
          });
          try {
            onUserChanged(null);
          } catch {
            /* host may be torn down */
          }
        }
      })().catch(() => {
        scheduleAuthUi(() => {
          try {
            hideLoading();
          } catch {
            /* ignore */
          }
        });
        try {
          onUserChanged(null);
        } catch {
          /* host may be torn down */
        }
      });
    });
  } catch {
    scheduleAuthUi(() => {
      try {
        hideLoading();
      } catch {
        /* ignore */
      }
      try {
        showAuthContainer();
      } catch {
        /* ignore */
      }
      showBootstrapError(
        'Sign-in could not start in this browser (site data may be blocked). Use a normal window or allow storage for this site, then refresh.'
      );
    });
    try {
      onUserChanged(null);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Creates a Firebase Auth account, writes `users/{uid}` with role `student`, and returns `uid`.
 * Deletes the auth user if the Firestore write fails so no orphan accounts remain.
 */
export async function signUp(
  email: string,
  password: string,
  legalAcceptance: Omit<LegalAcceptanceRecord, 'acceptedAt'>
): Promise<string> {
  let userCredential: { user: import('firebase/auth').User } | null = null;

  try {
    showLoading();
    userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;

    const userDocRef = doc(db, 'users', uid);
    await setDoc(userDocRef, {
      email: String(email).trim(),
      role: UserRole.Student,
      createdAt: new Date().toISOString(),
      legalAcceptance: {
        termsVersion: LEGAL_TERMS_VERSION,
        privacyVersion: LEGAL_PRIVACY_VERSION,
        userAgent: normalizeLegalUserAgent(legalAcceptance.userAgent),
        // Rules tie acceptedAt to request.time; a client Date causes permission-denied / hung signup.
        acceptedAt: serverTimestamp(),
      },
    });

    return uid;
  } catch (error: unknown) {
    if (userCredential?.user) {
      try {
        await deleteUser(userCredential.user);
      } catch {
        try {
          await signOut(auth);
        } catch {
          /* ignore */
        }
      }
    }

    const err = error as { code?: string };
    if (err?.code?.startsWith?.('auth/')) {
      throw new Error(getAuthErrorMessage(err.code));
    }
    if (err?.code === 'permission-denied') {
      throw new Error('Permission denied. Please try again.');
    }
    throw new Error('Signup failed. Please try again.');
  } finally {
    hideLoading();
  }
}

/** Signs in with email/password; throws a user-facing message derived from Firebase error codes. */
export async function signIn(email: string, password: string): Promise<void> {
  try {
    showLoading();
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code ?? '';
    throw new Error(getAuthErrorMessage(code));
  } finally {
    hideLoading();
  }
}

export async function logout(): Promise<void> {
  stopUserDocumentListener();
  runSessionTeardown();
  const shell = document.getElementById('app-mount');
  if (shell) shell.innerHTML = '';
  try {
    sessionStorage.clear();
    localStorage.removeItem('last_viewed_student');
  } catch {
    /* storage may be blocked */
  }
  scheduleAuthUi(() => {
    showLoading();
  });
  try {
    void signOut(auth);
  } catch {
    /* continue; UI is already cleared */
  } finally {
    scheduleAuthUi(() => {
      hideLoading();
    });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }
}

/** Sends a Firebase password-reset email. Returns a user-facing success/error message. */
export async function resetPassword(email: string): Promise<{ ok: boolean; message: string }> {
  try {
    await sendPasswordResetEmail(auth, email);
    return { ok: true, message: 'Password reset email sent. Check your inbox.' };
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code ?? '';
    if (code === 'auth/user-not-found') {
      return {
        ok: true,
        message: 'If an account exists for this email, a reset link has been sent.',
      };
    }
    if (code === 'auth/too-many-requests') {
      return { ok: false, message: 'Too many attempts. Please try again later.' };
    }
    if (code === 'auth/invalid-email') {
      return { ok: false, message: 'Please enter a valid email address.' };
    }
    return { ok: false, message: 'Could not send reset email. Please try again.' };
  }
}

function getAuthErrorMessage(errorCode: string): string {
  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'This email is already registered. Please sign in instead.',
    'auth/invalid-email': 'Invalid email address format.',
    'auth/operation-not-allowed': 'Email/password sign-in is not enabled. Please contact support.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/user-disabled': 'This account has been disabled. Please contact support.',
    'auth/user-not-found': 'No account found with this email. Please sign up first.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Please check your connection.',
  };
  return messages[errorCode] ?? 'Authentication failed. Please try again.';
}
