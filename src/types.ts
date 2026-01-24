/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TYPE DEFINITIONS FOR LMS APPLICATION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Centralized type definitions for the entire LMS application ensuring type
 * safety across frontend and backend code. These types map directly to
 * Firestore document structures.
 * 
 * ARCHITECTURE:
 * - User types: Authentication and authorization
 * - Student types: Student profile and enrollment data
 * - Grade types: Academic performance tracking
 * - Attendance types: Attendance record management
 * - Course types: Course and enrollment management
 * - AI types: AI integration interfaces
 * 
 * FIRESTORE MAPPING:
 * - User → /users/{uid}
 * - Student → /students/{studentId}
 * - Grade → /students/{studentId}/grades/{gradeId}
 * - Attendance → /students/{studentId}/attendance/{attendanceId}
 * - Course → /courses/{courseId}
 * 
 * DEBUGGING TIPS:
 * If data isn't loading correctly:
 * 1. Check Firestore console to verify document structure matches these types
 * 2. Verify all required fields are present (non-optional fields)
 * 3. Check field name spelling (JavaScript is case-sensitive)
 * 4. Verify date fields are ISO strings (YYYY-MM-DDTHH:mm:ss.sssZ)
 * 5. Check that UID references are valid Firebase Auth UIDs
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ==================== USER & AUTHENTICATION TYPES ====================

/**
 * UserRole - Three-tier role-based access control
 * 
 * ROLES:
 * - 'admin': Full system access, can manage users, students, courses
 * - 'teacher': Can view assigned students, manage grades & attendance
 * - 'student': Can view only their own grades and attendance
 * 
 * SECURITY:
 * - Roles are enforced by Firestore security rules
 * - Roles are stored in /users/{uid}/role
 * - Roles are checked on both client and server
 * 
 * DEFAULT: New signups are assigned 'student' role by default
 */
export type UserRole = 'admin' | 'teacher' | 'student';

/**
 * User - Core user profile and authentication data
 * 
 * STORED IN: /users/{uid}
 * 
 * FIELDS:
 * - uid: Firebase Auth UID (unique identifier)
 * - email: User's email address from Firebase Auth
 * - role: UserRole determining access level
 * - createdAt: ISO timestamp when account was created
 * 
 * LIFECYCLE:
 * 1. User signs up with email/password
 * 2. Firebase Auth creates authentication account
 * 3. Client creates User document in Firestore with 'student' role
 * 4. Admin can change role via User Management interface
 * 
 * DEBUG:
 * - If user can't access features, check their role in Firestore
 * - If authentication fails, check Firebase Auth console
 * - If role changes don't apply, user may need to log out and back in
 */
export interface User {
  uid: string;              // Firebase Auth UID (immutable)
  email: string;            // Email from Firebase Auth
  role: UserRole;           // Access control role
  createdAt: string;        // ISO timestamp of account creation
}

// ==================== STUDENT & ENROLLMENT TYPES ====================

/**
 * Student - Student profile and enrollment data
 * 
 * STORED IN: /students/{studentId}
 * 
 * CRITICAL FIELDS:
 * - studentUid: MUST match Firebase Auth UID of student's account
 *   This is how the system links student records to user accounts
 * - parentUid: Can be same as studentUid or different for parent accounts
 * 
 * FIELDS:
 * - id: Firestore document ID (auto-generated)
 * - name: Student's full name
 * - memberId: Optional school/organization member ID
 * - yearOfBirth: Birth year for age calculation
 * - contactPhone: Primary contact phone number
 * - contactEmail: Primary contact email
 * - parentUid: Firebase Auth UID of parent's account
 * - studentUid: Firebase Auth UID of student's account (CRITICAL)
 * - notes: Admin notes about the student
 * - createdAt: ISO timestamp when record was created
 * - createdBy: UID of admin who created this record
 * 
 * LIFECYCLE:
 * 1. Student signs up and gets a Firebase Auth UID
 * 2. Student shares UID with admin (shown in signup modal)
 * 3. Admin creates Student record via registration form
 * 4. Admin links Student record to UID by entering it in studentUid field
 * 5. Student can now log in and see their data
 * 
 * DATA ACCESS:
 * - Admin: Sees all students
 * - Teacher: Sees students in their courses (studentIds array)
 * - Student: Sees ONLY records where studentUid matches their UID
 * 
 * DEBUG:
 * - If student can't see their data: Check studentUid matches Firebase Auth UID
 * - If student sees no records: Verify admin created a record for them
 * - If wrong student data shows: Check studentUid is unique
 * - Check Firestore console: /students collection
 * - Verify Firestore security rules allow the read operation
 */
