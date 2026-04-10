import { initializeApp, getApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  Auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  deleteUser,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import {
  getFirestore,
  Firestore,
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  orderBy,
  Timestamp,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import {
  getFunctions,
  Functions,
  httpsCallable,
} from 'firebase/functions';

import { firebaseConfig } from './config';

export let app!: FirebaseApp;
export let auth!: Auth;
export let db!: Firestore;
export let functions!: Functions;

const REQUIRED_FIREBASE_KEYS = ['apiKey', 'authDomain', 'projectId', 'appId'] as const;

/** Ensures required Vite env vars are present before calling `initializeApp`. */
function assertFirebaseEnv(): void {
  const missing = REQUIRED_FIREBASE_KEYS.filter((k) => {
    const v = firebaseConfig[k];
    return typeof v !== 'string' || v.trim() === '';
  });
  if (missing.length > 0) {
    throw new Error(
      `Firebase configuration incomplete (missing: ${missing.join(', ')}). ` +
        'Copy .env.example to .env and set the VITE_FIREBASE_* variables for your project.'
    );
  }
}

let clientInitResult: Error | null | undefined;

/**
 * Initializes the Firebase client once. Safe to call multiple times.
 * Returns `null` on success, or an `Error` if configuration or init failed (no module-load throw).
 */
export function ensureFirebaseClient(): Error | null {
  if (clientInitResult !== undefined) {
    return clientInitResult;
  }
  try {
    assertFirebaseEnv();
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    functions = getFunctions(app, 'us-central1');
    clientInitResult = null;
    return null;
  } catch (err) {
    const e =
      err instanceof Error
        ? err
        : new Error(`Firebase failed to initialize (${String(err)}). Check .env and reload.`);
    clientInitResult = e;
    return e;
  }
}

export {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  deleteUser,
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  orderBy,
  Timestamp,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  httpsCallable,
  type FirebaseUser
};
