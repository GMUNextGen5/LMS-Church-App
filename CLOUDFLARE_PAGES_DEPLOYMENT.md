# Cloudflare Pages Deployment Guide for LMS Church App

This guide walks you through deploying your LMS web application to Cloudflare Pages while keeping Firebase backend services (Authentication, Firestore, Functions) intact.

## 📋 Overview

**Architecture:**
- **Frontend:** Hosted on Cloudflare Pages (static site)
- **Backend:** Remains on Firebase (Auth, Firestore, Functions)
- **Build Tool:** Vite (already configured)
- **Output Directory:** `dist`

---

## ✅ Prerequisites Checklist

Before starting, ensure you have:

- [x] Cloudflare account (you have this)
- [x] Working Firebase project with Auth enabled
- [x] Git repository (your project is already a Git repo)
- [ ] Firebase configuration properly set in `src/config.ts`
- [ ] Project pushed to GitHub/GitLab/Bitbucket (recommended for automatic deployments)

---

## 🚀 Step-by-Step Deployment Process

### **STEP 1: Prepare Your Firebase Configuration**

**Why:** Cloudflare Pages needs your Firebase credentials to connect to your backend.

**Action:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click the gear icon (⚙️) → **Project settings**
4. Scroll down to **Your apps** section
5. If you don't have a web app, click **Add app** → Web (</>) icon
6. Copy the Firebase config object
7. Update `src/config.ts` with your real Firebase credentials

**Current status:** Your `config.ts` has placeholder values ("empty"). Replace them with real values.

```typescript
// Example of what it should look like:
export const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890"
};
```

---

### **STEP 2: Test Local Build**

**Why:** Verify your app builds correctly before deploying.

**Action:**
```bash
# Install dependencies (if not already done)
npm install

# Run a production build
npm run build

# This will create a 'dist' folder with your built app
```

**Expected output:**
- A `dist/` directory should be created
- It should contain `index.html`, JS files, CSS files, and assets

