# Deployment Checklist: Cloudflare Pages + Firebase Backend

Use this checklist before and when deploying to production.

---

## Pre-deployment

- [ ] **Firebase project** created; Auth (Email/Password) and Firestore enabled
- [ ] **Environment variables** (no secrets in code):
  - Root: copy `.env.example` → `.env`, set all `VITE_FIREBASE_*` from Firebase Console → Project Settings → Your apps
  - Functions: copy `functions/.env.example` → `functions/.env`, set `GEMINI_API_KEY`
- [ ] **Local build** succeeds: `npm run build`
- [ ] **Backend deployed** at least once: `npm run deploy:backend` (or `firebase deploy --only functions,firestore:rules,firestore:indexes`)
- [ ] **First admin**: sign up in the app, then in Firestore set `users/<your-uid>.role` to `admin`

---

## Deploy frontend to Cloudflare Pages

1. **Connect repo** (or upload build):
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: (default)

2. **Set env vars in Cloudflare** (Pages → your project → Settings → Environment variables):
   - Add each `VITE_FIREBASE_*` from your `.env` for **Production** (and Preview if you use branch previews).
   - Without these, the app loads but Firebase (login, data) will not work.

3. **Add Cloudflare domain to Firebase** (required for Auth):
   - Firebase Console → **Authentication** → **Settings** → **Authorized domains**
   - Add your Pages URL, e.g. `your-project.pages.dev` or your custom domain.

4. **Redeploy** after adding env vars so the build includes them.

---

## Post-deployment

- [ ] Open the live URL and sign in (or sign up).
- [ ] Confirm Firestore data appears (e.g. dashboard, students).
- [ ] Test one AI feature (e.g. Performance summary or Study tips) to confirm Functions + Gemini.
- [ ] Optional: add custom domain in Cloudflare and add that domain to Firebase Authorized domains.

---

## Architecture summary

| Layer        | Where it runs        | Notes                                      |
|-------------|----------------------|--------------------------------------------|
| Frontend    | Cloudflare Pages     | Static `dist/`; env vars at build time     |
| Auth/DB     | Firebase             | Auth + Firestore; no Firebase Hosting      |
| API / AI    | Firebase Functions   | Callable functions; CORS handled by Firebase |

No API keys or secrets are in the frontend bundle; Firebase config is public by design; Gemini key stays in Functions only.
