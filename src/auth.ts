/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUTHENTICATION LOGIC
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Centralized authentication management including sign-up, sign-in, sign-out,
 * and auth state management. Handles both Firebase Auth and Firestore user
 * profile synchronization.
 * 
 * ARCHITECTURE:
 * Two-layer authentication system:
 * 1. Firebase Authentication: Handles authentication credentials (email/password)
 * 2. Firestore User Profile: Stores user role and metadata in /users/{uid}
 * 
 * AUTH FLOW:
 * 
 * SIGN UP:
 * 1. User enters email/password
 * 2. Firebase Auth creates authentication account → gets UID
 * 3. Firestore user document created at /users/{uid} with role='student'
 * 4. UID is shown to user for admin registration
 * 5. Auth state listener triggers, loading user profile
 * 
 * SIGN IN:
 * 1. User enters email/password
 * 2. Firebase Auth validates credentials
 * 3. Auth state listener triggers
 * 4. User profile loaded from Firestore /users/{uid}
 * 5. UI configured based on user role
 * 
 * SIGN OUT:
 * 1. Firebase Auth session cleared
 * 2. Auth state listener triggers with null user
 * 3. UI switches to login screen
 * 4. Application state reset
 * 
 * STATE MANAGEMENT:
 * - currentUser: In-memory cache of authenticated user's profile
 * - onAuthStateChanged: Firebase listener that triggers on auth changes
 * - Persistent session: Firebase handles session persistence in browser
 * 
 * DEBUGGING:
 * If authentication issues occur:
 * 1. Check browser console for detailed error logs
 * 2. Verify Firebase Auth is enabled in Firebase Console
 * 3. Check /users/{uid} document exists in Firestore
 * 4. Verify user's role is set correctly
 * 5. Check Firestore security rules allow read access to /users/{uid}
 * 6. Clear browser cache and cookies if session issues persist
 * 7. Use Chrome DevTools → Application → Storage to inspect auth tokens
 * 
 * SECURITY:
 * - Passwords never stored or logged
 * - Auth tokens stored securely by Firebase SDK
 * - Role-based access enforced by Firestore security rules
 * - Session tokens automatically refreshed by Firebase
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Import Firebase services and methods
import { 
  auth,                                // Authentication instance
  db,                                  // Firestore instance
  createUserWithEmailAndPassword,      // Sign up method
  signInWithEmailAndPassword,          // Sign in method
  signOut,                             // Sign out method
  onAuthStateChanged,                  // Auth state listener
  doc,                                 // Document reference
  getDoc,                              // Read document
  setDoc,                              // Write document
  FirebaseUser                         // Firebase User type
} from './firebase';

// Import type definitions
import { User, UserRole } from './types';

// Import UI helpers
import { showLoading, hideLoading } from './ui';

/**
 * Current authenticated user profile (in-memory cache)
 * 
 * STRUCTURE: Contains user UID, email, role, and creation timestamp
 * 
 * LIFECYCLE:
 * - Set when user signs in (onAuthStateChanged)
 * - Cleared when user signs out
 * - Used throughout app to check authentication and authorization
 * 
 * NULL STATE: null means no user is currently authenticated
 * 
 * DEBUG:
 * - If null when user should be logged in: Check auth state listener
 * - If role is wrong: Check /users/{uid} document in Firestore
 * - If data is stale: Session may need refresh (rare, handled automatically)
 */
let currentUser: User | null = null;

/**
 * Get current authenticated user
 * 
 * RETURNS: User object if authenticated, null otherwise
 * 
 * USAGE:
 * - Check if user is logged in: if (getCurrentUser()) { ... }
 * - Get user role: getCurrentUser()?.role
 * - Get user UID: getCurrentUser()?.uid
 * 
 * NOTE: This returns cached value. For real-time auth state, use initAuth()
 * 
 * DEBUG:
 * - Returns null: User not logged in or auth not initialized
 * - Returns stale data: Auth state may need refresh (rare)
 */
export function getCurrentUser(): User | null {
  return currentUser;
}

/**
 * Initialize authentication state listener
 * 
 * PURPOSE:
 * Sets up Firebase auth state listener that triggers whenever authentication
 * state changes (sign in, sign out, token refresh, etc.)
 * 
 * PARAMETERS:
 * - onUserChanged: Callback function called with User object or null
 * 
 * BEHAVIOR:
 * - Called automatically by Firebase when auth state changes
 * - Loads user profile from Firestore on sign in
 * - Triggers UI updates based on authentication state
 * - Runs once on page load to restore session
 * 
 * LIFECYCLE:
 * 1. App starts → listener installed
 * 2. Firebase checks for existing session
 * 3. If session exists → User profile loaded → onUserChanged(user)
 * 4. If no session → onUserChanged(null)
 * 5. On sign in/out → onUserChanged called again
 * 
 * DEBUGGING:
 * If auth state not updating:
 * 1. Check console logs for "User authenticated" message
 * 2. Verify onUserChanged callback is provided
 * 3. Check Firestore /users/{uid} document exists
 * 4. Verify user document has 'role' field
 * 5. Check network tab for Firestore queries
 * 6. Look for permission-denied errors (check security rules)
 * 
 * PERFORMANCE:
 * - Listener is efficient, only triggers on actual state changes
 * - Firestore query cached after first load
 * - Loading indicator shown during profile fetch
 */