export interface Student {
  id: string;                // Firestore document ID
  name: string;              // Student's full name (required)
  memberId?: string;         // School/organization ID (optional)
  yearOfBirth?: number;      // Birth year (optional, for age calculation)
  contactPhone?: string;     // Primary contact phone (optional)
  contactEmail?: string;     // Primary contact email (optional)
  parentUid: string;         // Firebase Auth UID of parent account
  studentUid: string;        // ⚠️ CRITICAL: Firebase Auth UID of student account
  notes?: string;            // Admin notes (optional)
  createdAt: string;         // ISO timestamp of creation
  createdBy?: string;        // UID of admin who created this record
}

// ==================== ACADEMIC PERFORMANCE TYPES ====================

/**
 * Grade - Individual assignment/test grade record
 * 
 * STORED IN: /students/{studentId}/grades/{gradeId}
 * 
 * STRUCTURE: Grades are stored in subcollections under each student
 * This allows for efficient querying and access control
 * 
 * FIELDS:
 * - id: Firestore document ID (auto-generated)
 * - studentId: Reference to parent student document
 * - assignmentName: Name of the assignment/test
 * - category: Type of assessment (Quiz, Test, Homework, Project, Exam)
 * - score: Points earned by student
 * - totalPoints: Maximum points possible
 * - date: ISO timestamp when grade was recorded
 * - teacherId: UID of teacher who entered this grade
 * 
 * CALCULATIONS:
 * - Percentage: (score / totalPoints) * 100
 * - Letter Grade: Calculated in UI using standard scale
 * - Category Average: Average of all grades in same category
 * 
 * DATA ACCESS:
 * - Admin: Can view/edit all grades
 * - Teacher: Can view/edit grades for their students
 * - Student: Can view their own grades (read-only)
 * 
 * DEBUG:
 * - If grades don't show: Check /students/{studentId}/grades subcollection
 * - If percentages are wrong: Verify score and totalPoints are numbers
 * - If student can't see grades: Check Firestore security rules
 * - Use Chrome DevTools → Network → Firestore to see query results
 */
export interface Grade {
  id: string;                                               // Firestore document ID
  studentId: string;                                        // Parent student document ID
  assignmentName: string;                                   // Assignment name (required)
  category: 'Quiz' | 'Test' | 'Homework' | 'Project' | 'Exam';  // Assessment type
  score: number;                                            // Points earned (0+)
  totalPoints: number;                                      // Maximum points possible (> 0)
  date: string;                                             // ISO timestamp
  teacherId: string;                                        // UID of teacher who entered grade
}

// ==================== ATTENDANCE TYPES ====================

/**
 * Attendance - Daily attendance record for a student
 * 
 * STORED IN: /students/{studentId}/attendance/{attendanceId}
 * 
 * STRUCTURE: Attendance records are stored in subcollections under each student
 * This allows for efficient querying and access control
 * 
 * FIELDS:
 * - id: Firestore document ID (auto-generated)
 * - studentId: Reference to parent student document
 * - date: Date of attendance (YYYY-MM-DD format)
 * - status: Attendance status
 * - notes: Optional notes about the attendance
 * - markedBy: UID of teacher/admin who marked attendance
 * 
 * STATUS OPTIONS:
 * - 'present': Student attended class
 * - 'absent': Student did not attend (unexcused)
 * - 'late': Student arrived after start time
 * - 'excused': Student absent with valid excuse
 * 
 * CALCULATIONS:
 * - Attendance Rate: (present + late + excused) / total * 100
 * - Total Days: Count of all attendance records
 * - Present Days: Count of 'present' status
 * - Absent Days: Count of 'absent' status
 * 
 * DATA ACCESS:
 * - Admin: Can view/mark attendance for all students
 * - Teacher: Can view/mark attendance for their students
 * - Student: Can view their own attendance (read-only)
 * 
 * DEBUG:
 * - If attendance doesn't show: Check /students/{studentId}/attendance subcollection
 * - If rates are wrong: Verify status values match exact strings
 * - If student can't see attendance: Check Firestore security rules
 * - Check date format is consistent (YYYY-MM-DD)
 */
