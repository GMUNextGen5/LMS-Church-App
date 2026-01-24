# Local Development Setup - LMS Firebase Connection

## 🎯 Goal
Connect your completed frontend to Firebase and run it locally with a working login page.

---

## 📋 Prerequisites

Before starting, ensure you have:
- ✅ Node.js 18+ installed ([Download here](https://nodejs.org/))
- ✅ A Google account
- ✅ Terminal/PowerShell access

---

## 🚀 Step-by-Step Setup

### Step 1: Create Firebase Project (5 minutes)

1. **Go to Firebase Console:**
   - Open: https://console.firebase.google.com
   - Sign in with your Google account

2. **Create a New Project:**
   - Click "Add project" button
   - Enter a project name: `lms-church-app` (or your preferred name)
   - Click "Continue"
   - Disable Google Analytics (optional - you can skip this for now)
   - Click "Create project"
   - Wait for project creation (30-60 seconds)
   - Click "Continue"

### Step 2: Enable Authentication (2 minutes)

1. **In your Firebase project, locate the left sidebar**
2. **Click "Authentication"**
3. **Click "Get started" button**
4. **Enable Email/Password:**
   - Click on "Email/Password" in the Sign-in providers list
   - Toggle "Enable" switch ON
   - Click "Save"

### Step 3: Enable Firestore Database (2 minutes)

1. **In the left sidebar, click "Firestore Database"**
2. **Click "Create database"**
3. **Select "Start in production mode"**
   - Don't worry, we'll deploy secure rules next
4. **Choose a location:**
   - Select the closest region to you (e.g., `us-central`, `us-east1`)
   - ⚠️ This cannot be changed later!
5. **Click "Enable"**
6. **Wait for database creation (30-60 seconds)**

### Step 4: Get Your Firebase Configuration (3 minutes)

1. **In Firebase Console, click the gear icon ⚙️ next to "Project Overview"**
2. **Click "Project settings"**
3. **Scroll down to "Your apps" section**
4. **Click the Web icon `</>`** (it says "Add app")
5. **Register your app:**
   - App nickname: `LMS Web App`
   - Firebase Hosting: Leave unchecked (for now)
   - Click "Register app"
6. **COPY the Firebase configuration code**
   - You'll see something like this:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "lms-church-app.firebaseapp.com",
  projectId: "lms-church-app",
  storageBucket: "lms-church-app.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};
```

7. **Keep this window open** - you'll need these values next!

### Step 5: Update Your Local Configuration (2 minutes)

1. **Open your project in VS Code or your editor**

2. **Edit `src/config.ts`:**
   - Replace the placeholder values with your actual Firebase config
   - Open the file and update it to look like this (using YOUR values):

```typescript
export const firebaseConfig = {
  apiKey: "YOUR_ACTUAL_API_KEY",
  authDomain: "YOUR_ACTUAL_AUTH_DOMAIN",
  projectId: "YOUR_ACTUAL_PROJECT_ID",
  storageBucket: "YOUR_ACTUAL_STORAGE_BUCKET",
  messagingSenderId: "YOUR_ACTUAL_MESSAGING_SENDER_ID",
  appId: "YOUR_ACTUAL_APP_ID"
};
```

3. **Save the file** (Ctrl+S or Cmd+S)

### Step 6: Update Firebase Project ID (1 minute)

1. **Edit `.firebaserc` file in your project root:**

```json
{
  "projects": {
    "default": "YOUR_PROJECT_ID"
  }
}
```

2. **Replace `YOUR_PROJECT_ID`** with your actual project ID from Step 4
3. **Save the file**

### Step 7: Install Firebase CLI (2 minutes)

Open your terminal/PowerShell in the project directory and run:

```powershell
npm install -g firebase-tools
```

Wait for installation to complete.

### Step 8: Login to Firebase (1 minute)

```powershell
firebase login
```

- This will open your browser
- Sign in with the same Google account you used to create the Firebase project
- Grant permissions
- Return to terminal - you should see "Success!"

### Step 9: Install Project Dependencies (2 minutes)

In your project root directory, run:

```powershell
npm install
```

This installs all the frontend dependencies.

### Step 10: Deploy Firestore Security Rules (1 minute)

This is crucial for security and data access:

```powershell
firebase deploy --only firestore:rules,firestore:indexes
```

You should see:
```
✔ Deploy complete!
```

### Step 11: Start Your Development Server (1 minute)

```powershell
npm run dev
```

You should see:

```
  VITE v5.4.2  ready in 500 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

### Step 12: Test Your Login Page! 🎉

1. **Open your browser** and go to: http://localhost:5173/ (or the URL shown in terminal)

2. **You should see your LMS login page!**

3. **Create your first account:**
   - Click "Sign Up" (if available) or use the sign-up form
   - Enter email: `admin@test.com`
   - Enter password: `Test123!` (or any password 6+ characters)
   - Click "Create Account" or "Sign Up"

4. **You should be logged in!** 🎉
   - You'll see the dashboard
   - Default role will be "Student"

### Step 13: Promote Yourself to Admin (2 minutes)

1. **Go to Firebase Console**: https://console.firebase.google.com
2. **Select your project**
3. **Click "Firestore Database" in the left sidebar**
4. **Click on the `users` collection**
5. **Click on your user document** (it will be your User ID)
6. **Find the `role` field** (it says `"student"`)
7. **Click the edit icon** (pencil) next to the `role` field
8. **Change the value to:** `"admin"`
9. **Click "Update"**
10. **Go back to your browser and refresh** the page (F5)
11. **You should now see "Admin" badge!** ✨

---

## ✅ Verification Checklist

Make sure everything works:

- [ ] Can access http://localhost:5173/
- [ ] Login page loads without errors
- [ ] Can create a new account
- [ ] Can see dashboard after login
- [ ] Can logout
- [ ] Can login again with same credentials
- [ ] After promoting to admin, see "Admin" badge
- [ ] No errors in browser console (F12 → Console tab)

---

## 🐛 Troubleshooting

### Issue: "npm: command not found"
**Solution:** Install Node.js from https://nodejs.org/

### Issue: "Firebase command not found"
**Solution:** 
```powershell
npm install -g firebase-tools
```

### Issue: "Permission denied" in Firestore
**Solution:** Deploy the security rules again:
```powershell
firebase deploy --only firestore:rules
```

### Issue: Login button doesn't work / No response
**Solution:** 
1. Open browser console (F12 → Console tab)
2. Look for error messages
3. Check that `src/config.ts` has correct Firebase config
4. Verify you enabled Email/Password in Firebase Console → Authentication

### Issue: "Module not found" errors
**Solution:** Reinstall dependencies:
```powershell
rmdir /s /q node_modules
del package-lock.json
npm install
```

### Issue: Changes to config.ts not taking effect
**Solution:** 
1. Stop the dev server (Ctrl+C)
2. Restart: `npm run dev`
3. Hard refresh browser (Ctrl+Shift+R)

### Issue: Port 5173 already in use
**Solution:** 
- Kill the process on that port, or
- Vite will automatically use the next available port (check terminal for actual URL)

---

## 🎯 Next Steps

Once your login is working:

1. **Create Test Students:**
   - Go to Firebase Console → Firestore Database
   - Create a `students` collection with test data
   - See SETUP_GUIDE.md for detailed instructions

2. **Optional - Enable AI Features:**
   - Get Gemini API key from https://makersuite.google.com/app/apikey
   - Configure functions (see QUICK_START.md)

3. **Deploy to Production:**
   - When ready: `npm run build && firebase deploy`

---

## 📚 Additional Resources

- **Full Setup Guide:** See `SETUP_GUIDE.md`
- **Quick Reference:** See `QUICK_START.md`
- **Project Documentation:** See `README.md`
- **Architecture Details:** See `PROJECT_SUMMARY.md`

---

## 🆘 Still Having Issues?

1. **Check Browser Console** (F12 → Console) for error messages
2. **Check Terminal** for error messages
3. **Verify Firebase Config** in `src/config.ts` is correct
4. **Verify Firebase Services** are enabled in Firebase Console:
   - Authentication → Email/Password is enabled
   - Firestore Database is created
5. **Check Node Version:** `node --version` (should be 18+)

---

## ✨ Success!

If you can login, congratulations! Your LMS is now running locally with:
- ✅ Firebase Authentication working
- ✅ Firestore Database connected
- ✅ Secure FERPA-compliant data access
- ✅ Real-time updates
- ✅ Role-based access control

**You're now ready to develop and test your LMS locally!** 🚀
