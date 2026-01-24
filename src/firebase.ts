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
 * EMULATOR SUPPORT:
 * - Automatically detects localhost and connects to emulator if available
 * - Falls back to production if emulator is not running
 * - To use emulator: cd functions && npm run serve
 * - Emulator runs on localhost:5001 by default
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
  Timestamp           // Firestore timestamp type
} from 'firebase/firestore';

// Cloud Functions imports
import {
  getFunctions,               // Get Functions instance
  Functions,                  // Functions type
  httpsCallable,              // Create callable function reference
  connectFunctionsEmulator    // Connect to local emulator
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
  console.log('🔧 [Firebase] Initializing Firebase services...');

  /**
   * STEP 1: Initialize Firebase App
   * 
   * This creates the core Firebase app instance using configuration
   * from config.ts. All other services depend on this initialization.
   * 
   * DEBUG: If this fails, check firebaseConfig in config.ts
   */
  app = initializeApp(firebaseConfig);
  console.log('✅ [Firebase] App initialized');

  /**
   * STEP 2: Initialize Authentication
   * 
   * Sets up Firebase Authentication for user management.
   * Handles sign-up, sign-in, session management, and auth state.
   * 
   * DEBUG: If auth fails, check:
   * - Firebase Auth is enabled in Firebase Console
   * - Email/Password provider is enabled
   * - Browser allows cookies (required for auth persistence)
   */
  auth = getAuth(app);
  console.log('✅ [Firebase] Authentication initialized');

  /**
   * STEP 3: Initialize Firestore Database
   * 
   * Sets up Firestore connection for reading/writing application data.
   * All collections (users, students, grades, etc.) are stored here.
   * 
   * DEBUG: If Firestore fails, check:
   * - Firestore is enabled in Firebase Console
   * - Security rules are deployed (firestore.rules)
   * - Network allows connections to firestore.googleapis.com
   */
  db = getFirestore(app);
  console.log('✅ [Firebase] Firestore initialized');

  /**
   * STEP 4: Initialize Cloud Functions
   * 
   * Sets up connection to Cloud Functions for server-side operations.
   * Functions are deployed to us-central1 region.
   * 
   * IMPORTANT: Region MUST match deployment region in Firebase Console
   * If functions are deployed to a different region, update 'us-central1' below
   * 
   * DEBUG: If functions fail, check:
   * - Functions are deployed (firebase deploy --only functions)
   * - Region matches deployment region
   * - CORS is configured (handled automatically by Firebase v2 functions)
   */
  functions = getFunctions(app, 'us-central1');
  console.log('✅ [Firebase] Cloud Functions initialized (region: us-central1)');

  /**
   * STEP 5: Emulator Connection (Development Only)
   * 
   * If running on localhost, attempts to connect to local Functions emulator.
   * This allows testing functions locally without deploying to Firebase.
   * 
   * BEHAVIOR:
   * - If emulator is running: Uses local functions
   * - If emulator is not running: Falls back to production functions
   * 
   * SETUP:
   * 1. cd functions
   * 2. npm run serve
   * 3. Emulator runs on http://localhost:5001
   * 
   * DEBUG: If emulator connection fails:
   * - Check emulator is running (terminal should show "functions: Emulator started at...")
   * - Verify port 5001 is not blocked by firewall
   * - Check console logs for connection errors
   * - Use production functions as fallback if emulator issues persist
   */
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    try {
      connectFunctionsEmulator(functions, 'localhost', 5001);
      console.log('🔧 [Firebase] Connected to Functions emulator (localhost:5001)');
      console.log('💡 [Firebase] To start emulator: cd functions && npm run serve');
    } catch (emulatorError) {
      console.warn('⚠️ [Firebase] Failed to connect to emulator, using production functions');
      console.warn('   Error:', emulatorError);
    }
  } else {
    console.log('🌐 [Firebase] Using production Cloud Functions');
  }

  console.log('✅ [Firebase] All services initialized successfully');
  console.log('📊 [Firebase] Project:', firebaseConfig.projectId);

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
  console.error('❌ [Firebase] Initialization failed!');
  console.error('   Error details:', error);
  console.error('   Config used:', firebaseConfig);
  console.error('   Please check:');
  console.error('   1. Firebase project exists and is active');
  console.error('   2. All services (Auth, Firestore, Functions) are enabled');
  console.error('   3. Configuration in config.ts is correct');
  console.error('   4. Network connectivity is working');

  // Re-throw error to prevent app from loading
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

  // ========== CLOUD FUNCTIONS METHODS ==========
  httpsCallable,    // Create callable function reference

  // ========== TYPES ==========
  type FirebaseUser    // Firebase User type for TypeScript
};

