# Quick Start Guide - LMS

Get your LMS running in 10 minutes!

## ⚡ Prerequisites

- Node.js 18+ installed
- Firebase account
- Text editor

## 🚀 Quick Setup (10 minutes)

### 1. Install Firebase CLI (1 min)
```bash
npm install -g firebase-tools
```

### 2. Install Dependencies (2 min)
```bash
npm install
cd functions && npm install && cd ..
```

### 3. Configure Firebase (3 min)

#### Create Firebase Project
1. Go to https://console.firebase.google.com
2. Click "Add project" → Enter name → Create
3. Enable Authentication > Email/Password
4. Enable Firestore Database

#### Get Config
1. Project Settings (gear icon) → Your apps → Web app
2. Copy `firebaseConfig` object
3. Paste into `src/config.ts`

#### Update Project ID
Edit `.firebaserc`:
```json
{
  "projects": {
    "default": "YOUR_PROJECT_ID"
  }
}
```

### 4. Deploy Security Rules (1 min)
```bash
firebase login
firebase deploy --only firestore:rules,firestore:indexes
```

### 5. Start Development Server (1 min)
```bash
npm run dev
```

Open http://localhost:3000 🎉

### 6. Create Admin User (2 min)
1. Click "Sign Up" in the app
2. Create account
3. Go to Firebase Console > Firestore > users collection
4. Find your user → Change `role` from `"student"` to `"admin"`
5. Refresh the app

Done! You're an admin now! ✨

---

## 🤖 Optional: Enable AI Features

### Get Gemini API Key
1. Go to https://makersuite.google.com/app/apikey
2. Click "Create API Key"
3. Copy the key

### Configure and Deploy Functions
```bash
firebase functions:config:set gemini.api_key="YOUR_KEY_HERE"
cd functions && npm run build && cd ..
firebase deploy --only functions
```

AI features now work! 🧠

---

## 📝 Create Test Data

### Add a Test Student (Manual - 2 min)

1. Firebase Console > Firestore Database
2. Create collection: `students`
3. Add document (auto-ID):
   ```
   name: "Test Student"
   memberId: "STU001"
   parentUid: YOUR_UID (from users collection)
   studentUid: YOUR_UID (same)
   createdAt: "2024-01-01T00:00:00.000Z"
   ```

### Add Test Grades (2 min)

1. Click your student document
2. Start collection: `grades`
3. Add documents:
   ```
   assignmentName: "Math Test 1"
   category: "Test"
   score: 85
   totalPoints: 100
   date: "2024-01-15T00:00:00.000Z"
   teacherId: YOUR_UID
   ```

Add 3-5 grades for testing.

---

## ✅ Test Everything (2 min)

- [x] Login/Logout
- [x] Select student from dropdown
- [x] View grades
- [x] Add new grade (as admin)
- [x] Export to CSV
- [x] AI Summary (if enabled)
- [x] Study Tips (if enabled)

---

## 🌐 Deploy to Production (5 min)

### Option 1: Firebase Hosting
```bash
npm run build
firebase deploy --only hosting
```

Live at: `https://YOUR_PROJECT_ID.web.app`

### Option 2: Cloudflare Pages
1. Push to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin YOUR_REPO_URL
   git push -u origin main
   ```

2. Go to Cloudflare Dashboard
3. Workers & Pages > Create > Pages > Connect to Git
4. Select repo
5. Build command: `npm run build`
6. Build output: `dist`
7. Deploy!

**Don't forget:** Add your production domain to Firebase Console > Authentication > Authorized domains

---

## 📚 Full Documentation

For detailed information, see:

- **README.md** - Complete project overview
- **SETUP_GUIDE.md** - Detailed step-by-step setup
- **DEPLOYMENT.md** - Production deployment guide
- **PROJECT_SUMMARY.md** - Implementation details

---

## 🆘 Troubleshooting

### "Permission denied" errors
→ Deploy Firestore rules: `firebase deploy --only firestore:rules`

### "Module not found" errors
→ Reinstall: `rm -rf node_modules && npm install`

### AI functions not working
→ Check API key: `firebase functions:config:get`

### Can't login on deployed site
→ Add domain to Firebase Console > Authentication > Authorized domains

---

## 🎯 Quick Commands Reference

```bash
# Development
npm run dev              # Start dev server
npm run build           # Build for production
npm run preview         # Preview production build

# Firebase
firebase login          # Login to Firebase
firebase deploy         # Deploy everything
firebase deploy --only hosting    # Deploy only frontend
firebase deploy --only functions  # Deploy only functions
firebase functions:log  # View function logs

# Functions
cd functions
npm run build          # Compile TypeScript
npm run serve          # Test locally
```

---

## 🎉 You're All Set!

Your LMS is now running with:
- ✅ Secure authentication
- ✅ Role-based access control
- ✅ Real-time grades
- ✅ FERPA-compliant security
- ✅ AI-powered insights (if enabled)
- ✅ Professional UI

**Next Steps:**
1. Customize the UI colors/branding
2. Add more students and courses
3. Invite teachers to create accounts
4. Set up BigQuery for analytics (optional)

Need help? Check the full documentation files!

