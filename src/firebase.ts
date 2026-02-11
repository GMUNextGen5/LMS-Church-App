/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FIREBASE SDK INITIALIZATION AND EXPORTS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Central Firebase initialization module. Initializes all Firebase services
 * and exports configured instances and methods for use throughout the app.
 * 
 * ARCHITECTURE:
 * This file serves as the single source of truth for Firebase configuration.
 * All other files import Firebase services from here, ensuring consistent
 * initialization and configuration across the entire application.
 * 
 * SERVICES INITIALIZED:
 * 1. Firebase App: Core Firebase application instance
 * 2. Authentication: User sign-up, sign-in, and session management
 * 3. Firestore: NoSQL database for storing all application data
 * 4. Cloud Functions: Server-side logic and AI integration
 * 
 * IMPORT PATTERN:
 * ✅ Good:  import { auth, db, functions } from './firebase';
 * ❌ Bad:   import { getAuth } from 'firebase/auth'; // Don't re-initialize!
 * 
 * DEBUGGING:
 * If Firebase services fail to initialize:
 * 1. Check browser console for initialization errors
 * 2. Verify firebaseConfig in config.ts is correct
 * 3. Check Firebase Console for service status
 * 4. Verify project exists and services are enabled
 * 5. Check network connectivity (Network tab in DevTools)
 * 6. Look for CORS errors (especially for Functions)
 * 
 * ERROR HANDLING:
 * If initialization fails, the error is logged and re-thrown, preventing
 * the application from loading with broken Firebase services.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Import Firebase SDK modules
import { initializeApp, FirebaseApp } from 'firebase/app';

// Authentication imports
import {
  getAuth,                            // Get Auth instance
  Auth,                               // Auth type
  createUserWithEmailAndPassword,     // Sign up method
  signInWithEmailAndPassword,         // Sign in method
  signOut,                            // Sign out method
  onAuthStateChanged,                 // Auth state listener
  User as FirebaseUser                // Firebase User type
} from 'firebase/auth';

// Firestore imports
import {
  getFirestore,       // Get Firestore instance
  Firestore,          // Firestore type
  doc,                // Get document reference
  getDoc,             // Read single document
  setDoc,             // Write/overwrite document
  collection,         // Get collection reference
  query,              // Build query
  where,              // Query filter
  getDocs,            // Execute query and get results
  addDoc,             // Add new document with auto-generated ID
  updateDoc,          // Update existing document fields
  deleteDoc,          // Delete document
  onSnapshot,         // Real-time listener for documents/queries
  orderBy,            // Query ordering
  Timestamp,          // Firestore timestamp type
  arrayUnion,         // Add items to array field
  arrayRemove,        // Remove items from array field
} from 'firebase/firestore';

// Cloud Functions imports
import {
  getFunctions,               // Get Functions instance
  Functions,                  // Functions type
  httpsCallable,              // Create callable function reference
} from 'firebase/functions';

// Import configuration
import { firebaseConfig } from './config';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FIREBASE INITIALIZATION
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Firebase service instances (initialized below)
let app: FirebaseApp;         // Core Firebase app
let auth: Auth;               // Authentication service
let db: Firestore;            // Firestore database
let functions: Functions;     // Cloud Functions service

try {
  // STEP 1: Initialize Firebase App
  app = initializeApp(firebaseConfig);

  // STEP 2: Initialize Authentication
  auth = getAuth(app);

  // STEP 3: Initialize Firestore Database
  db = getFirestore(app);

  // STEP 4: Initialize Cloud Functions (us-central1 region)
  functions = getFunctions(app, 'us-central1');

} catch (error) {
  /**
   * INITIALIZATION ERROR HANDLING
   * 
   * If any Firebase service fails to initialize, log detailed error
   * information and re-throw to prevent app from running with broken services.
   * 
   * COMMON ERRORS:
   * - Invalid configuration: Check firebaseConfig values
   * - Network error: Check internet connection
   * - Service disabled: Enable service in Firebase Console
   * - Quota exceeded: Check Firebase usage/billing
   * 
   * DEBUG:
   * 1. Check error message in console
   * 2. Verify Firebase project exists in console
   * 3. Check all services are enabled
   * 4. Verify network connectivity
   * 5. Check Firebase status page for outages
   */
  console.error('Firebase initialization failed:', error);
  throw error;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXPORTS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * USAGE:
 * Import these in other files to access Firebase services:
 * 
 * import { auth, db, functions } from './firebase';
 * import { doc, getDoc, setDoc } from './firebase';
 * 
 * INSTANCES:
 * - app: Core Firebase application
 * - auth: Authentication service
 * - db: Firestore database
 * - functions: Cloud Functions service
 * 
 * METHODS:
 * Commonly used Firebase methods are re-exported for convenience
 * This ensures consistent imports across the application
 */

export {
  // ========== SERVICE INSTANCES ==========
  app,          // Firebase App instance
  auth,         // Authentication instance
  db,           // Firestore instance
  functions,    // Cloud Functions instance

  // ========== AUTHENTICATION METHODS ==========
  createUserWithEmailAndPassword,    // Sign up new user
  signInWithEmailAndPassword,        // Sign in existing user
  signOut,                           // Sign out current user
  onAuthStateChanged,                // Listen to auth state changes

  // ========== FIRESTORE METHODS ==========
  doc,          // Get document reference
  getDoc,       // Read document once
  setDoc,       // Write/overwrite document
  collection,   // Get collection reference
  query,        // Build query
  where,        // Add where clause to query
  getDocs,      // Execute query and get all documents
  addDoc,       // Add document with auto ID
  updateDoc,    // Update document fields
  deleteDoc,    // Delete document
  onSnapshot,   // Real-time listener
  orderBy,      // Order query results
  Timestamp,    // Firestore timestamp type
  arrayUnion,   // Add to array field
  arrayRemove,  // Remove from array field

  // ========== CLOUD FUNCTIONS METHODS ==========
  httpsCallable,    // Create callable function reference

  // ========== TYPES ==========
  type FirebaseUser    // Firebase User type for TypeScript
};

