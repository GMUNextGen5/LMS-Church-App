# LMS Application Architecture Flowchart

## Frontend-Backend Operations Overview

This document provides a comprehensive flowchart of all frontend-backend operations in the Learning Management System.

---

## System Architecture Overview

```
┌─────────────────┐
│   User Browser  │
│  (Frontend UI)  │
└────────┬────────┘
         │
         │ HTTPS/WebSocket
         │
┌────────▼─────────────────────────────────────┐
│         Firebase Services                     │
│  ┌──────────────┐  ┌──────────────┐          │
│  │  Auth        │  │  Firestore   │          │
│  │  (JWT)       │  │  (NoSQL DB)  │          │
│  └──────────────┘  └──────────────┘          │
│  ┌──────────────┐                            │
│  │  Cloud       │                            │
│  │  Functions   │                            │
│  │  (Serverless)│                            │
│  └──────────────┘                            │
└───────────────────────────────────────────────┘
         │
         │ API Calls
         │
┌────────▼────────┐
│  Gemini AI API  │
└─────────────────┘
```

---

## Complete Operation Flowchart

```mermaid
flowchart TB
    Start([User Opens Application]) --> Init[Initialize App]
    Init --> CheckAuth{User Authenticated?}
    
    CheckAuth -->|No| ShowLogin[Show Login/Signup Form]
    CheckAuth -->|Yes| FetchRole[Fetch User Role from Firestore]
    
    ShowLogin --> LoginAction{Action?}
    LoginAction -->|Sign In| SignIn[Call Firebase Auth: signInWithEmailAndPassword]
    LoginAction -->|Sign Up| SignUp[Call Firebase Auth: createUserWithEmailAndPassword]
    
    SignUp --> CreateUserDoc[Create User Document in Firestore<br/>Default Role: 'student']
    CreateUserDoc --> ShowUID[Display UID Modal to User]
    ShowUID --> SignIn
    
    SignIn --> AuthSuccess{Firebase Auth<br/>Success?}
    AuthSuccess -->|No| ShowError[Display Error Message]
    AuthSuccess -->|Yes| GetJWT[Receive JWT Token]
    
    ShowError --> ShowLogin
    GetJWT --> FetchRole
    
    FetchRole --> CheckRole{User Role?}
    
    CheckRole -->|Admin| AdminUI[Show Admin UI<br/>- Dashboard<br/>- Student Management<br/>- User Management<br/>- AI Agent]
    CheckRole -->|Teacher| TeacherUI[Show Teacher UI<br/>- Dashboard<br/>- Grade Entry<br/>- Attendance]
    CheckRole -->|Student| StudentUI[Show Student UI<br/>- Dashboard<br/>- Grades View<br/>- Profile]
    
    AdminUI --> AdminOps{Admin Operation?}
    TeacherUI --> TeacherOps{Teacher Operation?}
    StudentUI --> StudentOps{Student Operation?}
    
    %% ADMIN OPERATIONS
    AdminOps -->|Manage Students| FetchAllStudents[Fetch ALL Students<br/>from Firestore]
    AdminOps -->|Manage Users| CallGetUsers[Call Cloud Function:<br/>getAllUsers]
    AdminOps -->|Change Role| CallUpdateRole[Call Cloud Function:<br/>updateUserRole]
    AdminOps -->|Create Student| CreateStudent[Create Student Record<br/>in Firestore]
    AdminOps -->|Delete Student| DeleteStudent[Delete Student Record<br/>from Firestore]
    AdminOps -->|AI Agent Chat| AIChat[Call Cloud Function:<br/>aiAgentChat]
    
    FetchAllStudents --> FirestoreRead[Firestore Security Rules<br/>Check: isAdmin?]
    FirestoreRead -->|Allowed| ReturnStudents[Return Student Data]
    FirestoreRead -->|Denied| PermissionError[Permission Denied]
    
    CallGetUsers --> CFGetUsers[Cloud Function:<br/>1. Verify Admin Role<br/>2. Query Firestore<br/>3. Return All Users]
    CallUpdateRole --> CFUpdateRole[Cloud Function:<br/>1. Verify Admin Role<br/>2. Update User Document<br/>3. Return Success]
    
    CreateStudent --> FirestoreWrite[Firestore Security Rules<br/>Check: isAdmin?]
    FirestoreWrite -->|Allowed| CreateDoc[Create Student Document<br/>with studentUid link]
    FirestoreWrite -->|Denied| PermissionError
    
    %% TEACHER OPERATIONS
    TeacherOps -->|View Students| FetchCourseStudents[Fetch Students<br/>from Assigned Courses]
    TeacherOps -->|Add Grade| AddGrade[Add Grade to<br/>students/{id}/grades]
    TeacherOps -->|Mark Attendance| MarkAttendance[Mark Attendance in<br/>students/{id}/attendance]
    TeacherOps -->|Export CSV| ExportCSV[Generate CSV File<br/>Client-Side Export]
    
    FetchCourseStudents --> QueryCourses[Query Courses Collection<br/>where teacherId == uid]
    QueryCourses --> GetStudentIds[Extract Student IDs<br/>from Course Documents]
    GetStudentIds --> FetchStudentDocs[Fetch Student Documents<br/>from Firestore]
    FetchStudentDocs --> FirestoreRead
    
    AddGrade --> GradeWrite[Firestore Security Rules<br/>Check: isTeacher or isAdmin?]
    GradeWrite -->|Allowed| CreateGradeDoc[Create Grade Document<br/>with teacherId]
    GradeWrite -->|Denied| PermissionError
    
    MarkAttendance --> AttendanceWrite[Firestore Security Rules<br/>Check: isTeacher or isAdmin?]
    AttendanceWrite -->|Allowed| CreateAttendanceDoc[Create Attendance Document<br/>with markedBy]
    AttendanceWrite -->|Denied| PermissionError
    
    %% STUDENT OPERATIONS
    StudentOps -->|View Own Data| FetchOwnStudent[Query Students<br/>where studentUid == uid]
    StudentOps -->|View Grades| FetchOwnGrades[Fetch Grades from<br/>students/{id}/grades]
    StudentOps -->|View Attendance| FetchOwnAttendance[Fetch Attendance from<br/>students/{id}/attendance]
    StudentOps -->|AI Summary| CallAISummary[Call Cloud Function:<br/>getPerformanceSummary]
    StudentOps -->|Study Tips| CallStudyTips[Call Cloud Function:<br/>getStudyTips]
    
    FetchOwnStudent --> StudentRead[Firestore Security Rules<br/>Check: isOwner or isAdmin?]
    StudentRead -->|Allowed| ReturnOwnData[Return Student's Own Record]
    StudentRead -->|Denied| PermissionError
    
    FetchOwnGrades --> GradeRead[Firestore Security Rules<br/>Check: isOwner or isAdmin or isTeacher?]
    GradeRead -->|Allowed| ReturnGrades[Return Grades Data]
    GradeRead -->|Denied| PermissionError
    
    FetchOwnAttendance --> AttendanceRead[Firestore Security Rules<br/>Check: isOwner or isAdmin or isTeacher?]
    AttendanceRead -->|Allowed| ReturnAttendance[Return Attendance Data]
    AttendanceRead -->|Denied| PermissionError
    
    %% AI OPERATIONS
    CallAISummary --> CFSummary[Cloud Function:<br/>1. Verify Access Permission<br/>2. Fetch Grades & Attendance<br/>3. Prepare Data<br/>4. Call Gemini API<br/>5. Return HTML Summary]
    
    CallStudyTips --> CFTips[Cloud Function:<br/>1. Verify Access Permission<br/>2. Fetch Grades<br/>3. Calculate Category Averages<br/>4. Call Gemini API<br/>5. Return HTML Tips]
    
    AIChat --> CFChat[Cloud Function:<br/>1. Verify Admin Role<br/>2. Load All Student Data<br/>3. Build Context Summary<br/>4. Call Gemini API with Context<br/>5. Return Conversational Response]
    
    CFSummary --> GeminiAPI[Google Gemini API<br/>Generate Content]
    CFTips --> GeminiAPI
    CFChat --> GeminiAPI
    
    GeminiAPI --> ReturnAI[Return AI-Generated Content]
    ReturnAI --> DisplayModal[Display Result in Modal]
    
    %% REAL-TIME UPDATES
    ReturnStudents --> SetupListener[Setup Real-Time Listener<br/>onSnapshot for Grades]
    ReturnGrades --> SetupListener
    SetupListener --> ListenChanges[Firestore Listener<br/>Detects Changes]
    ListenChanges --> UpdateUI[Update UI Automatically]
    
    %% DATA FLOW BACK
    ReturnStudents --> UpdateDropdown[Update Student Dropdown]
    ReturnOwnData --> UpdateDropdown
    ReturnGrades --> DisplayGrades[Display Grades Table]
    ReturnAttendance --> DisplayAttendance[Display Attendance Table]
    
    UpdateDropdown --> End([Operation Complete])
    DisplayGrades --> End
    DisplayAttendance --> End
    DisplayModal --> End
    PermissionError --> End
    ExportCSV --> End
    
    %% STYLING
    classDef adminOp fill:#ef4444,stroke:#dc2626,color:#fff
    classDef teacherOp fill:#3b82f6,stroke:#2563eb,color:#fff
    classDef studentOp fill:#10b981,stroke:#059669,color:#fff
    classDef firestore fill:#f59e0b,stroke:#d97706,color:#fff
    classDef cloudFunc fill:#8b5cf6,stroke:#7c3aed,color:#fff
    classDef aiOp fill:#ec4899,stroke:#db2777,color:#fff
    
    class AdminUI,AdminOps,FetchAllStudents,CreateStudent,DeleteStudent,CallGetUsers,CallUpdateRole adminOp
    class TeacherUI,TeacherOps,FetchCourseStudents,AddGrade,MarkAttendance teacherOp
    class StudentUI,StudentOps,FetchOwnStudent,FetchOwnGrades,FetchOwnAttendance studentOp
    class FirestoreRead,FirestoreWrite,GradeWrite,AttendanceWrite,StudentRead,GradeRead,AttendanceRead firestore
    class CFGetUsers,CFUpdateRole,CFSummary,CFTips,CFChat cloudFunc
    class CallAISummary,CallStudyTips,AIChat,GeminiAPI,ReturnAI aiOp
```