**Verification:**
```bash
# Preview the production build locally
npm run preview
```
Open the provided URL (usually http://localhost:4173) and test:
- Login/signup functionality
- All pages load correctly
- Firebase authentication works

---

### **STEP 3: Configure CORS for Firebase Functions** (if using Functions)

**Why:** Cloudflare Pages will be on a different domain than Firebase, so CORS must be configured.

**Action:**

If you're using Firebase Functions (in `functions/src/index.ts`), ensure CORS is properly configured:

```typescript
// In functions/src/index.ts
import * as functions from 'firebase-functions';
import * as cors from 'cors';

const corsHandler = cors({
  origin: [
    'https://your-app.pages.dev',  // Add your Cloudflare Pages URL
    'http://localhost:3000',        // Keep for local development
  ],
  credentials: true
});

export const yourFunction = functions.https.onRequest((request, response) => {
  corsHandler(request, response, () => {
    // Your function logic here
  });
});
```

**Note:** You'll update this with your actual Cloudflare Pages URL after deployment.

---

### **STEP 4: Push Code to Git Repository** (Recommended Method)

**Why:** Cloudflare Pages works best with Git integration for automatic deployments.

**Action:**

If your code isn't already on GitHub/GitLab/Bitbucket:

```bash
# Add all changes
git add .

# Commit changes
git commit -m "Prepare for Cloudflare Pages deployment"

# Push to remote repository
git push origin main
```

**Alternative:** You can also use Wrangler CLI or direct upload (see Step 6 alternative).

---

### **STEP 5A: Deploy via Cloudflare Dashboard (Git Integration)**

**Why:** This is the easiest method with automatic redeployments on Git push.

**Actions:**

1. **Login to Cloudflare Dashboard**
   - Go to [dash.cloudflare.com](https://dash.cloudflare.com/)
   - Login with your account

2. **Navigate to Pages**
   - Click **Workers & Pages** in the left sidebar
   - Click **Create application**
   - Click **Pages** tab
   - Click **Connect to Git**

3. **Connect Your Git Repository**
   - Select your Git provider (GitHub/GitLab/Bitbucket)
   - Authorize Cloudflare to access your repositories
   - Select your LMS repository
   - Click **Begin setup**

4. **Configure Build Settings**
   
   Fill in the form:
   
   | Setting | Value |
   |---------|-------|
   | **Project name** | `lms-church-app` (or your preferred name) |
   | **Production branch** | `main` (or your default branch) |
   | **Framework preset** | `Vite` |
   | **Build command** | `npm run build` |
   | **Build output directory** | `dist` |
   | **Root directory** | `/` (leave empty if repo root) |

5. **Environment Variables** (Optional, but recommended)
   
   If you have any environment variables, add them here. For Firebase config, you typically don't need env vars since they're in the code, but if you want to use them:
   
   - Click **Add variable**
   - Add any variables your app needs
   - Click **Save**

6. **Deploy**
   - Click **Save and Deploy**
   - Wait for the build to complete (usually 2-5 minutes)
   - You'll see a URL like: `https://lms-church-app.pages.dev`

---

### **STEP 5B: Deploy via Wrangler CLI** (Alternative Method)

**Why:** If you prefer command-line deployment or don't want Git integration.

**Actions:**

1. **Install Wrangler**
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare**
   ```bash
   wrangler login
   ```
   This opens a browser window for authentication.

3. **Build Your App**
   ```bash
   npm run build
   ```

4. **Deploy to Pages**
   ```bash
   wrangler pages deploy dist --project-name=lms-church-app
   ```

5. **Follow Prompts**
   - Confirm project name
   - Wait for upload to complete
   - Note the deployment URL provided

---

### **STEP 6: Configure Custom Domain** (Optional)

**Why:** Use your own domain instead of `*.pages.dev`.

**Actions:**

1. **In Cloudflare Dashboard**
   - Go to your Pages project
   - Click **Custom domains** tab
   - Click **Set up a custom domain**

2. **Add Your Domain**
   - Enter your domain (e.g., `lms.yourchurch.com`)
   - Click **Continue**

3. **Update DNS**
   - If domain is on Cloudflare: DNS records are added automatically
   - If domain is elsewhere: Add the CNAME record shown in the instructions

4. **Wait for SSL**
   - SSL certificate is provisioned automatically (usually within 24 hours)
   - Your site will be accessible via HTTPS

---

### **STEP 7: Update Firebase Authentication Domain**

**Why:** Firebase Auth needs to know your new hosting domain.

**Actions:**

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click **Authentication** → **Settings** tab
4. Scroll to **Authorized domains**
5. Click **Add domain**
6. Add your Cloudflare Pages URL:
   - `lms-church-app.pages.dev` (your actual URL)
   - If using custom domain: also add `lms.yourchurch.com`
7. Click **Add**

**Important:** Without this step, Firebase Authentication will fail with CORS errors.

---

### **STEP 8: Update CORS in Firebase Functions**

**Why:** Allow your Cloudflare Pages site to call Firebase Functions.

**Action:**

Return to Step 3 and update the CORS configuration with your actual Cloudflare Pages URL:

```typescript
const corsHandler = cors({
  origin: [
    'https://lms-church-app.pages.dev',  // Your actual Cloudflare Pages URL
    'https://lms.yourchurch.com',        // Your custom domain (if applicable)
    'http://localhost:3000',             // Keep for local dev
  ],
  credentials: true
});
```

**Deploy the updated functions:**
```bash
# From your project root
firebase deploy --only functions
```

---

### **STEP 9: Configure Cloudflare Pages Settings**

**Why:** Optimize your deployment for SPA routing and security.

**Actions:**

1. **In Cloudflare Dashboard → Your Project → Settings:**

2. **Build & Development**
   - Verify settings from Step 5A are correct
   - No changes needed if already set

3. **Functions** (Optional - for Cloudflare Workers)
   - Not needed unless you want to add Cloudflare Functions
   - Skip for now

4. **Environment Variables**
   - Add any required variables
   - Click **Save**

5. **Redirects/Rules** (Important for SPA)
   
   Cloudflare Pages should automatically handle SPA routing based on your 404 handling. No additional configuration needed.

---

### **STEP 10: Test Your Deployment**

**Why:** Ensure everything works in production.

**Test Checklist:**

- [ ] Visit your Cloudflare Pages URL
- [ ] Test user registration (create new account)
- [ ] Test user login
- [ ] Test logout
- [ ] Navigate between different pages/routes
- [ ] Test any features that use Firebase Functions
- [ ] Check browser console for errors
- [ ] Test on mobile device
- [ ] Verify all assets load correctly (images, fonts, etc.)

**Common Issues:**

| Issue | Solution |
|-------|----------|
| **Login fails with CORS error** | Verify Step 7 (authorized domains) |
| **404 on page refresh** | Pages should handle this automatically; check build output |
| **Functions fail** | Update CORS in Functions (Step 8) |
| **Assets not loading** | Check Vite config and base URL |
| **Blank page** | Check browser console; verify Firebase config |

---

## 🔄 Continuous Deployment

Once set up with Git integration:

1. Make changes to your code
2. Commit and push to Git
3. Cloudflare Pages automatically builds and deploys
4. Changes go live in 2-5 minutes

**Preview Deployments:**
- Every Git branch gets its own preview URL
- Pull requests get automatic preview deployments
- Perfect for testing before merging to main

---

## 📊 Post-Deployment Management

### **Monitoring**

- **Cloudflare Dashboard → Analytics**
  - View requests, bandwidth, unique visitors
  - Check error rates
  - Monitor build times

- **Firebase Console → Authentication**
  - Monitor user sign-ins
  - Track authentication methods
  - View user growth

### **Build Settings**

- **Triggers:** Configure which branches trigger deployments
- **Build cache:** Automatically enabled for faster builds
- **Environment variables:** Separate production/preview variables

### **Rollback**

If something goes wrong:
1. Go to Cloudflare Dashboard → Your Project → Deployments
2. Find a previous working deployment
3. Click **⋮** (three dots) → **Rollback to this deployment**
4. Confirm rollback

---

## 🛠️ Additional Configuration (Optional)

### **A. Add _headers file for better caching**

Create `public/_headers`:
```
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/*.js
  Cache-Control: public, max-age=31536000, immutable

/*.css
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: public, max-age=0, must-revalidate
```

### **B. Add _redirects file for SPA routing**

Create `public/_redirects`:
```
/*    /index.html   200
```

### **C. Configure Web Analytics**

1. Cloudflare Dashboard → Your Project → Analytics
2. Enable **Web Analytics**
3. No code changes needed; automatic tracking

---

## 🔒 Security Considerations

1. **Firebase Config:** Safe to commit (restricted by Firebase rules)
2. **API Keys:** Already protected by Firebase security rules
3. **HTTPS:** Automatically enabled by Cloudflare
4. **Firestore Rules:** Ensure these are properly configured
5. **Environment Secrets:** Use Cloudflare Pages environment variables for any sensitive data

---

## 💰 Cost Considerations

**Cloudflare Pages (Free Tier):**
- ✅ Unlimited requests
- ✅ Unlimited bandwidth
- ✅ 500 builds per month
- ✅ 1 concurrent build

**Firebase (Spark/Free Tier):**
- ✅ 50K reads/day
- ✅ 20K writes/day
- ✅ 10K authentications per month

For most small to medium apps, both stay free. Monitor usage in dashboards.

---

## 🆘 Troubleshooting

### **Build Fails**

```bash
# Check build locally first
npm run build

# View build logs in Cloudflare Dashboard
# Common issues:
# - Missing dependencies: check package.json
# - TypeScript errors: run `npm run build` locally
# - Environment variables: add in Cloudflare settings
```

### **Firebase Connection Issues**

1. Check `src/config.ts` has correct Firebase config
2. Verify Firebase services are enabled in Firebase Console
3. Check authorized domains include Cloudflare URL
4. Open browser DevTools → Console for specific errors

### **Authentication Not Working**

1. Add Cloudflare Pages URL to Firebase authorized domains
2. Clear browser cache and cookies
3. Check Firebase Console → Authentication → Users (are users being created?)
4. Verify no CORS errors in browser console

### **Functions Timing Out**

1. Update CORS in Firebase Functions
2. Check function logs in Firebase Console
3. Verify function is deployed: `firebase deploy --only functions`
4. Test function directly (use Postman or curl)

---

## 📚 Useful Commands Reference

```bash
# Local development
npm run dev                  # Start dev server

# Build & test
npm run build               # Production build
npm run preview             # Preview production build

# Deployment
git push origin main        # Auto-deploy (if Git connected)
wrangler pages deploy dist  # Manual deploy via CLI

# Firebase Functions
firebase deploy --only functions  # Update functions
firebase functions:log           # View function logs

# Cloudflare CLI
wrangler pages project list      # List all projects
wrangler pages deployment list   # List deployments
wrangler pages deployment tail   # View live logs
```

---

## 🎯 Quick Start Checklist

Use this checklist for your deployment:

- [ ] **Step 1:** Update Firebase config in `src/config.ts`
- [ ] **Step 2:** Test local build with `npm run build` and `npm run preview`
- [ ] **Step 3:** Push code to Git repository
- [ ] **Step 4:** Connect Git repo to Cloudflare Pages
- [ ] **Step 5:** Configure build settings (Vite, dist, npm run build)
- [ ] **Step 6:** Deploy and get your `*.pages.dev` URL
- [ ] **Step 7:** Add Cloudflare URL to Firebase authorized domains
- [ ] **Step 8:** Update CORS in Firebase Functions (if applicable)
- [ ] **Step 9:** Test authentication, routing, and all features
- [ ] **Step 10:** (Optional) Set up custom domain

---

## 📞 Getting Help

- **Cloudflare Pages Docs:** https://developers.cloudflare.com/pages/
- **Firebase Docs:** https://firebase.google.com/docs
- **Cloudflare Community:** https://community.cloudflare.com/
- **Firebase Support:** https://firebase.google.com/support

---

## 🎉 Success!

Once completed, you'll have:
- ✅ Frontend hosted on Cloudflare Pages (fast global CDN)
- ✅ Backend on Firebase (Auth, Firestore, Functions)
- ✅ Automatic deployments on Git push
- ✅ HTTPS enabled by default
- ✅ Preview deployments for testing
- ✅ Free hosting (within free tier limits)

Your LMS app will be accessible worldwide with excellent performance thanks to Cloudflare's global network!

---

**Next Steps After Deployment:**
1. Share the URL with test users
2. Monitor analytics and errors
3. Set up custom domain (optional)
4. Configure additional Cloudflare features (firewall, caching rules, etc.)
5. Plan for scaling (upgrade plans if needed)
