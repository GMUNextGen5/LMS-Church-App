# LMS Setup Guide - Step by Step

This guide will walk you through setting up the LMS from scratch. Follow each step carefully.

## Prerequisites Checklist

Before you begin, make sure you have:

- [ ] Node.js 18 or higher installed
- [ ] A Google account
- [ ] Basic command line knowledge
- [ ] A code editor (VS Code recommended)

## Phase 1: Firebase Project Setup

### Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Add project"
3. Enter project name (e.g., "my-lms-project")
4. Disable Google Analytics (optional for this project)
5. Click "Create project"

### Step 2: Enable Authentication

1. In Firebase Console, click "Authentication" in the left menu
2. Click "Get started"
3. Click on "Email/Password" under Sign-in method
4. Enable "Email/Password"
5. Click "Save"

### Step 3: Enable Firestore Database

1. In Firebase Console, click "Firestore Database" in the left menu
2. Click "Create database"
3. Select "Start in production mode" (we'll deploy security rules next)
4. Choose a Cloud Firestore location (choose closest to you)
5. Click "Enable"

### Step 4: Get Firebase Configuration

1. In Firebase Console, click the gear icon ⚙️ next to "Project Overview"
2. Click "Project settings"
3. Scroll down to "Your apps"
4. Click the "</>" (Web) icon
5. Register your app with a nickname (e.g., "LMS Web App")
6. **Copy the firebaseConfig object**
7. Paste it into `src/config.ts` in your project

Your `src/config.ts` should look like:

```typescript
export const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "my-lms-project.firebaseapp.com",
  projectId: "my-lms-project",
  storageBucket: "my-lms-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:xxxxxxxxxxxxx"
};
```

### Step 5: Update Firebase Project ID

Edit `.firebaserc` and replace `YOUR_PROJECT_ID` with your actual Firebase project ID:

```json
{
  "projects": {
    "default": "my-lms-project"
  }
}
```

## Phase 2: Install Dependencies

### Step 1: Install Firebase CLI

```bash
npm install -g firebase-tools
```

### Step 2: Login to Firebase

```bash
firebase login
```

This will open a browser window. Sign in with your Google account.

### Step 3: Install Project Dependencies

In the project root directory:

```bash
npm install
```

Then install Cloud Functions dependencies:

```bash
cd functions
npm install
cd ..
```

## Phase 3: Deploy Firestore Rules and Indexes

### Step 1: Deploy Security Rules

```bash
firebase deploy --only firestore:rules
```

This deploys the FERPA-compliant security rules that protect student data.

### Step 2: Deploy Firestore Indexes

```bash
firebase deploy --only firestore:indexes
```

This creates database indexes for efficient queries.

## Phase 4: Configure Gemini AI (Optional but Recommended)

### Step 1: Get Gemini API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Click "Create API Key"
3. Copy the API key

### Step 2: Configure Cloud Functions

```bash
firebase functions:config:set gemini.api_key="YOUR_GEMINI_API_KEY_HERE"
```

Replace `YOUR_GEMINI_API_KEY_HERE` with your actual API key.

## Phase 5: Build and Deploy Cloud Functions

### Step 1: Build Functions

```bash
cd functions
npm run build
cd ..
```

### Step 2: Deploy Functions

```bash
firebase deploy --only functions
```

This may take 3-5 minutes. You should see:

```
✔ functions[getPerformanceSummary] Successful create operation.
✔ functions[getStudyTips] Successful create operation.
✔ functions[updateUserRole] Successful create operation.
```

## Phase 6: Create Your First Admin User

### Step 1: Run the Development Server

```bash
npm run dev
```

### Step 2: Sign Up

1. Open http://localhost:3000 in your browser
2. Click "Sign Up"
3. Enter your email and password
4. Click "Create Account"

You'll be logged in as a "Student" by default.

### Step 3: Promote to Admin (Manual)

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Click "Firestore Database"
4. Find the `users` collection
5. Click on your user document (it will have your UID)
6. Click the edit icon (pencil) next to the `role` field
7. Change `"student"` to `"admin"`
8. Click "Update"

### Step 4: Refresh and Verify

1. Refresh your browser (http://localhost:3000)
2. You should now see "Admin" badge in the top right
3. You should see additional tabs: "Student Registration", "User Management"

## Phase 7: Create Test Data

### Create a Test Student

1. As admin, click "Student Registration" tab
2. (For now, we'll create students manually in Firestore Console)

**Manual Method:**

1. Go to Firebase Console > Firestore Database
2. Create a new collection called `students`
3. Add a document with auto-ID
4. Add fields:
   - `name` (string): "John Doe"
   - `memberId` (string): "STU001"
   - `parentUid` (string): your UID (copy from users collection)
   - `studentUid` (string): your UID (same as parentUid for testing)
   - `createdAt` (string): "2024-01-15T00:00:00.000Z"
5. Click "Save"

### Add Test Grades

1. In Firestore Console, click on your student document
2. Click "Add collection"
3. Collection ID: `grades`
4. Add documents with these fields:
   - `assignmentName` (string): "Math Quiz 1"
   - `category` (string): "Quiz"
   - `score` (number): 85
   - `totalPoints` (number): 100
   - `date` (string): "2024-01-15T00:00:00.000Z"
   - `teacherId` (string): your UID

Add 3-5 grades for testing.

## Phase 8: Test the Application

### Test Workflow

1. **Login/Logout**: ✅ Test signing in and out
2. **View Students**: ✅ Should see "John Doe" in dropdown
3. **View Grades**: ✅ Select student, see grades table
4. **Add Grade** (Admin/Teacher): ✅ Fill form and submit
5. **Export CSV**: ✅ Click export button, download CSV
6. **AI Summary**: ✅ Click "AI Performance Summary" (requires Gemini API)
7. **Study Tips**: ✅ Click "Get Study Tips" (requires Gemini API)

## Phase 9: Build for Production

### Step 1: Build the App

```bash
npm run build
```

### Step 2: Deploy to Firebase Hosting

```bash
firebase deploy --only hosting
```

Your app will be live at: `https://YOUR_PROJECT_ID.web.app`

### Alternative: Deploy to Cloudflare Pages

1. Push your code to GitHub
2. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
3. Click "Workers & Pages" > "Create application" > "Pages"
4. Connect to your GitHub repository
5. Build settings:
   - Build command: `npm run build`
   - Build output directory: `dist`
6. Click "Save and Deploy"

**Important:** After deploying to Cloudflare:

1. Go to Firebase Console > Authentication > Settings
2. Under "Authorized domains", click "Add domain"
3. Enter your Cloudflare Pages domain (e.g., `my-lms.pages.dev`)
4. Click "Add"

## Common Issues & Solutions

### Issue: "Failed to get document because the client is offline"

**Solution:** Make sure Firestore is enabled and you're connected to the internet.

### Issue: "Permission denied" when reading data

**Solution:** 
1. Check that Firestore rules are deployed: `firebase deploy --only firestore:rules`
2. Verify user role is set correctly in Firestore Console

### Issue: AI functions returning "internal error"

**Solution:**
1. Check Gemini API key is configured: `firebase functions:config:get`
2. Check function logs: `firebase functions:log`
3. Make sure functions are deployed: `firebase deploy --only functions`

### Issue: "Module not found" errors

**Solution:**
```bash
rm -rf node_modules package-lock.json
npm install
```

## Next Steps

### Create More Users

1. Create a teacher account (sign up, then promote role to "teacher" in Firestore)
2. Create a student/parent account (leave as "student")

### Create Courses

As admin, create course documents in Firestore:

```
courses/{courseId}
  - courseName: "Biology 101"
  - teacherId: [teacher's UID]
  - studentIds: [array of student doc IDs]
  - createdAt: "2024-01-15T00:00:00.000Z"
```

### Enable BigQuery Export (Optional)

1. Firebase Console > Extensions
2. Search for "Export Collections to BigQuery"
3. Install the extension
4. Configure to export `students` collection
5. Enable "Sync subcollections"

This allows you to build Power BI dashboards!

## Support

If you encounter issues:

1. Check the browser console for errors (F12)
2. Check Firebase Console for error messages
3. Check Cloud Functions logs: `firebase functions:log`
4. Review the README.md for additional information

## Success Checklist

- [ ] Firebase project created and configured
- [ ] Dependencies installed
- [ ] Firestore rules and indexes deployed
- [ ] Cloud Functions deployed
- [ ] First admin user created
- [ ] Test student with grades created
- [ ] Can login and view data
- [ ] Can add new grades (as admin/teacher)
- [ ] Can export to CSV
- [ ] AI features working (if Gemini API configured)
- [ ] Production build successful
- [ ] Deployed to hosting

Congratulations! Your LMS is now fully operational! 🎉

