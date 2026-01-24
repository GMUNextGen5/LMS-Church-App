# Deployment Guide

This document covers deploying your LMS to production.

## Option 1: Firebase Hosting (Recommended for Firebase-heavy apps)

### Advantages
- Integrated with Firebase services
- Automatic SSL certificates
- Global CDN
- Easy rollbacks
- Free tier available

### Steps

1. **Build the application:**
```bash
npm run build
```

2. **Deploy to Firebase Hosting:**
```bash
firebase deploy --only hosting
```

3. **Your app is now live at:**
```
https://YOUR_PROJECT_ID.web.app
https://YOUR_PROJECT_ID.firebaseapp.com
```

4. **Custom Domain (Optional):**
   - Firebase Console > Hosting > Add custom domain
   - Follow DNS configuration steps
   - SSL certificate is automatically provisioned

## Option 2: Cloudflare Pages (Recommended for better global performance)

### Advantages
- Faster global CDN (best-in-class)
- Unlimited bandwidth
- Built-in DDoS protection
- Free tier with generous limits
- GitHub integration

### Steps

1. **Push your code to GitHub:**
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

2. **Create Cloudflare Pages Project:**
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
   - Click "Workers & Pages"
   - Click "Create application" > "Pages" tab
   - Click "Connect to Git"
   - Select your GitHub repository
   - Click "Begin setup"

3. **Configure build settings:**
   - Project name: `my-lms` (or your choice)
   - Production branch: `main`
   - Framework preset: `None` (or `Vite`)
   - Build command: `npm run build`
   - Build output directory: `dist`

4. **Add environment variables (if needed):**
   - Click "Environment variables"
   - Add any variables your app needs
   - Click "Save"

5. **Deploy:**
   - Click "Save and Deploy"
   - Wait 2-3 minutes for build to complete

6. **Configure Firebase Authorization:**
   - Your app will be at: `https://YOUR_PROJECT.pages.dev`
   - Go to Firebase Console > Authentication > Settings
   - Click "Authorized domains"
   - Click "Add domain"
   - Enter: `YOUR_PROJECT.pages.dev`
   - Click "Add"

7. **Custom Domain (Optional):**
   - Cloudflare Pages > Your project > Custom domains
   - Click "Set up a custom domain"
   - Enter your domain name
   - Update DNS records as instructed

## Option 3: Vercel

### Steps

1. **Install Vercel CLI:**
```bash
npm install -g vercel
```

2. **Deploy:**
```bash
vercel
```

3. **Configure Firebase:**
   - Note your Vercel URL (e.g., `your-lms.vercel.app`)
   - Add to Firebase authorized domains (see Cloudflare steps above)

## Option 4: Netlify

### Steps

1. **Install Netlify CLI:**
```bash
npm install -g netlify-cli
```

2. **Deploy:**
```bash
netlify deploy --prod
```

3. **Configure Firebase:**
   - Note your Netlify URL (e.g., `your-lms.netlify.app`)
   - Add to Firebase authorized domains

## Cloud Functions Deployment

Cloud Functions must be deployed to Firebase, regardless of where you host the frontend.

### Deploy Functions

```bash
# Build functions
cd functions
npm run build
cd ..

# Deploy to Firebase
firebase deploy --only functions
```

### Monitor Functions

```bash
# View logs
firebase functions:log

# View logs for specific function
firebase functions:log --only getPerformanceSummary
```

### Update Function Configuration

```bash
# Set Gemini API key
firebase functions:config:set gemini.api_key="YOUR_KEY"

# View current config
firebase functions:config:get

# After config change, redeploy
firebase deploy --only functions
```

## Environment-Specific Configuration

### Development
```bash
npm run dev
# Runs on http://localhost:3000
# Uses Firebase project specified in .firebaserc
```

### Staging (Optional)

1. **Create staging Firebase project:**
   - Create new Firebase project "my-lms-staging"
   - Follow setup steps from SETUP_GUIDE.md

2. **Add to .firebaserc:**
```json
{
  "projects": {
    "default": "my-lms-production",
    "staging": "my-lms-staging"
  }
}
```

3. **Deploy to staging:**
```bash
firebase use staging
firebase deploy
```

4. **Switch back to production:**
```bash
firebase use default
```

### Production

```bash
# Build optimized production bundle
npm run build

# Deploy everything
firebase deploy

# Or deploy specific services
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore:rules
```

## SSL/HTTPS

All hosting options above provide automatic HTTPS:

- **Firebase Hosting:** Free SSL certificate automatically provisioned
- **Cloudflare Pages:** Free SSL certificate automatically provisioned
- **Vercel:** Free SSL certificate automatically provisioned
- **Netlify:** Free SSL certificate automatically provisioned

No additional configuration needed!

## Performance Optimization

### 1. Enable Firestore Caching

Already configured in the app. Firestore automatically caches data locally.

### 2. Enable Compression

Already configured in `firebase.json` with appropriate caching headers.

### 3. Monitor Performance

Use Firebase Performance Monitoring:

```bash
# Install performance monitoring
npm install firebase/performance

# Add to your app (optional)
```

### 4. Optimize Images

If you add images later, use:
- WebP format
- Lazy loading
- Responsive images
- CDN delivery

## Rollback Strategy

### Firebase Hosting Rollback

```bash
# View deployment history
firebase hosting:channel:list

# Rollback to previous version
firebase hosting:rollback
```

