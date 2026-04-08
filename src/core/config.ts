/**
 * Application configuration.
 * All runtime config (e.g. Firebase) comes from environment variables only.
 * Copy .env.example to .env and set the values for your Firebase project.
 */

/**
 * Reads a string value from Vite env. Returns empty string if missing or not a string.
 * Use this for all config to avoid undefined and to keep secrets out of source.
 * test comment
 */
function env(key: string): string {
  const v = import.meta.env[key];
  return typeof v === 'string' ? v : '';
}

/**
 * Firebase client config for Auth and Firestore.
 * Required keys: apiKey, authDomain, projectId, appId.
 * Optional for basic use: storageBucket, messagingSenderId.
 * Do not add measurementId or Analytics here; this app does not use Firebase Analytics.
 */
export const firebaseConfig = {
  apiKey: env('VITE_FIREBASE_API_KEY'),
  authDomain: env('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: env('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: env('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: env('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: env('VITE_FIREBASE_APP_ID'),
};
