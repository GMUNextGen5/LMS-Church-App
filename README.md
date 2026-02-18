# NG5 LMS - Learning Management System

A Learning Management System built with Firebase (backend only), TypeScript, and AI integration. The **frontend is hosted on Cloudflare Pages**; Firebase provides Authentication, Firestore, and Cloud Functions. Features role-based access control, real-time data, assessments with auto-grading, and AI-powered performance reports.

## Features

- **Role-Based Access Control** - Admin, Teacher, and Student roles with granular permissions
- **Student & Teacher Registration** - Admin panel for registering and managing users with UID linking
- **Classes Management** - Create, edit, and manage classes with teacher/student assignment
- **Assessments** - Create assessments with multiple question types, auto-grading, and grade release
- **Grades & Reports** - Real-time grade tracking with AI-powered performance summaries
- **Attendance Tracking** - Daily attendance with status options (present, absent, late, excused)
- **AI Integration** - Gemini-powered performance summaries and personalized study tips
- **Theme Toggle** - Sci-Fi and Classic visual themes
- **CSV Export** - Export grades for offline analysis
- **Real-time Updates** - Instant data sync using Firestore listeners

## Tech Stack

- **Frontend**: HTML, TypeScript, Tailwind CSS, Vite
- **Backend**: Firebase (Authentication, Firestore, Cloud Functions v2) — backend only
- **AI**: Google Gemini API (via Cloud Functions)
- **Hosting**: Cloudflare Pages (frontend); Firebase is not used for hosting

## Project Structure

```
├── src/
│   ├── main.ts              # Application entry point & orchestration
│   ├── vite-env.d.ts        # Vite environment type declarations
│   ├── core/                # Config, Firebase, auth, shared types
│   │   ├── config.ts        # Env-based Firebase config
│   │   ├── firebase.ts      # Firebase SDK init & exports
│   │   ├── auth.ts          # Authentication logic
│   │   └── types.ts         # TypeScript type definitions
│   ├── data/                # Firestore & API layer
│   │   ├── data.ts          # Students, grades, attendance, users
│   │   ├── assessment-data.ts  # Assessments, questions, submissions
│   │   └── classes-data.ts  # Classes/courses CRUD & roster
│   └── ui/                  # UI components & views
│       ├── ui.ts            # Loading, modals, auth forms
│       ├── particles.ts     # Login background effects
│       ├── assessment-ui.ts # Assessment tab & exam UI
│       └── classes-ui.ts    # Classes tab (role-adaptive)
├── functions/
│   └── src/
│       ├── index.ts         # Cloud Functions (AI, user management)
│       └── ai-config.ts    # AI prompts & model config
├── public/
│   ├── _redirects           # Cloudflare Pages SPA fallback
│   └── _headers             # Security headers
├── index.html               # Main app (shell, styles, nav)
├── privacy.html             # Privacy policy
├── terms.html               # Terms of service
├── firestore.rules          # Firestore security rules
├── firestore.indexes.json   # Firestore indexes
├── firebase.json            # Firebase config (no hosting)
├── tsconfig.json            # TypeScript config
├── vite.config.ts           # Vite build config
└── package.json             # Dependencies & scripts
```

## Setup

### Prerequisites

- Node.js 18+
- Firebase CLI: `npm install -g firebase-tools`
- A Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
- A Gemini API key from [ai.google.dev](https://ai.google.dev)

### 1. Install Dependencies

```bash
npm install
cd functions && npm install && cd ..
```

### 2. Environment variables (no API keys in code)

All API keys and config are read from `.env` files. **Do not put secrets in source code.**

**Frontend (Firebase):**
- Copy `.env.example` to `.env` in the project root
- Fill in the `VITE_FIREBASE_*` values from Firebase Console → Project Settings → General → Your apps

**Cloud Functions (Gemini):**
- Copy `functions/.env.example` to `functions/.env`
- Set `GEMINI_API_KEY` in `functions/.env` (get a key at [ai.google.dev](https://ai.google.dev))

### 3. Configure Firebase project

1. Create a Firebase project and enable **Email/Password** authentication
2. Enable **Firestore Database**
3. Set your Firebase project: run `firebase use your-project-id` (use the same project ID as in `.env`)

### 4. Deploy Rules & Indexes

```bash
firebase login
firebase deploy --only firestore:rules,firestore:indexes
```

### 5. Configure & Deploy Cloud Functions

Ensure `functions/.env` exists with `GEMINI_API_KEY` (see step 2). Then:

```bash
firebase deploy --only functions
```

### 6. Development

```bash
npm run dev            # Start dev server at http://localhost:3000
npm run build          # Production build to dist/
npm run preview        # Preview production build locally
npm run deploy:backend # Deploy only Firebase (functions + Firestore rules/indexes)
```

### 7. Deploy frontend to Cloudflare Pages

The site is hosted on **Cloudflare Pages**; Firebase is used only for backend (Auth, Firestore, Functions).

1. **Build** (uses your `.env` for Firebase config):
   ```bash
   npm run build
   ```
   Output is in `dist/` (includes `_redirects` for SPA routing).

2. **Connect to Cloudflare Pages** (e.g. [dash.cloudflare.com](https://dash.cloudflare.com) → Pages → Create project):
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** (leave default)
   - Deploy via Git or upload the `dist/` folder.

3. **Add your Pages URL to Firebase (required for sign-in):**
   - Firebase Console → **Authentication** → **Settings** → **Authorized domains**
   - Add your Cloudflare Pages domain (e.g. `your-project.pages.dev` or your custom domain).

Without a populated `.env` in the build, the app will load but sign-in will not work. On Cloudflare Pages you can set **Environment variables** in the dashboard (same `VITE_FIREBASE_*` names) for production builds.

### 8. Create First Admin

1. Sign up through the app (creates a user with `student` role)
2. Go to Firebase Console > Firestore > `users` collection
3. Find your user document and change `role` from `student` to `admin`
4. Log out and log back in

## User Roles

### Admin
- Full access to all data and management panels
- Register students and teachers, manage user roles
- Create and manage classes, view all grades and attendance
- Access AI chat agent for data queries

### Teacher
- View and manage assigned students and classes
- Create classes and assessments with auto-grading
- Add grades, mark attendance, release assessment results
- Access AI performance reports for their students

### Student
- View enrolled classes and take assessments
- View own grades, attendance, and AI study tips
- Export grades to CSV

## Security

Firestore security rules enforce role-based access:
- Students can only read their own data
- Teachers can read/write data for students in their courses
- Admins have full access
- AI API keys are never exposed to the client (Cloud Functions proxy)
- Assessment-synced grades can be written by the student who submitted

## AI Features

- **Performance Summary** - Analyzes grades and attendance to provide insights and recommendations
- **Study Tips** - Personalized study strategies based on performance patterns
- **AI Chat** (Admin) - Conversational agent for querying student/class data

All AI features run through Cloud Functions with 90-second Gemini API timeouts and 120-second client-side timeouts.

## License

This project is for educational purposes. Modify as needed for your use case.

## Credits

Adib, Erick, Saaeed, Lulya, Liya