### Cloud Functions Rollback

1. Go to Firebase Console > Functions
2. Click on the function
3. Click "..." > "Rollback to previous version"

### Cloudflare Pages Rollback

1. Go to Cloudflare Dashboard > Workers & Pages > Your project
2. Click "Deployments"
3. Find previous successful deployment
4. Click "..." > "Rollback to this deployment"

## Monitoring and Alerts

### Firebase Console

Monitor in real-time:
- Authentication: Active users, sign-ups
- Firestore: Reads, writes, deletes
- Functions: Invocations, errors, execution time

### Set Up Alerts

1. Go to Firebase Console > Project settings > Integrations
2. Enable monitoring integrations (Cloud Monitoring, Slack, etc.)
3. Set up alert policies for:
   - Function errors
   - High latency
   - Quota limits

## Backup Strategy

### Firestore Backups

#### Option 1: Automated (Recommended)

1. Go to Firebase Console > Firestore
2. Click "Backups" tab
3. Enable automated backups
4. Choose frequency (daily recommended)

#### Option 2: Manual Export

```bash
# Install gcloud CLI
# Export Firestore data
gcloud firestore export gs://YOUR_BUCKET_NAME/backups/$(date +%Y%m%d)
```

### Authentication Backup

User authentication is managed by Firebase and automatically backed up. No action needed.

## Cost Optimization

### Firebase Costs

Monitor usage at: Firebase Console > Usage and billing

**Free Tier Limits (Spark Plan):**
- Firestore: 50K reads, 20K writes, 20K deletes per day
- Cloud Functions: 125K invocations, 40K GB-seconds per month
- Authentication: Unlimited
- Hosting: 10 GB storage, 360 MB/day transfer

**To reduce costs:**
1. Optimize Firestore queries (use indexes)
2. Cache data client-side
3. Limit AI function calls (add rate limiting)
4. Monitor usage dashboard regularly

### Gemini API Costs

Monitor at: [Google Cloud Console](https://console.cloud.google.com)

- Free tier: 60 requests per minute
- After free tier: ~$0.35 per 1K requests

**To reduce costs:**
1. Cache AI responses client-side
2. Rate limit AI features (e.g., 5 per day per student)
3. Use shorter prompts when possible

## Security Checklist Before Deployment

- [ ] Firestore Security Rules deployed and tested
- [ ] Firebase API keys are public by design (they're restricted by domain)
- [ ] Gemini API key is stored in Cloud Functions config (server-side only)
- [ ] All authorized domains configured in Firebase Authentication
- [ ] HTTPS enabled (automatic with all hosting options)
- [ ] Input validation in place (grades, forms)
- [ ] Error messages don't leak sensitive info
- [ ] Console.log() statements reviewed (no sensitive data)

## Post-Deployment Checklist

- [ ] Test login/logout on production URL
- [ ] Test all user roles (Admin, Teacher, Student)
- [ ] Test grade entry and retrieval
- [ ] Test AI features (if configured)
- [ ] Test CSV export
- [ ] Test on mobile devices
- [ ] Test on different browsers (Chrome, Firefox, Safari, Edge)
- [ ] Monitor Firebase Console for errors
- [ ] Check Cloud Functions logs for issues
- [ ] Set up monitoring alerts

## Continuous Deployment (CI/CD)

### GitHub Actions with Firebase

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Firebase

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          npm install
          cd functions && npm install
      
      - name: Build
        run: npm run build
      
      - name: Deploy to Firebase
        uses: w9jds/firebase-action@master
        with:
          args: deploy
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}
```

To get `FIREBASE_TOKEN`:
```bash
firebase login:ci
# Copy the token
# Add as secret in GitHub: Settings > Secrets > Actions > FIREBASE_TOKEN
```

## Domain Configuration

### Custom Domain on Firebase Hosting

1. Firebase Console > Hosting > Add custom domain
2. Enter your domain (e.g., `lms.myschool.com`)
3. Add DNS records as shown:
   ```
   Type: A
   Name: @  (or your subdomain)
   Value: [IP addresses shown by Firebase]
   ```
4. Wait 24-48 hours for SSL certificate provisioning
5. Update Firebase authorized domains

### Custom Domain on Cloudflare Pages

1. Cloudflare Pages > Your project > Custom domains
2. Click "Set up a custom domain"
3. Enter domain name
4. If domain is on Cloudflare, DNS is automatic
5. If not, add CNAME record:
   ```
   Type: CNAME
   Name: [subdomain or @]
   Value: [value provided by Cloudflare]
   ```

## Troubleshooting Deployment Issues

### Issue: "Build failed"

Check:
- All dependencies installed: `npm install`
- TypeScript compiles: `npm run build`
- Check build logs for specific errors

### Issue: "Functions deployment failed"

Check:
- Functions build successfully: `cd functions && npm run build`
- Firebase CLI is latest: `npm install -g firebase-tools`
- Billing is enabled on Firebase project (required for functions)

### Issue: "Permission denied" errors in production

Check:
- Firestore rules are deployed: `firebase deploy --only firestore:rules`
- Rules match your app logic
- Test rules in Firebase Console > Firestore > Rules playground

### Issue: "CORS errors" on deployed site

Check:
- Domain is added to Firebase authorized domains
- Check browser console for specific CORS error
- Clear browser cache

---

**Congratulations!** Your LMS is now deployed and production-ready! 🚀

