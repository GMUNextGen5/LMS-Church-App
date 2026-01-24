# Configuration Guide - API Keys and Firebase Setup

⚠️ **IMPORTANT**: This project requires you to configure your own API keys and Firebase project before running.

## 🔑 Required Configuration

### 1. Firebase Configuration (REQUIRED)

The app needs Firebase for authentication and database. You must:

1. **Create a Firebase Project:**
   - Go to https://console.firebase.google.com
   - Click "Add project"
   - Enter a project name
   - Follow the setup wizard

2. **Enable Required Services:**
   - **Authentication**: Enable Email/Password sign-in method
   - **Firestore Database**: Create database in production mode
   - **Cloud Functions**: Will be enabled automatically when you deploy

3. **Get Your Firebase Config:**
   - In Firebase Console, go to Project Settings (gear icon)
   - Scroll to "Your apps" section
   - Click the Web icon `</>` to add a web app
   - Copy the `firebaseConfig` object

4. **Update Configuration Files:**

   **File: `src/config.ts`**
   ```typescript
   export const firebaseConfig = {
     apiKey: "YOUR_FIREBASE_API_KEY",           // ← Replace this
     authDomain: "YOUR_PROJECT_ID.firebaseapp.com",  // ← Replace this
     projectId: "YOUR_PROJECT_ID",              // ← Replace this
     storageBucket: "YOUR_PROJECT_ID.appspot.com",    // ← Replace this
     messagingSenderId: "YOUR_MESSAGING_SENDER_ID",   // ← Replace this
     appId: "YOUR_APP_ID"                        // ← Replace this
   };
   ```

   **File: `.firebaserc`**
   ```json
   {
     "projects": {
       "default": "YOUR_PROJECT_ID"  // ← Replace with your Firebase project ID
     }
   }
   ```

5. **Deploy Security Rules:**
   ```bash
   firebase login
   firebase deploy --only firestore:rules,firestore:indexes
   ```

---

### 2. Gemini API Key (OPTIONAL - for AI features)

AI features (Performance Summary, Study Tips) require a Google Gemini API key.

1. **Get Your API Key:**
   - Go to https://makersuite.google.com/app/apikey
   - Sign in with your Google account
   - Click "Create API Key"
   - Copy the key

2. **Configure for Production:**

   **Option A: Firebase Console (Recommended)**
   - Go to Firebase Console → Functions → Configuration → Environment Variables
   - Click "Add variable"
   - Name: `GEMINI_API_KEY`
   - Value: `YOUR_GEMINI_API_KEY` (paste your key)
   - Click "Save"
   - Redeploy: `firebase deploy --only functions`

   **Option B: Firebase CLI**
   ```bash
   firebase functions:config:set gemini.api_key="YOUR_GEMINI_API_KEY"
   cd functions && npm run build && cd ..
   firebase deploy --only functions
   ```

3. **Configure for Local Development:**
   - Create `functions/.env` file (already in .gitignore)
   - Add: `GEMINI_API_KEY=YOUR_GEMINI_API_KEY`

---

## 📋 Configuration Checklist

Before running the app, ensure you've completed:

- [ ] Created Firebase project
- [ ] Enabled Authentication (Email/Password)
- [ ] Enabled Firestore Database
- [ ] Updated `src/config.ts` with your Firebase config
- [ ] Updated `.firebaserc` with your project ID
- [ ] Deployed Firestore security rules
- [ ] (Optional) Set up Gemini API key for AI features

---

## 🔒 Security Notes

### Firebase API Keys
- Firebase API keys are **public** and safe to expose in client code
- Security is enforced by Firestore Security Rules, not by hiding keys
- The keys in `src/config.ts` are restricted by Firebase security rules

### Gemini API Key
- **NEVER** commit Gemini API keys to Git
- Store in environment variables or Firebase Functions config
- The key is only used server-side in Cloud Functions
- Client code never sees the Gemini API key

---

## 🚀 Quick Setup Commands

```bash
# 1. Install dependencies
npm install
cd functions && npm install && cd ..

# 2. Configure Firebase (edit src/config.ts and .firebaserc)
# See instructions above

# 3. Deploy security rules
firebase login
firebase deploy --only firestore:rules,firestore:indexes

# 4. (Optional) Configure AI features
firebase functions:config:set gemini.api_key="YOUR_GEMINI_API_KEY"
cd functions && npm run build && cd ..
firebase deploy --only functions

# 5. Run development server
npm run dev
```

---

## 📚 Additional Resources

- **Firebase Setup**: See `SETUP_GUIDE.md` for detailed Firebase setup
- **Quick Start**: See `QUICK_START.md` for fastest setup path
- **AI Features**: See `functions/AI_SYSTEM_README.md` for AI configuration details
- **Deployment**: See `DEPLOYMENT.md` for production deployment

---

## 🆘 Troubleshooting

### "Firebase: Error (auth/invalid-api-key)"
→ Check that `src/config.ts` has your correct Firebase API key

### "Permission denied" errors
→ Deploy Firestore rules: `firebase deploy --only firestore:rules`

### AI features not working
→ Check Gemini API key is set: `firebase functions:config:get`
→ Verify key is valid at https://makersuite.google.com/app/apikey

### "Project not found" errors
→ Verify `.firebaserc` has correct project ID
→ Run `firebase projects:list` to see your projects

---

**Remember**: All API keys and project IDs in this copy are placeholders. You MUST replace them with your own values before running the application.

