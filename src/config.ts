/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FIREBASE CONFIGURATION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Firebase project configuration for connecting client-side application to
 * Firebase services (Authentication, Firestore, Cloud Functions).
 * 
 * SERVICES USED:
 * - Firebase Authentication: User sign up, sign in, session management
 * - Cloud Firestore: NoSQL database for all application data
 * - Cloud Functions: Server-side AI integration and admin operations
 * 
 * SECURITY:
 * ⚠️ API keys in Firebase config are PUBLIC and safe to commit to Git
 * They are restricted by Firebase security rules, not by hiding the key
 * 
 * Real security is enforced by:
 * - Firestore Security Rules (/firestore.rules)
 * - Cloud Functions authentication checks
 * - Firebase Authentication session tokens
 * 
 * SETUP:
 * This configuration was obtained from Firebase Console:
 * Project Settings → General → Your apps → SDK setup and configuration
 * 
 * DEBUGGING:
 * If Firebase connection fails:
 * 1. Check Firebase Console for project status
 * 2. Verify all services are enabled (Auth, Firestore, Functions)
 * 3. Check browser console for detailed error messages
 * 4. Verify network connectivity (check Network tab in DevTools)
 * 5. Check if Firebase domain is blocked by firewall/ad blocker
 * 
 * IMPORTANT FIELDS:
 * - projectId: Identifies your Firebase project (replace with YOUR_PROJECT_ID)
 * - apiKey: Public API key for client SDK (safe to expose, but use your own)
 * - authDomain: Domain for Firebase Auth redirects (format: YOUR_PROJECT_ID.firebaseapp.com)
 * - appId: Unique identifier for this Firebase app (get from Firebase Console)
 * 
 * MIGRATION:
 * If migrating to a new Firebase project:
 * 1. Create new project in Firebase Console
 * 2. Enable Authentication, Firestore, Functions
 * 3. Copy new config from Project Settings
 * 4. Replace values below
 * 5. Update Firestore security rules
 * 6. Redeploy Cloud Functions
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const firebaseConfig = {
  // ⚠️ REPLACE WITH YOUR FIREBASE CONFIGURATION
  // Get this from Firebase Console → Project Settings → Your apps → Web app
  
  // Public API key (safe to expose, restricted by security rules)
  apiKey: "VITE_FIREBASE_API_KEY",
  
  // Auth domain for OAuth redirects (format: YOUR_PROJECT_ID.firebaseapp.com)
  authDomain: "VITE_FIREBASE_AUTH_DOMAIN",
  
  // Project identifier (your Firebase project ID)
  projectId: "VITE_FIREBASE_PROJECT_ID",
  
  // Cloud Storage bucket (format: YOUR_PROJECT_ID.appspot.com)
  storageBucket: "VITE_FIREBASE_STORAGE_BUCKET",
  
  // Firebase Cloud Messaging sender ID (from Firebase Console)
  messagingSenderId: "VITE_FIREBASE_MESSAGING_SENDER_ID",
  
  // Unique app identifier (from Firebase Console)
  appId: "VITE_FIREBASE_APP_ID"
};