---

## Key Operation Flows

### 1. Authentication Flow

```
User → Frontend Form → Firebase Auth API → JWT Token → Firestore User Document → Role Assignment → UI Configuration
```

**Security Checkpoints:**
- Firebase Authentication validates credentials
- Firestore Security Rules verify user document exists
- Role-based UI rendering based on user role

---

### 2. Student Data Access Flow

**Admin Access:**
```
Admin Request → Firestore Query (all students) → Security Rules Check (isAdmin?) → Return All Students
```

**Teacher Access:**
```
Teacher Request → Query Courses (where teacherId == uid) → Extract Student IDs → Fetch Student Documents → Return Course Students
```

**Student Access:**
```
Student Request → Query Students (where studentUid == uid) → Security Rules Check (isOwner?) → Return Own Record Only
```

**Security Enforcement:**
- Firestore Security Rules enforce FERPA compliance
- Server-side validation prevents unauthorized access
- Role-based queries limit data exposure

---

### 3. Grade Management Flow

**Adding a Grade:**
```
Teacher/Admin → Select Student → Enter Grade Data → Firestore Write (students/{id}/grades) → Security Rules Check → Create Document → Real-Time Update → UI Refresh
```

**Viewing Grades:**
```
User → Select Student → Firestore Read (students/{id}/grades) → Security Rules Check → Return Grades → Display Table
```