export function initAuth(onUserChanged: (user: User | null) => void): void {
  
  /**
   * Firebase Auth State Listener
   * 
   * TRIGGERS:
   * - On app load (checks for existing session)
   * - When user signs in
   * - When user signs out
   * - When auth token refreshes (automatically by Firebase)
   * 
   * PARAMETER: firebaseUser
   * - Non-null: User is authenticated with Firebase Auth
   * - Null: User is not authenticated
   */
  onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
    if (firebaseUser) {
      /**
       * USER IS SIGNED IN
       * 
       * STEPS:
       * 1. Show loading indicator
       * 2. Fetch user profile from Firestore /users/{uid}
       * 3. Build User object with role and metadata
       * 4. Update currentUser cache
       * 5. Notify app via onUserChanged callback
       * 6. Hide loading indicator
       */
      try {
        showLoading();
        
        // Fetch user document from Firestore
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          /**
           * USER PROFILE FOUND
           * 
           * Profile contains:
           * - role: UserRole ('admin' | 'teacher' | 'student')
           * - createdAt: ISO timestamp of account creation
           * - email: User's email address
           */
          const userData = userDoc.data();
          
          // Build User object
          currentUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            role: userData.role as UserRole,
            createdAt: userData.createdAt
          };
          
          onUserChanged(currentUser);
          
        } else {
          /**
           * USER PROFILE NOT FOUND
           * 
           * This shouldn't happen in normal operation. It means:
           * - User has Firebase Auth account
           * - But no corresponding Firestore /users/{uid} document
           * 
           * RECOVERY:
           * - Log error
           * - Sign user out
           * - Show login screen
           * 
           * CAUSES:
           * - Sign-up process failed midway
           * - User document was manually deleted
           * - Database security rules prevented document creation
           * 
           * FIX:
           * - Admin should create user document manually
           * - Or user should sign up again
           */
          console.error('User document not found in Firestore for UID:', firebaseUser.uid);
          
          currentUser = null;
          onUserChanged(null);
          
          // Sign out to force user to login screen
          await signOut(auth);
        }
        
      } catch (error: any) {
        /**
         * ERROR FETCHING USER PROFILE
         * 
         * POSSIBLE CAUSES:
         * - Network error
         * - Firestore permission denied (check security rules)
         * - Firestore service unavailable
         * - Invalid UID format
         * 
         * DEBUG:
         * 1. Check error message in console
         * 2. Verify Firestore security rules allow read to /users/{uid}
         * 3. Check network connectivity
         * 4. Verify UID is valid
         * 5. Check Firebase Console for service status
         */
        console.error('Error fetching user profile:', error);
        
        currentUser = null;
        onUserChanged(null);
        
      } finally {
        hideLoading();
      }
      
    } else {
      /**
       * USER IS SIGNED OUT
       * 
       * TRIGGERS:
       * - User clicked logout
       * - Session expired
       * - User was signed out by another tab
       * - Initial page load with no session
       * 
       * ACTION:
       * - Clear currentUser cache
       * - Notify app via onUserChanged(null)
       * - App will show login screen
       */
      currentUser = null;
      onUserChanged(null);
    }
  });
  
}

/**
 * Sign up a new user
 * 
 * PURPOSE:
 * Creates new user account with email/password and initializes Firestore
 * user profile with default 'student' role.
 * 
 * PARAMETERS:
 * - email: User's email address (must be valid format)
 * - password: User's password (min 6 characters by Firebase)
 * 
 * RETURNS:
 * - UID string: New user's Firebase Auth UID
 * 
 * PROCESS:
 * 1. Show loading indicator
 * 2. Create Firebase Auth account → get UID
 * 3. Create Firestore user document at /users/{uid}
 * 4. Set role to 'student' by default
 * 5. Return UID so it can be shown to user
 * 6. Hide loading indicator
 * 
 * UID IMPORTANCE:
 * The returned UID MUST be shared with admin for student registration.
 * Without this, admin cannot link student records to the user account.
 * 
 * ROLE ASSIGNMENT:
 * - New users default to 'student' role
 * - Admin can change role via User Management
 * - Teachers must be promoted by admin
 * 
 * ERRORS:
 * - Email already in use: User should sign in instead
 * - Invalid email: Check email format
 * - Weak password: Use 6+ characters
 * - Network error: Check internet connection
 * - Permission denied: Check Firestore security rules
 * 
 * DEBUGGING:
 * If signup fails:
 * 1. Check console logs for detailed error
 * 2. Verify email format is valid
 * 3. Verify password meets Firebase requirements (6+ chars)
 * 4. Check Firebase Auth is enabled
 * 5. Check Firestore rules allow user document creation
 * 6. Verify network connectivity
 * 7. Check Firebase Console for quota limits
 * 
 * SECURITY:
 * - Password is never stored or logged
 * - Firebase handles password hashing
 * - User document created with minimal data
 * - Role defaults to least-privileged (student)
 */
