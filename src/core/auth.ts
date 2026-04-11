import {
  auth,
  db,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  deleteUser,
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  setDoc,
  serverTimestamp,
  FirebaseUser
} from './firebase';
import { User, UserRole, Student } from './types';
import { LEGAL_PRIVACY_VERSION, LEGAL_TERMS_VERSION } from './legal-versions';
import { showLoading, hideLoading, showBootstrapError } from '../ui/ui';

let currentUser: User | null = null;

type TimestampLike = { toDate?: () => Date };

/**
 * Normalizes Firestore Timestamp, ISO string, number, or Date-like values to an ISO string.
 * Never calls `.toDate()` unless it is a function on the value.
 */
export function coerceFirestoreDateToIso(value: unknown): string {
  if (value == null || value === '') {
    return new Date().toISOString();
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
  try {
    const date = new Date(value as string | number | Date);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  } catch {
    /* ignore */
  }
  return new Date().toISOString();
}

function mapStudentFirestoreToStudent(id: string, raw: Record<string, unknown>): Student | null {
  try {
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
  let legalAcceptance: User['legalAcceptance'];
  try {
    const laRaw = userData?.legalAcceptance;
    if (laRaw != null && typeof laRaw === 'object') {
      const o = laRaw as Record<string, unknown>;
      legalAcceptance = {
        termsVersion: typeof o.termsVersion === 'string' ? o.termsVersion : undefined,
        privacyVersion: typeof o.privacyVersion === 'string' ? o.privacyVersion : undefined,
        acceptedAt:
          o.acceptedAt !== undefined ? coerceFirestoreDateToIso(o.acceptedAt) : undefined,
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

  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email ?? '',
    role,
    createdAt: coerceFirestoreDateToIso(userData?.createdAt),
    displayName,
    legalAcceptance,
    studentProfile: role === 'student' ? null : undefined,
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

  const laRaw = userData?.legalAcceptance;
  let legalAcceptance: User['legalAcceptance'];
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

  let studentProfile: Student | null | undefined;
  if (role === 'student') {
    studentProfile = await resolveStudentProfileForUid(firebaseUser.uid, userData);
  }

  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email ?? '',
    role,
    createdAt: coerceFirestoreDateToIso(userData?.createdAt),
    displayName,
    legalAcceptance,
    studentProfile,
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

export type LegalAcceptanceRecord = {
  termsVersion: string;
  privacyVersion: string;
  acceptedAt: unknown; // serverTimestamp()
  userAgent: string;
};

/**
 * Subscribes to Firebase auth state, loads `users/{uid}` for role and email, and notifies the app.
 * If the profile is missing/invalid or reads are denied, the app shows a clear message and signs out
 * instead of crashing during post-login UI boot.
 */
export function initAuth(onUserChanged: (user: User | null) => void): void {
  onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
    void (async () => {
      if (firebaseUser) {
        try {
          showLoading();
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists()) {
            const userData = userDoc.data() as Record<string, unknown>;
            const role = userData?.role;
            const validRoles: readonly UserRole[] = ['admin', 'teacher', 'student'] as const;
            const isValidRole = typeof role === 'string' && (validRoles as readonly string[]).includes(role);
            if (!isValidRole) {
              throw new Error(
                'Your account profile is incomplete (missing role). ' +
                  'Please contact an administrator to finish account setup.'
              );
            }
            const roleTyped = role as UserRole;
            try {
              currentUser = await mapFirestoreUserDocumentToUser(firebaseUser, userData, roleTyped);
            } catch {
              currentUser = buildFallbackUserFromFirebase(firebaseUser, roleTyped, userData);
            }
            onUserChanged(currentUser);
          } else {
            throw new Error(
              'Your account profile was not found. Please contact an administrator to finish account setup.'
            );
          }
        } catch (error: unknown) {
          const code = (error as { code?: string })?.code ?? '';
          if (code === 'permission-denied') {
            showBootstrapError(
              'Permission denied while loading your profile. This usually means Firestore rules are ' +
                'blocking access to `users/{uid}`. Please contact support or try again shortly.'
            );
          } else {
            const msg = error instanceof Error ? error.message : '';
            showBootstrapError(msg || 'We could not load your account profile. Please try again.');
          }
          currentUser = null;
          onUserChanged(null);
          try {
            await signOut(auth);
          } catch {
            /* ignore */
          }
        } finally {
          hideLoading();
        }
      } else {
        currentUser = null;
        onUserChanged(null);
      }
    })().catch((err) => {
      console.error('Auth state handler failed', err);
      try {
        hideLoading();
      } catch {
        /* ignore */
      }
    });
  });
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
      role: 'student',
      createdAt: new Date().toISOString(),
      legalAcceptance: {
        termsVersion: LEGAL_TERMS_VERSION,
        privacyVersion: LEGAL_PRIVACY_VERSION,
        userAgent: String(legalAcceptance.userAgent || '').slice(0, 300),
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
  try {
    showLoading();
    await signOut(auth);
  } catch {
    throw new Error('Failed to sign out. Please try again.');
  } finally {
    hideLoading();
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
    'auth/network-request-failed': 'Network error. Please check your connection.'
  };
  return messages[errorCode] ?? 'Authentication failed. Please try again.';
}