**Real-Time Updates:**
```
Firestore Change → onSnapshot Listener → Callback Function → Update UI Automatically
```

---

### 4. AI Operations Flow

**Performance Summary:**
```
Student/Admin → Click "Generate Summary" → Cloud Function Call → Verify Access → Fetch Grades & Attendance → Prepare Data → Call Gemini API → Generate Summary → Return HTML → Display Modal
```

**Study Tips:**
```
Student/Admin → Click "Study Tips" → Cloud Function Call → Verify Access → Fetch Grades → Calculate Category Averages → Call Gemini API → Generate Tips → Return HTML → Display Modal
```

**AI Agent Chat:**
```
Admin → Enter Message → Cloud Function Call → Verify Admin Role → Load All Student Data → Build Context → Call Gemini API → Generate Response → Return Text → Display in Chat
```

**Security:**
- All AI operations go through Cloud Functions (server-side)
- API keys never exposed to client
- Access permissions verified before data fetching
- FERPA-compliant data handling

---

### 5. Data Export Flow

**CSV Export:**
```
User → Click "Export CSV" → Client-Side Processing → Generate CSV String → Create Download Link → Trigger Download
```

**Note:** CSV export is client-side only. For server-side export or BigQuery integration, additional Cloud Functions would be needed.

---

## Security Architecture