export async function signUp(email: string, password: string): Promise<string> {
  try {
    showLoading();
    
    /**
     * STEP 1: Create Firebase Authentication Account
     * 
     * This creates the authentication credentials and returns a UID.
     * The UID is a unique identifier for this user across all Firebase services.
     * 
     * ERRORS:
     * - auth/email-already-in-use: Email is registered (use sign in)
     * - auth/invalid-email: Email format is invalid
     * - auth/weak-password: Password too short (< 6 chars)
     */
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;
    
    /**
     * STEP 2: Create Firestore User Profile
     * 
     * Creates user document at /users/{uid} with:
     * - email: User's email
     * - role: 'student' (default for new users)
     * - createdAt: Current timestamp
     * 
     * IMPORTANT:
     * This document is required for the app to work.
     * Without it, user cannot log in (auth state listener will fail).
     * 
     * ERRORS:
     * - permission-denied: Check Firestore security rules
     * - network-error: Check internet connection
     */
    const userDocRef = doc(db, 'users', uid);
    await setDoc(userDocRef, {
      email: email,
      role: 'student',           // ⭐ All new signups default to student
      createdAt: new Date().toISOString()
    });
    
    return uid;
    
  } catch (error: any) {
    /**
     * ERROR HANDLING
     * 
     * Catches and logs all errors, then throws user-friendly message.
     * 
     * COMMON ERRORS:
     * - Email already in use → User should sign in
     * - Invalid email → Check email format
     * - Weak password → Use 6+ characters
     * - Network error → Check connection
     * - Permission denied → Check security rules
     */
    console.error('Sign up failed:', error.code);
    throw new Error(getAuthErrorMessage(error.code));
    
  } finally {
    hideLoading();
  }
}

/**
 * Sign in an existing user
 * 
 * PURPOSE:
 * Authenticates user with email/password credentials.
 * 
 * PARAMETERS:
 * - email: User's registered email address
 * - password: User's password
 * 
 * PROCESS:
 * 1. Show loading indicator
 * 2. Call Firebase Auth sign in
 * 3. Firebase validates credentials
 * 4. If valid: Auth state listener triggers → loads profile
 * 5. If invalid: Error thrown
 * 6. Hide loading indicator
 * 
 * SUCCESS:
 * - onAuthStateChanged listener triggers
 * - User profile loaded from Firestore
 * - UI updated based on user role
 * - User sees dashboard
 * 
 * ERRORS:
 * - Wrong password: Password incorrect
 * - User not found: Email not registered
 * - User disabled: Account deactivated
 * - Network error: No internet
 * 
 * DEBUGGING:
 * If sign in fails:
 * 1. Check console for error code
 * 2. Verify email is registered in Firebase Auth console
 * 3. Verify password is correct
 * 4. Check Firebase Auth is enabled
 * 5. Try password reset if password forgotten
 * 6. Check network connectivity
 */
export async function signIn(email: string, password: string): Promise<void> {
  try {
    showLoading();
    
    /**
     * Firebase Sign In
     * 
     * Validates credentials and creates auth session.
     * On success, onAuthStateChanged listener will trigger.
     */
    await signInWithEmailAndPassword(auth, email, password);
    
  } catch (error: any) {
    console.error('Sign in failed:', error.code);
    throw new Error(getAuthErrorMessage(error.code));
    
  } finally {
    hideLoading();
  }
}

/**
 * Sign out current user
 * 
 * PURPOSE:
 * Ends user session and returns to login screen.
 * 
 * PROCESS:
 * 1. Show loading indicator
 * 2. Call Firebase Auth sign out
 * 3. Firebase clears auth session
 * 4. onAuthStateChanged triggers with null
 * 5. App state reset
 * 6. UI shows login screen
 * 7. Hide loading indicator
 * 
 * CLEANUP:
 * - Firebase session cleared
 * - currentUser set to null
 * - UI components reset
 * - Real-time listeners unsubscribed (in main.ts)
 * 
 * DEBUGGING:
 * If logout fails:
 * 1. Check console for error
 * 2. Verify network connectivity
 * 3. Try closing and reopening tab
 * 4. Clear browser cache/cookies
 */
export async function logout(): Promise<void> {
  try {
    showLoading();
    
    await signOut(auth);
    
  } catch (error) {
    console.error('Sign out failed:', error);
    throw new Error('Failed to sign out. Please try again.');
    
  } finally {
    hideLoading();
  }
}

/**
 * Get user-friendly error messages
 * 
 * PURPOSE:
 * Converts Firebase error codes to user-friendly messages.
 * 
 * ERROR CODES:
 * Firebase returns error.code like 'auth/email-already-in-use'
 * This function maps them to readable messages.
 * 
 * USAGE:
 * Used in catch blocks to show helpful messages to users.
 * 
 * DEBUGGING:
 * - If error message is generic: Add specific error code mapping
 * - Check Firebase docs for complete error code list
 * - Log error.code to see what needs mapping
 */
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
      return 'Authentication failed. Please try again.';
  }
}

