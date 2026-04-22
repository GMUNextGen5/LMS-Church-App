# LMS Church App — Developer Guide

## Architecture Overview

### Module Organization

```
src/main.ts              ← Slim orchestrator (~120 lines)
src/state.ts             ← Centralized shared state (getters/setters)
src/utils.ts             ← Shared utilities (clipboard, formatting)
src/firebase.ts          ← Firebase SDK initialization
src/config.ts            ← Firebase configuration
src/auth.ts              ← Authentication logic
src/data.ts              ← Data access layer (Firestore)
src/ui.ts                ← UI state management
src/types.ts             ← TypeScript type definitions
src/particles.ts         ← Background particle animation
src/styles/app.css       ← All application CSS

src/features/
  ├── auth/auth-forms.ts       ← Login/Signup form handlers
  ├── ai/ai-summary.ts        ← AI performance summary & study tips
  ├── ai/ai-chat.ts            ← AI Agent chat interface
  ├── users/users.ts           ← Admin user management
  ├── grades/grades.ts         ← Grade display, charts, management
  ├── attendance/attendance.ts ← Attendance tracking & stats
  ├── dashboard/dashboard.ts   ← Dashboard stats, student search, activity feed
  ├── students/students.ts     ← Student registration, dropdown population
  └── students/student-profile.ts ← Student profile view, UID display
```

### Initialization Flow

1. `DOMContentLoaded` → `init()` in main.ts
2. `initUI()` → sets up core UI event listeners
3. `initAuth(handleAuthStateChange)` → listens for Firebase auth
4. `setup*Handlers()` → each feature module registers its DOM listeners
5. Auth state change → `handleAuthStateChange(user)`
   - Login: `showAppContainer()` → `configureUIForRole()` → `loadDashboardData()`
   - Logout: `showAuthContainer()` → `resetAppState()`

### State Management

Centralized in `src/state.ts` with getter/setter pattern:
- `getStudents() / setStudents()` — Student records
- `getGrades() / setGrades()` — Current student's grades
- `getAttendance() / setAttendance()` — Current student's attendance
- `getSelectedStudentId() / setSelectedStudentId()` — Active selection
- `getGradesUnsubscribe() / setGradesUnsubscribe()` — Real-time listener cleanup

Data flow: **Firestore → State → UI Display**

### Auth Architecture

Two-layer system:
1. **Firebase Auth** — credentials (email/password), session management
2. **Firestore `/users/{uid}`** — role (`admin | teacher | student`), metadata

### Role-Based Access

| Feature | Admin | Teacher | Student |
|---------|-------|---------|---------|
| Dashboard (all students) | ✅ | ✅ | ❌ |
| Student Registration | ✅ | ❌ | ❌ |
| User Management | ✅ | ❌ | ❌ |
| AI Agent Chat | ✅ | ❌ | ❌ |
| Mark Attendance | ✅ | ✅ | ❌ |
| Add/Edit/Delete Grades | ✅ | ✅ | ❌ |
| View Own Grades | ✅ | ✅ | ✅ |
| AI Summary/Study Tips | ❌ | ❌ | ✅ |
| Student Profile | ❌ | ❌ | ✅ |

### AI Integration

Three AI features, all via Cloud Functions (Gemini API, server-side key):
1. **Performance Summary** — `getPerformanceSummary` (student-facing)
2. **Study Tips** — `getStudyTips` (student-facing)
3. **AI Agent Chat** — `aiAgentChat` (admin-only, maintains conversation history)

### Logging Conventions

- ✅ Success operations
- ❌ Error conditions
- 🔍 Data queries
- 📊 Data loading
- 🤖 AI operations
- ⚠️ Non-critical warnings
- 🔐 Authentication

### Common Debugging

1. **Students don't show**: Check user role, `studentUid` field match, security rules
2. **Grades don't load**: Check `selectedStudentId`, real-time listener, permissions
3. **AI not working**: Check Cloud Functions deployed, `GEMINI_API_KEY` set, CORS
4. **UI not updating**: Check state variables updated, display functions called
5. **Memory leaks**: Ensure `gradesUnsubscribe()` called when switching students
