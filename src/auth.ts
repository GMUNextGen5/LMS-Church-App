/**
 * Authentication Logic
 *
 * Two-layer auth: Firebase Auth (credentials) + Firestore /users/{uid} (role/metadata).
 * See DEVELOPER_GUIDE.md for architecture details.
 */

import {
  auth, db,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  onAuthStateChanged, doc, getDoc, setDoc, FirebaseUser
} from './firebase';
import { User, UserRole } from './types';
import { showLoading, hideLoading } from './ui';

/** Current authenticated user (in-memory cache). Null = not authenticated. */
let currentUser: User | null = null;

/** Get current authenticated user */
export function getCurrentUser(): User | null {
  return currentUser;
}

/**
 * Initialize Firebase auth state listener.
 * Loads user profile from Firestore and notifies app on auth changes.
 */
export function initAuth(onUserChanged: (user: User | null) => void): void {
  console.log('🔐 [initAuth] Setting up authentication state listener...');

  onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
    console.log('👤 [onAuthStateChanged] Auth state changed:', {
      authenticated: !!firebaseUser,
      uid: firebaseUser?.uid,
      email: firebaseUser?.email
    });

    if (firebaseUser) {
      try {
        showLoading();
        console.log('📊 [onAuthStateChanged] Fetching user profile from Firestore...');

        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();
          currentUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            role: userData.role as UserRole,
            createdAt: userData.createdAt
          };

          console.log('✅ [onAuthStateChanged] User authenticated:', currentUser.email, 'Role:', currentUser.role);
          onUserChanged(currentUser);
        } else {
          console.error('❌ [onAuthStateChanged] User document not found at /users/' + firebaseUser.uid);
          currentUser = null;
          onUserChanged(null);
          await signOut(auth);
        }
      } catch (error: any) {
        console.error('❌ [onAuthStateChanged] Error fetching user profile:', error.code, error.message);
        currentUser = null;
        onUserChanged(null);
      } finally {
        hideLoading();
      }
    } else {
      console.log('👋 [onAuthStateChanged] User signed out');
      currentUser = null;
      onUserChanged(null);
    }
  });

  console.log('✅ [initAuth] Auth state listener active');
}

/**
 * Sign up a new user. Creates Firebase Auth account + Firestore profile.
 * Returns the new user's UID (must be shared with admin for student registration).
 */
export async function signUp(email: string, password: string): Promise<string> {
  try {
    showLoading();
    console.log('📝 [signUp] Starting sign-up for:', email);

    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;
    console.log('✅ [signUp] Auth account created, UID:', uid);

    // Create Firestore user profile (defaults to 'student' role)
    const userDocRef = doc(db, 'users', uid);
    await setDoc(userDocRef, {
      email: email,
      role: 'student',
      createdAt: new Date().toISOString()
    });

    console.log('✅ [signUp] Firestore profile created at /users/' + uid);
    return uid;
  } catch (error: any) {
    console.error('❌ [signUp] Failed:', error.code, error.message);
    throw new Error(getAuthErrorMessage(error.code));
  } finally {
    hideLoading();
  }
}

/** Sign in an existing user with email/password */
export async function signIn(email: string, password: string): Promise<void> {
  try {
    showLoading();
    console.log('🔐 [signIn] Attempting sign in for:', email);
    await signInWithEmailAndPassword(auth, email, password);
    console.log('✅ [signIn] Sign in successful');
  } catch (error: any) {
    console.error('❌ [signIn] Failed:', error.code, error.message);
    throw new Error(getAuthErrorMessage(error.code));
  } finally {
    hideLoading();
  }
}

/** Sign out current user */
export async function logout(): Promise<void> {
  try {
    showLoading();
    console.log('👋 [logout] Signing out...');
    await signOut(auth);
    console.log('✅ [logout] Signed out');
  } catch (error) {
    console.error('❌ [logout] Failed:', error);
    throw new Error('Failed to sign out. Please try again.');
  } finally {
    hideLoading();
  }
}

/** Convert Firebase error codes to user-friendly messages */
function getAuthErrorMessage(errorCode: string): string {
  switch (errorCode) {
    case 'auth/email-already-in-use':
      return 'This email is already registered. Please sign in instead.';
    case 'auth/invalid-email':
      return 'Invalid email address format.';
    case 'auth/operation-not-allowed':
      return 'Email/password accounts are not enabled. Please contact support.';
    case 'auth/weak-password':
      return 'Password is too weak. Please use at least 6 characters.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact support.';
    case 'auth/user-not-found':
      return 'No account found with this email. Please sign up first.';
    case 'auth/wrong-password':
      return 'Incorrect password. Please try again.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your internet connection.';
    default:
      console.warn('⚠️ Unknown auth error code:', errorCode);
      return 'Authentication failed. Please try again.';
  }
}
