# Firebase LMS - Learning Management System

A secure, FERPA-compliant Learning Management System built with Firebase, TypeScript, and AI integration.

## Features

- **3-Tier Access Control**: Admin, Teacher, and Student/Parent roles
- **Real-time Data**: Instant updates using Firestore
- **FERPA Compliance**: Server-side security rules enforcing data access policies
- **AI Integration**: Gemini-powered performance summaries and study tips
- **Modern UI**: Professional, futuristic design with Tailwind CSS
- **Data Export**: CSV export for grades
- **BI Integration**: BigQuery export for Power BI dashboards

## Tech Stack

- **Frontend**: HTML, TypeScript, Tailwind CSS, Vite
- **Backend**: Firebase (Authentication, Firestore, Cloud Functions)
- **AI**: Google Gemini API
- **Analytics**: BigQuery, Power BI
- **Hosting**: Cloudflare Pages / Firebase Hosting

## Setup Instructions

### Prerequisites

- Node.js 18+ installed
- Firebase CLI installed: `npm install -g firebase-tools`
- A Firebase project created at https://console.firebase.google.com
- A Google AI API key for Gemini

### 1. Clone and Install

```bash
npm install
cd functions && npm install && cd ..
```

### 2. Configure Firebase

1. Create a Firebase project at https://console.firebase.google.com
2. Enable **Email/Password** authentication in Firebase Console > Authentication
3. Enable **Firestore Database** in Firebase Console > Firestore
4. Get your Firebase config from Project Settings
5. Update `src/config.ts` with your Firebase configuration
6. Update `.firebaserc` with your Firebase project ID

### 3. Deploy Firestore Rules and Indexes

```bash
firebase login
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### 4. Configure Cloud Functions

1. Set up Gemini API key:
```bash
firebase functions:config:set gemini.api_key="YOUR_GEMINI_API_KEY"
```

2. Deploy functions:
```bash
cd functions
npm run build
cd ..
firebase deploy --only functions
```

### 5. Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

### 6. Build for Production

```bash
npm run build
```

The production build will be in the `dist/` folder.

## Security Model

### Firestore Security Rules

The application implements FERPA-compliant security rules:

- **Students**: Only admins, parents, assigned teachers, and the students themselves can read student data
- **Grades**: Only teachers and admins can write grades; students/parents can only read
- **Attendance**: Same as grades
- **Courses**: Only admins can create; teachers can manage their own courses
- **Users**: Users can read their own profile; only admins can change roles

### AI Functions Security

All AI features use Cloud Functions as a secure proxy:

1. Client calls Cloud Function (not Gemini directly)
2. Function validates authentication and authorization
3. Function fetches data from Firestore
4. Function calls Gemini API server-side (API key never exposed)
5. Function returns sanitized results to client

## User Roles

### Admin
- Full access to all data
- Can create students, courses, and manage user roles
- Can view all grades and attendance
- Access to user management panel

### Teacher
- Can view assigned students
- Can add/edit/delete grades for their students
- Can mark attendance
- Can manage their own courses

### Student/Parent
- Can view only their own student data
- Can view grades and attendance
- Can use AI features (performance summaries, study tips)
- Can export data to CSV
- **Cannot** modify any records

## AI Features

### Performance Summary
Analyzes grades and attendance to provide:
- Overall academic performance assessment
- Strengths and achievements
- Areas needing attention
- Attendance patterns
- Specific recommendations

### Study Tips
Provides personalized recommendations:
- Strategies for improving weak areas
- Time management tips
- Study techniques for different assignment types
- Actionable steps for the next 2 weeks

## Data Model

### Collections

```
users/{uid}
  - email: string
  - role: 'admin' | 'teacher' | 'student'
  - createdAt: string

students/{studentId}
  - name: string
  - memberId: string (optional)
  - parentUid: string
  - studentUid: string
  - createdAt: string
  
  grades/{gradeId}
    - assignmentName: string
    - category: 'Quiz' | 'Test' | 'Homework' | 'Project' | 'Exam'
    - score: number
    - totalPoints: number
    - date: string
    - teacherId: string
  
  attendance/{attendanceId}
    - date: string
    - status: 'present' | 'absent' | 'late' | 'excused'
    - notes: string (optional)
    - markedBy: string

courses/{courseId}
  - courseName: string
  - courseCode: string (optional)
  - teacherId: string
  - studentIds: string[]
  - schedule: string (optional)
  - description: string (optional)
  - createdAt: string
```

## BI Integration

### Power BI via BigQuery

1. Install Firebase BigQuery extension from Firebase Console
2. Configure to export `students` collection (with subcollections)
3. Create SQL views in BigQuery to flatten nested data
4. Connect Power BI to BigQuery
5. Build dashboards using the views

### CSV Export

Students and parents can export their grades to CSV format for offline analysis in Excel or other tools.

## Deployment

### Option 1: Firebase Hosting

```bash
npm run build
firebase deploy --only hosting
```

Your app will be live at `https://YOUR_PROJECT_ID.web.app`

### Option 2: Cloudflare Pages

1. Push your code to GitHub
2. Create a Cloudflare Pages project
3. Connect to your GitHub repository
4. Set build command: `npm run build`
5. Set build output directory: `dist`
6. Deploy

Don't forget to add your Cloudflare domain to Firebase Console > Authentication > Authorized domains!

## Development

### Project Structure

```
/
├── src/
│   ├── main.ts          # Application entry point
│   ├── auth.ts          # Authentication logic
│   ├── ui.ts            # UI management
│   ├── data.ts          # Firestore operations
│   ├── firebase.ts      # Firebase initialization
│   ├── config.ts        # Firebase config
│   └── types.ts         # TypeScript definitions
├── functions/
│   └── src/
│       └── index.ts     # Cloud Functions
├── index.html           # Main HTML file
├── firestore.rules      # Security rules
├── firestore.indexes.json
├── firebase.json
├── package.json
└── README.md
```

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run deploy` - Build and deploy everything to Firebase

## First-Time Setup Checklist

- [ ] Create Firebase project
- [ ] Enable Email/Password authentication
- [ ] Enable Firestore Database
- [ ] Update `src/config.ts` with Firebase config
- [ ] Update `.firebaserc` with project ID
- [ ] Deploy Firestore rules and indexes
- [ ] Get Gemini API key
- [ ] Configure Cloud Functions with API key
- [ ] Deploy Cloud Functions
- [ ] Create first admin user (manually set role in Firestore Console)
- [ ] Test login and role-based access
- [ ] Create test students and courses
- [ ] Test AI features

## Support

For issues related to:
- Firebase: https://firebase.google.com/support
- Gemini API: https://ai.google.dev/docs
- TypeScript: https://www.typescriptlang.org/docs

## License

This project is for educational purposes. Modify as needed for your use case.

## Credits

Adib, Erick, Saaeed, Lulya, Liya

