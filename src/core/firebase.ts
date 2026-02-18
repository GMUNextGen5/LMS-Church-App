import { initializeApp, FirebaseApp } from 'firebase/app';
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
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import {
  getFunctions,
  Functions,
  httpsCallable,
} from 'firebase/functions';

import { firebaseConfig } from './config';

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let functions: Functions;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  functions = getFunctions(app, 'us-central1');
} catch {
  throw new Error('Initialization failed');
}

export {
  app,
  auth,
  db,
  functions,
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
  arrayUnion,
  arrayRemove,
  httpsCallable,
  type FirebaseUser
};
