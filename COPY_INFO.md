# LMS Copy - Shareable Package

This folder contains a clean, shareable copy of the Learning Management System project.

## What's Included

✅ **Source Code**
- `src/` - Main application source code (TypeScript)
- `functions/src/` - Cloud Functions source code (TypeScript)

✅ **Configuration Files**
- `package.json` - Root project dependencies
- `functions/package.json` - Functions dependencies
- `tsconfig.json` - TypeScript configuration
- `vite.config.ts` - Vite build configuration
- `firebase.json` - Firebase project configuration
- `firestore.rules` - Database security rules
- `firestore.indexes.json` - Database indexes
- `.gitignore` - Git ignore patterns

✅ **Documentation**
- `README.md` - Complete project documentation
- `SETUP_GUIDE.md` - Step-by-step setup instructions
- `DEPLOYMENT.md` - Deployment guide
- `PROJECT_SUMMARY.md` - Implementation overview
- `QUICK_START.md` - Quick start guide
- And other helpful documentation files

✅ **Assets**
- `index.html` - Main HTML file
- `public/` - Public assets (logos, images)

## What's NOT Included

❌ `node_modules/` - Dependencies (run `npm install` to generate)
❌ `dist/` - Build output (run `npm run build` to generate)
❌ `functions/lib/` - Compiled functions (run `npm run build` in functions/)
❌ `.firebase/` - Firebase cache files
❌ Cloudflare-specific deployment configs (in root project)

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   cd functions && npm install && cd ..
   ```

2. **Configure API Keys and Firebase (REQUIRED):**
   - **See `CONFIGURATION.md` for complete setup instructions**
   - All API keys have been removed - you must add your own
   - Create Firebase project and update configuration files
   - Deploy security rules

3. **Run development server:**
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:3000`

## Important Notes

⚠️ **API Keys Removed**: All API keys and sensitive configuration have been removed from this copy. You MUST:
- Configure your own Firebase project (see `CONFIGURATION.md`)
- Add your Firebase configuration to `src/config.ts`
- Update `.firebaserc` with your project ID
- (Optional) Add Gemini API key for AI features

⚠️ **Security Rules Must Be Deployed**: Without deploying Firestore security rules, the app will not work. Run `firebase deploy --only firestore:rules` before using the app.

✅ **Everything Else is Ready**: All source code, configuration files, and documentation are included. Just install dependencies and configure your API keys!

📖 **Start Here**: Read `CONFIGURATION.md` first for step-by-step API key setup instructions.

---
*This is a clean, shareable copy of the LMS project. All original files remain in the parent directory.*

