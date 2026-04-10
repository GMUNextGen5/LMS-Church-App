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
  setDoc,
  serverTimestamp,
  FirebaseUser
} from './firebase';
import { User, UserRole } from './types';
import { showLoading, hideLoading, showBootstrapError } from '../ui/ui';

let currentUser: User | null = null;

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
  onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
    if (firebaseUser) {
      try {
        showLoading();
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();
          const role = userData?.role;
          const validRoles: readonly UserRole[] = ['admin', 'teacher', 'student'] as const;
          const isValidRole = typeof role === 'string' && (validRoles as readonly string[]).includes(role);
          if (!isValidRole) {
            throw new Error(
              'Your account profile is incomplete (missing role). ' +
                'Please contact an administrator to finish account setup.'
            );
          }
          const fromDoc =
            (typeof userData.displayName === 'string' && userData.displayName.trim()) ||
            (typeof userData.fullName === 'string' && userData.fullName.trim()) ||
            (typeof userData.name === 'string' && userData.name.trim()) ||
            '';
          const fromAuth = (firebaseUser.displayName && firebaseUser.displayName.trim()) || '';
          const displayName = fromDoc || fromAuth || undefined;
          currentUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            role: role as UserRole,
            createdAt: userData.createdAt,
            displayName,
          };
          onUserChanged(currentUser);
        } else {
          showBootstrapError(
            'Your account profile was not found. If you were just invited/registered, ' +
              'please contact your administrator to complete your profile setup, then sign in again.'
          );
          currentUser = null;
          onUserChanged(null);
          try { await signOut(auth); } catch {}
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
        try { await signOut(auth); } catch {}
      } finally {
        hideLoading();
      }
    } else {
      currentUser = null;
      onUserChanged(null);
    }
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
        termsVersion: String(legalAcceptance.termsVersion || '').trim(),
        privacyVersion: String(legalAcceptance.privacyVersion || '').trim(),
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
        } catch {}
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