### Multi-Layer Security

1. **Client-Side (Frontend)**
   - Role-based UI hiding/showing
   - Input validation
   - Error handling

2. **Firebase Authentication**
   - JWT token generation
   - Session management
   - Password hashing

3. **Firestore Security Rules**
   - Server-side enforcement
   - Role-based access control
   - FERPA-compliant data protection
   - Prevents unauthorized reads/writes

4. **Cloud Functions**
   - Server-side API key protection
   - Additional permission checks
   - Data validation
   - Error handling

---

## Data Flow Summary

### Read Operations
```
Frontend → Firebase SDK → Firestore Security Rules → Firestore Database → Return Data → Update UI
```

### Write Operations
```
Frontend → Firebase SDK → Firestore Security Rules → Firestore Database → Real-Time Update → Update UI
```

### AI Operations
```
Frontend → Cloud Functions → Permission Check → Fetch Data → Prepare Data → Gemini API → Process Response → Return to Frontend → Display
```

### Real-Time Updates
```
Firestore Change → onSnapshot Listener → Callback → Update State → Re-render UI
```

---

## Technology Stack

**Frontend:**
- TypeScript
- HTML/CSS (Tailwind)
- Vite (Build Tool)
- Firebase SDK (Client)

**Backend:**
- Firebase Authentication
- Cloud Firestore (NoSQL Database)
- Cloud Functions (Node.js/TypeScript)
- Google Gemini API

**Security:**
- Firestore Security Rules
- JWT Tokens
- Role-Based Access Control (RBAC)
- FERPA Compliance

---

## Key Features

✅ **3-Tier Access Control** (Admin, Teacher, Student)
✅ **Real-Time Data Sync** (Firestore Listeners)
✅ **FERPA-Compliant Security** (Server-Side Rules)
✅ **AI-Powered Insights** (Gemini Integration)
✅ **Role-Based UI** (Dynamic Interface)
✅ **Data Export** (CSV Generation)
✅ **Secure API Calls** (Cloud Functions)

---

## Notes for Team Presentation

1. **All operations are authenticated** - Users must be logged in
2. **Security is enforced server-side** - Firestore Rules cannot be bypassed
3. **AI operations are server-side only** - API keys never exposed
4. **Real-time updates** - Changes appear instantly across all clients
5. **Role-based access** - Each role sees only what they're allowed to see
6. **FERPA compliance** - Student data is protected according to educational privacy laws

---

*Generated for LMS Architecture Documentation*

