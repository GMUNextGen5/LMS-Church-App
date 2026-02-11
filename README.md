# NG5 LMS - Learning Management System

A Learning Management System built with Firebase, TypeScript, and AI integration. Features role-based access control, real-time data, assessments with auto-grading, and AI-powered performance reports.

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
- **Backend**: Firebase (Authentication, Firestore, Cloud Functions v2)
- **AI**: Google Gemini API (via Cloud Functions)
- **Hosting**: Firebase Hosting

## Project Structure

```
├── src/
│   ├── main.ts              # Application entry point & UI orchestration
│   ├── auth.ts              # Firebase Authentication logic
│   ├── data.ts              # Firestore CRUD (students, grades, attendance)
│   ├── firebase.ts          # Firebase SDK initialization & exports
│   ├── config.ts            # Firebase project configuration
│   ├── types.ts             # TypeScript type definitions
│   ├── ui.ts                # UI utilities (loading, modals, toasts)
│   ├── particles.ts         # Background particle effects
│   ├── classes-data.ts      # Classes/courses Firestore operations
│   ├── classes-ui.ts        # Classes tab UI (role-adaptive views)
│   ├── assessment-data.ts   # Assessment CRUD, auto-grading, submissions
│   ├── assessment-ui.ts     # Assessment tab UI & exam interface
│   └── vite-env.d.ts        # Vite environment type declarations
├── functions/
│   └── src/
│       ├── index.ts         # Cloud Functions (AI reports, user management)
│       └── ai-config.ts     # AI prompt templates & model configuration
├── public/
│   └── ng5-logo.png         # Application logo
├── index.html               # Main HTML (app shell, styles, navigation)
├── privacy.html             # Privacy policy page
├── terms.html               # Terms of service page
├── firestore.rules          # Firestore security rules
├── firestore.indexes.json   # Firestore composite indexes
├── firebase.json            # Firebase project configuration
├── tsconfig.json            # TypeScript configuration
├── vite.config.ts           # Vite build configuration
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

### 2. Configure Firebase

1. Create a Firebase project and enable **Email/Password** authentication
2. Enable **Firestore Database**
3. Copy your Firebase config from Project Settings > General > Your apps
4. Update `src/config.ts` with your config values
5. Update `.firebaserc` with your project ID

### 3. Deploy Rules & Indexes

```bash
firebase login
firebase deploy --only firestore:rules,firestore:indexes
```

### 4. Configure & Deploy Cloud Functions

```bash
# Set Gemini API key (create a .env file in functions/ directory)
# Add: GEMINI_API_KEY=your_key_here

# Deploy
firebase deploy --only functions
```

### 5. Development

```bash
npm run dev          # Start dev server at http://localhost:3000
npm run build        # Production build to dist/
npm run preview      # Preview production build
npm run deploy       # Build & deploy everything to Firebase
```

### 6. Create First Admin

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