export interface Attendance {
  id: string;                                             // Firestore document ID
  studentId: string;                                      // Parent student document ID
  date: string;                                           // Date in YYYY-MM-DD format
  status: 'present' | 'absent' | 'late' | 'excused';     // Attendance status
  notes?: string;                                         // Optional notes
  markedBy: string;                                       // UID of teacher/admin
}

// ==================== COURSE MANAGEMENT TYPES ====================

/**
 * Course - Course/class information and enrollment
 * 
 * STORED IN: /courses/{courseId}
 * 
 * PURPOSE: Courses define which students a teacher can access
 * 
 * FIELDS:
 * - id: Firestore document ID (auto-generated)
 * - courseName: Name of the course
 * - courseCode: Optional course code (e.g., "MATH101")
 * - teacherId: UID of assigned teacher
 * - studentIds: Array of student document IDs enrolled in this course
 * - schedule: Optional schedule information
 * - description: Optional course description
 * - createdAt: ISO timestamp when course was created
 * 
 * USAGE:
 * - Teachers can only access students in their courses
 * - studentIds array determines which students a teacher can see
 * - Used in fetchStudents() to filter data by teacher
 * 
 * DATA ACCESS:
 * - Admin: Can view/create/edit all courses
 * - Teacher: Can view their own courses (teacherId matches their UID)
 * - Student: Does not directly access courses collection
 * 
 * DEBUG:
 * - If teacher can't see students: Check studentIds array includes them
 * - If wrong students show: Verify studentIds array is correct
 * - Check /courses collection in Firestore console
 */
export interface Course {
  id: string;                  // Firestore document ID
  courseName: string;          // Course name (required)
  courseCode?: string;         // Course code (optional)
  teacherId: string;           // UID of assigned teacher
  studentIds: string[];        // Array of enrolled student document IDs
  schedule?: string;           // Schedule info (optional)
  description?: string;        // Course description (optional)
  createdAt: string;           // ISO timestamp of creation
}

// ==================== AI INTEGRATION TYPES ====================

/**
 * AIRequest - Request payload for AI-powered features
 * 
 * PURPOSE: Type definition for AI feature requests
 * 
 * FIELDS:
 * - studentId: Student document ID to analyze
 * - type: Type of AI analysis to perform
 * 
 * USAGE:
 * Used when calling Cloud Functions for AI features:
 * - 'summary': Generate performance summary
 * - 'study-tips': Generate personalized study tips
 * 
 * DEBUG:
 * - Verify studentId is valid Firestore document ID
 * - Check type matches exactly (case-sensitive)
 */
export interface AIRequest {
  studentId: string;                    // Student document ID
  type: 'summary' | 'study-tips';       // AI analysis type
}

/**
 * AIResponse - Response payload from AI features
 * 
 * PURPOSE: Type definition for AI feature responses
 * 
 * FIELDS:
 * - summaryHtml: HTML-formatted response from AI
 * 
 * USAGE:
 * Response from Cloud Functions containing AI-generated content
 * HTML is rendered directly in modal dialogs
 * 
 * DEBUG:
 * - If HTML doesn't render: Check for valid HTML tags
 * - If styles don't apply: Check Tailwind classes in HTML
 * - Verify response structure matches this interface
 */
export interface AIResponse {
  summaryHtml: string;          // HTML-formatted AI response
}

