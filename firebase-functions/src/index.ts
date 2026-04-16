/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FIREBASE CLOUD FUNCTIONS FOR LMS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PURPOSE:
 * Server-side logic for secure operations, AI integration, and admin functions.
 * Handles sensitive operations that cannot be performed client-side.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE OVERVIEW
 * ════════════════════════════════════════════════════════════════════════════
 *
 * FUNCTIONS PROVIDED:
 *
 * 1. getPerformanceSummary (Student AI Feature)
 *    - Analyzes student grades and attendance
 *    - Calls Gemini AI for personalized insights
 *    - Returns HTML-formatted summary
 *
 * 2. getStudyTips (Student AI Feature)
 *    - Analyzes performance by category
 *    - Calls Gemini AI for study recommendations
 *    - Returns HTML-formatted tips
 *
 * 3. aiAgentChat (Admin AI Feature)
 *    - Conversational AI assistant
 *    - Has access to all student data
 *    - Maintains conversation history
 *    - Returns AI responses to natural language queries
 *
 * 4. updateUserRole (Admin Function)
 *    - Changes user roles (admin, teacher, student)
 *    - Admin-only operation
 *    - Updates /users/{uid}/role in Firestore
 *
 * 5. getAllUsers (Admin Function)
 *    - Retrieves all registered users
 *    - Admin-only operation
 *    - Returns user list with roles and emails
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ENVIRONMENT CONFIGURATION
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ENVIRONMENT VARIABLES:
 *
 * LOCAL DEVELOPMENT:
 * - Load from firebase-functions/.env (copy from firebase-functions/.env.example)
 * - Set GEMINI_API_KEY in firebase-functions/.env
 *
 * PRODUCTION:
 * - Set GEMINI_API_KEY in Firebase Functions config or Secret Manager (never in code)
 * - Access in code: process.env.GEMINI_API_KEY
 *
 * ════════════════════════════════════════════════════════════════════════════
 * SECURITY MODEL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * AUTHENTICATION:
 * - All functions require authentication (request.auth must exist)
 * - Firebase automatically validates auth tokens
 * - User identity from request.auth.uid
 *
 * AUTHORIZATION:
 * - Role checked from /users/{uid}/role in Firestore
 * - Different functions have different role requirements:
 *   - AI Student features: Any authenticated user with access to student
 *   - AI Admin features: Admin role only
 *   - User management: Admin role only
 *
 * DATA ACCESS:
 * - checkStudentAccess() helper validates permissions
 * - Enforces FERPA compliance
 * - Admin: Access all students
 * - Teacher: Access assigned students (via courses)
 * - Student/Parent: Access own records only
 *
 * API KEY PROTECTION:
 * - Gemini API key stored server-side only
 * - Never exposed to client
 * - Used only in Cloud Functions
 * - Billed to Firebase project
 *
 * ════════════════════════════════════════════════════════════════════════════
 * AI INTEGRATION
 * ════════════════════════════════════════════════════════════════════════════
 *
 * AI PROVIDER: Google Gemini AI
 * MODEL: gemini-1.5-flash (configurable in ai-config.ts)
 *
 * AI FEATURES:
 *
 * 1. Performance Summary:
 *    - Input: Student grades + attendance
 *    - Processing: Gemini analyzes patterns and trends
 *    - Output: Personalized feedback with strengths/weaknesses
 *    - Format: HTML with sections and bullet points
 *
 * 2. Study Tips:
 *    - Input: Performance by category
 *    - Processing: Gemini suggests targeted improvements
 *    - Output: Actionable study recommendations
 *    - Format: HTML with specific strategies
 *
 * 3. Conversational Agent:
 *    - Input: Natural language question + context
 *    - Processing: Gemini analyzes all student data
 *    - Output: Conversational response
 *    - Format: HTML with data-driven insights
 *
 * AI CALL FLOW:
 * 1. Client calls Cloud Function
 * 2. Function authenticates and authorizes user
 * 3. Function fetches student data from Firestore
 * 4. Function builds prompt with system instructions + user data
 * 5. Function calls Gemini API
 * 6. Gemini returns generated text
 * 7. Function returns to client
 * 8. Client displays in modal
 *
 * PROMPT ENGINEERING:
 * - System prompts define AI behavior (in ai-config.ts)
 * - User prompts contain structured data
 * - Templates ensure consistent formatting
 * - HTML output for rich display
 *
 * ════════════════════════════════════════════════════════════════════════════
 * DEPLOYMENT
 * ════════════════════════════════════════════════════════════════════════════
 *
 * DEPLOYMENT STEPS:
 *
 * 1. Set GEMINI_API_KEY in firebase-functions/.env (see firebase-functions/.env.example). Never commit .env.
 *
 * 2. Build TypeScript:
 *    cd functions && npm run build
 *
 * 3. Deploy Functions:
 *    firebase deploy --only functions
 *
 * 4. Verify Deployment:
 *    - Check Firebase Console → Functions
 *    - Check logs: firebase functions:log
 *    - Test from client app
 *
 * REGION:
 * - Functions deployed to us-central1 (configurable)
 * - Client must use same region in firebase.ts
 *
 * BILLING:
 * - Cloud Functions requires Blaze (pay-as-you-go) plan
 * - Free tier includes 2M invocations/month
 * - Gemini API has separate billing
 *
 * ════════════════════════════════════════════════════════════════════════════
 * DEBUGGING
 * ════════════════════════════════════════════════════════════════════════════
 *
 * VIEW LOGS:
 * - Real-time: firebase functions:log
 * - Console: Firebase Console → Functions → Logs tab
 * - Filter by function name
 * - Look for Cloud Functions log output (errors and warnings)
 *
 * COMMON ISSUES:
 *
 * 1. "GEMINI_API_KEY not set"
 *    FIX: Set GEMINI_API_KEY in firebase-functions/.env (or Firebase config), then redeploy
 *
 * 2. "Permission denied"
 *    CHECK:
 *    - User is authenticated
 *    - User role in /users/{uid}
 *    - Firestore security rules
 *    - Function logs for detailed error
 *
 * 3. "Function not found"
 *    CHECK:
 *    - Functions are deployed
 *    - Region matches (us-central1)
 *    - Function name is correct
 *    - No deployment errors
 *
 * 4. "Timeout"
 *    CHECK:
 *    - Function timeout settings (default 60s, can increase)
 *    - Gemini API response time
 *    - Network connectivity
 *    - Large data queries (optimize with limit())
 *
 * 5. "AI returns error"
 *    CHECK:
 *    - Gemini API key is valid
 *    - API quota not exceeded
 *    - Prompt is well-formed
 *    - Data is properly formatted
 *    - Function logs for API error details
 *
 * TESTING:
 *
 * LOCAL TESTING:
 * 1. Set GEMINI_API_KEY in firebase-functions/.env
 * 2. Deploy: firebase deploy --only functions
 * 3. Run client (npm run dev) and trigger AI features
 * 4. Check Firebase Console > Functions > Logs
 *
 * PRODUCTION TESTING:
 * 1. Deploy functions
 * 2. Use client app to call functions
 * 3. Check Firebase Console logs
 * 4. Monitor for errors
 *
 * ════════════════════════════════════════════════════════════════════════════
 * PERFORMANCE OPTIMIZATION
 * ════════════════════════════════════════════════════════════════════════════
 *
 * OPTIMIZATIONS:
 * - Firestore queries limited (limit(20), limit(30))
 * - Real-time listeners avoided (use getDocs)
 * - Concurrent operations where possible
 * - Efficient data structures
 * - Timeout set appropriately (540s for aiAgentChat)
 * - Memory allocation (512MiB for data-heavy operations)
 *
 * COLD STARTS:
 * - First invocation may be slow (10-30 seconds)
 * - Subsequent calls are fast (< 1 second)
 * - maxInstances setting helps with concurrent requests
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIGRATION NOTES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MOVING TO DEDICATED API SERVICE:
 *
 * When migrating to dedicated API service:
 * 1. Keep Cloud Functions as API gateway (or replace with REST API)
 * 2. Move AI logic to dedicated service
 * 3. Update endpoints in client code
 * 4. Maintain authentication/authorization
 * 5. Update CORS configuration
 * 6. Test thoroughly before switching
 *
 * BENEFITS OF DEDICATED SERVICE:
 * - More control over infrastructure
 * - Better scaling options
 * - Potentially lower costs
 * - Easier monitoring/debugging
 * - Independent deployment
 *
 * CURRENT ARCHITECTURE (Cloud Functions):
 * - Simple to deploy and maintain
 * - Integrated with Firebase
 * - Automatic scaling
 * - Built-in authentication
 * - Good for MVP and small-medium scale
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ==================== ENVIRONMENT SETUP ====================

/**
 * Environment Variable Loading
 *
 * DEVELOPMENT:
 * - Loads .env file when not in production (e.g. local testing with Gemini API)
 *
 * PRODUCTION (Firebase deploy):
 * - Set GEMINI_API_KEY via Firebase config or Secret Manager (never in code)
 *
 * GRACEFUL FAILURE:
 * - If dotenv not installed, continues without error
 */
if (process.env.NODE_ENV !== 'production') {
  try {
    // Only load dotenv in local development
    require('dotenv').config();
  } catch {
    // dotenv not installed or .env file doesn't exist - that's okay
    // Environment variables will be read from Firebase config in production
  }
}

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten, onDocumentCreated } from 'firebase-functions/v2/firestore';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Import AI configuration and prompts
import {
  AI_MODEL_CONFIG,
  getApiKey,
  getSafetySettings,
  PERFORMANCE_SUMMARY_SYSTEM_PROMPT,
  STUDY_TIPS_SYSTEM_PROMPT,
  ORTHODOX_BIBLE_SYSTEM_PROMPT,
  EARLY_WARNING_SYSTEM_PROMPT,
  PROGRESS_REPORT_SYSTEM_PROMPT,
  QUIZ_GENERATOR_SYSTEM_PROMPT,
  LESSON_PLAN_SYSTEM_PROMPT,
  PARENT_EMAIL_SYSTEM_PROMPT,
  CURRICULUM_GAP_SYSTEM_PROMPT,
  VOICE_COMMAND_SYSTEM_PROMPT,
  EXAM_SCANNER_SYSTEM_PROMPT,
  buildPerformanceSummaryPrompt,
  buildStudyTipsPrompt,
  buildOrthodoxBibleUserPrompt,
  buildEarlyWarningPrompt,
  buildProgressReportPrompt,
  buildQuizGeneratorPrompt,
  buildLessonPlanPrompt,
  buildParentEmailPrompt,
  buildCurriculumGapPrompt,
  buildVoiceCommandPrompt,
  prepareGradesData,
  prepareAttendanceData,
  calculateCategoryAverages,
} from './ai-config';
import { normalizeLegalUserAgent } from './forensic-legal';
import { isUserRole, isPrivilegedAiRole } from './domain-types';
import {
  rosterEntryFromStudentDoc,
  sanitizeGradeDocForAi,
  sanitizeAttendanceDocForAi,
  type AiStudentRosterEntry,
} from './ai-data-minimize';

// Initialize Firebase Admin SDK
initializeApp();
const db = getFirestore();

// Initialize Gemini AI; key is read from GEMINI_API_KEY (set in firebase-functions/.env or Firebase config)
const apiKey = getApiKey();
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;
const isDev = process.env.NODE_ENV !== 'production';

function aiNotConfiguredMessage(): string {
  return [
    'AI service is not configured.',
    '',
    'Admin setup:',
    '- Set GEMINI_API_KEY in Firebase Functions (Secret Manager / env) or in firebase-functions/.env for local emulator.',
    '- Redeploy functions.',
    '',
    'Docs:',
    '- See DEPLOYMENT.md and firebase-functions/.env.example in this repo.',
  ].join('\n');
}

function aiNotConfiguredHtml(): string {
  const msg = aiNotConfiguredMessage();
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `
    <div class="ai-card">
      <h3 class="ai-title">AI not configured</h3>
      <div class="ai-body">
        <p>${esc(msg).replace(/\n/g, '<br>')}</p>
      </div>
    </div>
  `.trim();
}

// ==================== HELPER FUNCTIONS ====================

/** Wrap a promise with a timeout. Rejects with a clear message if it takes too long. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Check if the authenticated user has permission to access student data (FERPA-aligned access control).
 */
async function checkStudentAccess(
  uid: string,
  studentId: string
): Promise<{ hasAccess: boolean; role: string; studentData: any }> {
  // Get user role
  const userDoc = await db.doc(`users/${uid}`).get();
  if (!userDoc.exists) {
    throw new HttpsError('not-found', 'User profile not found');
  }

  const userData = userDoc.data();
  const userRole = userData?.role;

  // Get student data
  const studentDoc = await db.doc(`students/${studentId}`).get();
  if (!studentDoc.exists) {
    throw new HttpsError('not-found', 'Student not found');
  }

  const studentData = studentDoc.data();

  // Admin has access to all students
  if (userRole === 'admin') {
    return { hasAccess: true, role: userRole, studentData };
  }

  // Teacher has access to their assigned students
  if (userRole === 'teacher') {
    // Check if teacher has any course with this student
    const coursesSnapshot = await db
      .collection('courses')
      .where('teacherId', '==', uid)
      .where('studentIds', 'array-contains', studentId)
      .get();

    if (!coursesSnapshot.empty) {
      return { hasAccess: true, role: userRole, studentData };
    }
  }

  // Student/Parent has access to their own data
  const isOwner = uid === studentData?.parentUid || uid === studentData?.studentUid;

  if (isOwner) {
    return { hasAccess: true, role: userRole, studentData };
  }

  return { hasAccess: false, role: userRole, studentData };
}

// ==================== AI FUNCTIONS ====================

/**
 * Generate AI-powered performance summary
 *
 * PURPOSE: Analyzes student grades and attendance to provide personalized insights
 *
 * FLOW:
 * 1. Authenticate user
 * 2. Verify user has access to student data
 * 3. Fetch grades and attendance from Firestore
 * 4. Prepare data for AI analysis
 * 5. Call AI API with configured prompts
 * 6. Return formatted HTML response
 *
 * MIGRATION PATH:
 * - System prompts: Already in ai-config.ts (can be moved to database/env vars)
 * - API calls: Already server-side (can be moved to dedicated API service)
 * - Data preparation: Already server-side (can be optimized)
 *
 * DEBUG:
 * - Check Cloud Functions logs for API errors
 * - Verify GEMINI_API_KEY is set
 * - Check student data is being fetched correctly
 * - Review prompt formatting in logs
 *
 * ERROR HANDLING:
 * - Returns user-friendly error messages
 * - Logs detailed errors for debugging
 * - Handles missing data gracefully
 */
export const getPerformanceSummary = onCall(
  { timeoutSeconds: 300, memory: '512MiB' },
  async (request) => {
    // STEP 1: Verify user is authenticated
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be logged in');
    }

    const { studentId } = request.data;

    // STEP 2: Validate input
    if (!studentId) {
      throw new HttpsError('invalid-argument', 'studentId is required');
    }

    // STEP 3: Verify user has permission to access this student
    const { hasAccess, studentData } = await checkStudentAccess(request.auth.uid, studentId);

    if (!hasAccess) {
      throw new HttpsError('permission-denied', 'You do not have access to this student');
    }

    // STEP 4: Fetch student's grades
    const gradesSnapshot = await db
      .collection(`students/${studentId}/grades`)
      .orderBy('date', 'desc')
      .limit(20)
      .get();

    const grades = gradesSnapshot.docs.map((doc) => doc.data());

    if (grades.length === 0) {
      throw new HttpsError('failed-precondition', 'No grades available for this student');
    }

    // STEP 5: Fetch student's attendance (optional but recommended)
    const attendanceSnapshot = await db
      .collection(`students/${studentId}/attendance`)
      .orderBy('date', 'desc')
      .limit(30)
      .get();

    const attendance = attendanceSnapshot.docs.map((doc) => doc.data());

    // STEP 6: Prepare data for AI analysis
    const gradesData = prepareGradesData(grades);
    const attendanceData = prepareAttendanceData(attendance);

    // STEP 7: Check if AI is configured
    if (!genAI) {
      throw new HttpsError('failed-precondition', aiNotConfiguredMessage());
    }

    // STEP 8: Call AI API
    try {
      // Get AI model with configuration
      const model = genAI.getGenerativeModel({
        model: AI_MODEL_CONFIG.model,
      });

      // Build prompts using templates from ai-config.ts
      const systemPrompt = PERFORMANCE_SUMMARY_SYSTEM_PROMPT;
      const userPrompt = buildPerformanceSummaryPrompt(
        studentData?.name ?? 'Student',
        gradesData,
        attendanceData
      );

      // Generate content using Gemini API (with 90s timeout)
      const result = await withTimeout(
        model.generateContent({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
            },
          ],
        }),
        90_000,
        'Gemini API (Performance Summary)'
      );

      const response = result.response;
      const text = response.text();
      if (typeof text !== 'string' || !text.trim()) {
        throw new Error('AI returned an empty response. Please try again.');
      }

      // STEP 9: Return the model summary payload
      return {
        summaryHtml: text,
        studentName: studentData?.name ?? 'Student',
        generatedAt: new Date().toISOString(),
        metadata: {
          gradesAnalyzed: grades.length,
          attendanceRecordsAnalyzed: attendance.length,
          model: AI_MODEL_CONFIG.model,
        },
      };
    } catch (error: any) {
      // Provide user-friendly error message
      const errorMessage = error.message || 'Unknown error occurred';
      throw new HttpsError(
        'internal',
        `Failed to generate AI summary: ${errorMessage}. Please try again later.`
      );
    }
  }
); // end getPerformanceSummary

/**
 * Generate AI-powered study tips
 *
 * PURPOSE: Provides personalized study recommendations based on student performance
 *
 * FLOW:
 * 1. Authenticate user
 * 2. Verify user has access to student data
 * 3. Fetch grades from Firestore
 * 4. Analyze performance by category
 * 5. Prepare data for AI analysis
 * 6. Call AI API with configured prompts
 * 7. Return formatted HTML response
 *
 * MIGRATION PATH:
 * - System prompts: Already in ai-config.ts (can be moved to database/env vars)
 * - API calls: Already server-side (can be moved to dedicated API service)
 * - Category analysis: Already server-side (can be optimized)
 *
 * DEBUG:
 * - Check Cloud Functions logs for API errors
 * - Verify GEMINI_API_KEY is set
 * - Check category averages calculation
 * - Review prompt formatting in logs
 *
 * ERROR HANDLING:
 * - Returns user-friendly error messages
 * - Logs detailed errors for debugging
 * - Handles missing data gracefully
 */
export const getStudyTips = onCall({ timeoutSeconds: 300, memory: '512MiB' }, async (request) => {
  // STEP 1: Verify user is authenticated
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }

  const { studentId } = request.data;

  // STEP 2: Validate input
  if (!studentId) {
    throw new HttpsError('invalid-argument', 'studentId is required');
  }

  // STEP 3: Verify user has permission to access this student
  const { hasAccess, studentData } = await checkStudentAccess(request.auth.uid, studentId);

  if (!hasAccess) {
    throw new HttpsError('permission-denied', 'You do not have access to this student');
  }

  // STEP 4: Fetch student's grades
  const gradesSnapshot = await db
    .collection(`students/${studentId}/grades`)
    .orderBy('date', 'desc')
    .limit(15)
    .get();

  const grades = gradesSnapshot.docs.map((doc) => doc.data());

  if (grades.length === 0) {
    throw new HttpsError('failed-precondition', 'No grades available for this student');
  }

  // STEP 5: Analyze grades to identify weak areas
  const categoryAverages = calculateCategoryAverages(grades);

  // Prepare recent assignments summary (guard division by zero and missing fields)
  const recentAssignments = grades.slice(0, 5).map((g) => {
    const total = Number(g.totalPoints);
    const pct = total > 0 ? ((Number(g.score) / total) * 100).toFixed(1) : '0';
    return `- ${g.assignmentName ?? 'Assignment'} (${g.category ?? 'General'}): ${pct}%`;
  });

  // STEP 6: Check if AI is configured
  if (!genAI) {
    throw new HttpsError('failed-precondition', aiNotConfiguredMessage());
  }

  // STEP 7: Call AI API
  try {
    // Get AI model with configuration
    const model = genAI.getGenerativeModel({
      model: AI_MODEL_CONFIG.model,
    });

    // Build prompts using templates from ai-config.ts
    const systemPrompt = STUDY_TIPS_SYSTEM_PROMPT;
    const userPrompt = buildStudyTipsPrompt(
      studentData?.name ?? 'Student',
      categoryAverages,
      recentAssignments
    );

    // Generate content using Gemini API (with 90s timeout)
    const result = await withTimeout(
      model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
          },
        ],
      }),
      90_000,
      'Gemini API (Study Tips)'
    );

    const response = result.response;
    const text = response.text();
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('AI returned an empty response. Please try again.');
    }

    // STEP 8: Return the study tips payload
    return {
      tipsHtml: text,
      studentName: studentData?.name ?? 'Student',
      generatedAt: new Date().toISOString(),
      metadata: {
        gradesAnalyzed: grades.length,
        categoriesAnalyzed: categoryAverages.length,
        model: AI_MODEL_CONFIG.model,
      },
    };
  } catch (error: any) {
    // Provide user-friendly error message
    const errorMessage = error.message || 'Unknown error occurred';
    throw new HttpsError(
      'internal',
      `Failed to generate study tips: ${errorMessage}. Please try again later.`
    );
  }
});

// ==================== AI AGENT (CONVERSATIONAL) ====================

/**
 * AI Agent - Conversational Assistant for Admins
 *
 * PURPOSE: Provides a conversational AI interface that can answer questions about students,
 * grades, attendance, and other LMS data using natural language
 *
 * FLOW:
 * 1. Authenticate user and verify admin role
 * 2. Load all student data, grades, and attendance
 * 3. Build context from the data
 * 4. Maintain conversation history
 * 5. Call Gemini API with context and conversation
 * 6. Return AI response
 *
 * FEATURES:
 * - Conversational (maintains context across messages)
 * - Uses minimized student/grade/attendance payloads for the model (no photos or unnecessary PII)
 * - Can answer questions about grades, attendance, performance
 * - Provides insights and analysis
 *
 * MIGRATION PATH:
 * - Can be moved to dedicated API service
 * - Conversation history can be stored in database
 *
 * NOTE: Firebase Functions v2 onCall automatically handles CORS - no explicit CORS config needed
 */
export const aiAgentChat = onCall(
  {
    // Increase timeout for data loading (max 540 seconds for 2nd gen functions)
    timeoutSeconds: 540,
    // Memory allocation for handling large datasets
    memory: '512MiB',
    // Maximum number of instances (helps with cold starts)
    maxInstances: 10,
  },
  async (request) => {
    // STEP 1: Verify user is authenticated and is admin
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be logged in');
    }

    // Verify admin or teacher role
    const userDoc = await db.doc(`users/${request.auth.uid}`).get();
    const role = userDoc.data()?.role;
    if (!userDoc.exists || !isPrivilegedAiRole(role)) {
      throw new HttpsError(
        'permission-denied',
        'Only administrators and teachers can use the AI Agent'
      );
    }

    const { message, conversationHistory = [] } = request.data;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      throw new HttpsError('invalid-argument', 'Message is required');
    }

    // Validate conversationHistory is an array of { user, assistant }
    const safeHistory = Array.isArray(conversationHistory)
      ? conversationHistory
          .filter((h: any) => h && typeof h.user === 'string' && typeof h.assistant === 'string')
          .slice(-10)
          .map((h: any) => ({ user: String(h.user), assistant: String(h.assistant) }))
      : [];

    let students: AiStudentRosterEntry[] = [];
    if (role === 'admin') {
      const studentsSnapshot = await db.collection('students').get();
      students = studentsSnapshot.docs.map((doc) => rosterEntryFromStudentDoc(doc.id, doc.data()));
    } else if (role === 'teacher') {
      const coursesSnap = await db
        .collection('courses')
        .where('teacherId', '==', request.auth.uid)
        .get();
      const allowedIds = new Set<string>();
      coursesSnap.forEach((c) => {
        const ids = c.data().studentIds as string[] | undefined;
        if (Array.isArray(ids)) ids.forEach((id) => allowedIds.add(id));
      });
      const idList = Array.from(allowedIds);
      for (let i = 0; i < idList.length; i += 30) {
        const chunk = idList.slice(i, i + 30);
        if (chunk.length === 0) continue;
        const snaps = await db
          .collection('students')
          .where(FieldPath.documentId(), 'in', chunk)
          .get();
        snaps.forEach((doc) => students.push(rosterEntryFromStudentDoc(doc.id, doc.data())));
      }
    }

    // STEP 3: Load grades and attendance for all students
    const allGrades: ReturnType<typeof sanitizeGradeDocForAi>[] = [];
    const allAttendance: ReturnType<typeof sanitizeAttendanceDocForAi>[] = [];

    for (const student of students.slice(0, 50)) {
      // Limit to 50 students for performance
      try {
        // Load grades
        const gradesSnapshot = await db
          .collection(`students/${student.id}/grades`)
          .orderBy('date', 'desc')
          .limit(10)
          .get();

        gradesSnapshot.docs.forEach((doc) => {
          allGrades.push(sanitizeGradeDocForAi(student.id, student.name, doc.data()));
        });

        // Load attendance
        const attendanceSnapshot = await db
          .collection(`students/${student.id}/attendance`)
          .orderBy('date', 'desc')
          .limit(20)
          .get();

        attendanceSnapshot.docs.forEach((doc) => {
          allAttendance.push(sanitizeAttendanceDocForAi(student.id, student.name, doc.data()));
        });
      } catch {
        // Ignore a single student's data load failure; continue with the rest.
      }
    }

    // STEP 4: Build context summary
    const contextSummary = {
      totalStudents: students.length,
      studentsSummary: students.slice(0, 20).map((s) => ({
        name: s.name,
        memberId: s.memberId,
        yearOfBirth: s.yearOfBirth,
      })),
      totalGrades: allGrades.length,
      totalAttendance: allAttendance.length,
      recentGrades: allGrades.slice(0, 30).map((g) => {
        const total = Number(g.totalPoints);
        const pct = total > 0 ? ((Number(g.score) / total) * 100).toFixed(1) + '%' : '0%';
        return {
          studentName: g.studentName,
          assignment: g.assignmentName,
          category: g.category,
          score: g.score,
          totalPoints: g.totalPoints,
          percentage: pct,
          date: g.date,
        };
      }),
      attendanceStats: allAttendance.reduce(
        (acc, a) => {
          if (!acc[a.studentName]) {
            acc[a.studentName] = { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
          }
          const row = acc[a.studentName];
          const st = typeof a.status === 'string' ? a.status : '';
          if (st === 'present' || st === 'absent' || st === 'late' || st === 'excused') {
            row[st] = (row[st] || 0) + 1;
          }
          row.total += 1;
          return acc;
        },
        {} as Record<
          string,
          { present: number; absent: number; late: number; excused: number; total: number }
        >
      ),
    };

    // STEP 5: Check if AI is configured
    if (!genAI) {
      if (isDev) {
        return { response: aiNotConfiguredHtml(), metadata: { devFallback: true } };
      }
      throw new HttpsError('failed-precondition', aiNotConfiguredMessage());
    }

    // STEP 6: Build conversation with context
    try {
      const model = genAI.getGenerativeModel({
        model: AI_MODEL_CONFIG.model,
      });

      // System prompt for the AI agent — polished, concise, HTML-only output
      const systemPrompt = `You are NG5 AI (ORIA 2.3 nano), a premium educational data assistant built by NIDSARK LAB.

═══════════════════════════════════════
ABSOLUTE RULES (never break these)
═══════════════════════════════════════
1. Output ONLY semantic HTML — NEVER Markdown (no **, __, \`, #, or - bullet syntax).
2. Keep answers SHORT: aim for 80-120 words max.
3. Answer exactly what was asked — skip greetings, intros, and capability lists.
4. Every fact must come from the DATA below; if missing, say "Data not available."

═══════════════════════════════════════
REQUIRED HTML STRUCTURE
═══════════════════════════════════════
Always wrap your entire reply in:

<div class="ai-card">
  <h3 class="ai-title">Concise Title</h3>
  <div class="ai-body">
    ...content here...
  </div>
</div>

Inside ai-body use:
• <p> for sentences (keep each ≤2 lines).
• <strong> to highlight key numbers or names.
• <ul class="ai-list"><li>…</li></ul> for bullet points.
• <table class="ai-table"><thead>…</thead><tbody>…</tbody></table> for comparisons.

Do NOT nest multiple <div class="ai-card"> blocks; one card per response.

═══════════════════════════════════════
TONE & STYLE
═══════════════════════════════════════
• Direct, confident, professional.
• No hedging phrases ("I think", "maybe").
• Use active voice.
• Close every HTML tag.

═══════════════════════════════════════
DATA GROUNDING
═══════════════════════════════════════
• Cite student names and exact numbers from context.
• If a student or record isn't found: "No record found for [name]."
• Never invent or guess data.`;

      // Build user prompt with context
      const userPrompt = `=== AVAILABLE DATA FROM FIREBASE ===

📊 DATABASE SUMMARY:
- Total Registered Students: ${contextSummary.totalStudents}
- Total Grade Records: ${contextSummary.totalGrades}
- Total Attendance Records: ${contextSummary.totalAttendance}

👥 STUDENT ROSTER (${contextSummary.studentsSummary.length} students):
${contextSummary.studentsSummary
  .map(
    (s: { name: string; memberId: string; yearOfBirth: number | null }, i: number) =>
      `${i + 1}. ${s.name} | Member ID: ${s.memberId} | Birth year: ${s.yearOfBirth ?? 'N/A'}`
  )
  .join('\n')}

📝 RECENT GRADE RECORDS (Last ${contextSummary.recentGrades.length} entries):
${contextSummary.recentGrades
  .map(
    (g: any) =>
      `• ${g.studentName}: ${g.assignment} (${g.category}) - ${g.score}/${g.totalPoints} = ${g.percentage}`
  )
  .join('\n')}

📅 ATTENDANCE BY STUDENT:
${
  Object.entries(contextSummary.attendanceStats)
    .map(([name, stats]: [string, any]) => {
      const rate =
        stats.total > 0
          ? (((stats.present + stats.late + stats.excused) / stats.total) * 100).toFixed(1)
          : '0';
      return `• ${name}: ${rate}% attendance (Present: ${stats.present}, Absent: ${stats.absent}, Late: ${stats.late}, Excused: ${stats.excused})`;
    })
    .join('\n') || 'No attendance records available'
}

=== CONVERSATION CONTEXT ===
${
  safeHistory.length > 0
    ? safeHistory
        .map((h: any, i: number) => `[Turn ${i + 1}]\nUser: ${h.user}\nAssistant: ${h.assistant}`)
        .join('\n---\n')
    : '(New conversation - no previous context)'
}

=== CURRENT REQUEST ===
User's Question: "${message}"

Instructions: Answer this question using ONLY the data provided above. If the user asks about a specific student, search for their name in the Student Roster and Grade/Attendance records. If the requested information isn't available in the data, clearly state what's missing.`;

      // Generate response
      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
          },
        ],
      });

      const response = result.response;
      const text = response.text();
      if (typeof text !== 'string' || !text.trim()) {
        throw new Error('AI returned an empty response. Please try again.');
      }

      // STEP 7: Return response
      return {
        response: text,
        timestamp: new Date().toISOString(),
        metadata: {
          studentsAnalyzed: students.length,
          gradesAnalyzed: allGrades.length,
          attendanceAnalyzed: allAttendance.length,
        },
      };
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error occurred';
      throw new HttpsError(
        'internal',
        `Failed to get AI response: ${errorMessage}. Please try again later.`
      );
    }
  }
);

// ==================== EXPANDED AI TOOL SUITE ====================
//
// The callables below power the broader AI product surface:
//   aiBibleChat, aiProgressReport, aiQuizGenerator,
//   aiLessonPlanGenerator, aiParentEmail, aiCurriculumGap,
//   aiEarlyWarning, aiVoiceCommand, parseExamPaper.
//
// Conventions:
// - All callables require request.auth.
// - "Teacher/Admin" tools validate role via isPrivilegedAiRole().
// - "Student" tools either validate role === 'student' or use
//   checkStudentAccess() for per-student FERPA enforcement.
// - Safety settings are chosen from role via getSafetySettings().
// - Every Gemini call is wrapped with withTimeout().
// - Errors are normalized to HttpsError so clients get a consistent shape.

function getUserRoleStrict(role: unknown): string {
  return typeof role === 'string' ? role : 'unknown';
}

async function requireAuthenticatedPrivileged(
  request: any
): Promise<{ uid: string; role: string }> {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  const uid = request.auth.uid as string;
  const userDoc = await db.doc(`users/${uid}`).get();
  const role = getUserRoleStrict(userDoc.data()?.role);
  if (!userDoc.exists || !isPrivilegedAiRole(role)) {
    throw new HttpsError(
      'permission-denied',
      'Only administrators and teachers can use this AI tool'
    );
  }
  return { uid, role };
}

async function requireAuthenticated(request: any): Promise<{ uid: string; role: string }> {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  const uid = request.auth.uid as string;
  const userDoc = await db.doc(`users/${uid}`).get();
  const role = getUserRoleStrict(userDoc.data()?.role);
  return { uid, role };
}

function stripJsonFences(text: string): string {
  return String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

function parseJsonOrThrow<T = unknown>(text: string, label: string): T {
  const cleaned = stripJsonFences(text);
  try {
    return JSON.parse(cleaned) as T;
  } catch (err: any) {
    throw new HttpsError(
      'internal',
      `${label} did not return valid JSON: ${err?.message ?? 'parse error'}`
    );
  }
}

async function runGemini(params: {
  systemPrompt: string;
  userPrompt: string;
  role: string;
  modelName?: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  label: string;
}): Promise<string> {
  if (!genAI) {
    throw new HttpsError('failed-precondition', aiNotConfiguredMessage());
  }
  const model = genAI.getGenerativeModel({
    model: params.modelName ?? AI_MODEL_CONFIG.model,
    safetySettings: getSafetySettings(params.role) as any,
    generationConfig: {
      temperature: params.temperature ?? AI_MODEL_CONFIG.temperature,
      maxOutputTokens: params.maxOutputTokens ?? AI_MODEL_CONFIG.maxTokens,
      topP: AI_MODEL_CONFIG.topP,
      topK: AI_MODEL_CONFIG.topK,
    },
  });
  const result = await withTimeout(
    model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${params.systemPrompt}\n\n${params.userPrompt}` }],
        },
      ],
    }),
    params.timeoutMs ?? 90_000,
    `Gemini API (${params.label})`
  );
  const text = result.response.text();
  if (typeof text !== 'string' || !text.trim()) {
    throw new HttpsError('internal', `${params.label} returned an empty response`);
  }
  return text;
}

/**
 * Orthodox Bible Companion chat (student-safe).
 * Input: { message, conversationHistory?: Array<{role, parts: [{text}]}> }
 * Output: { reply, generatedAt }
 */
export const aiBibleChat = onCall({ timeoutSeconds: 120, memory: '512MiB' }, async (request) => {
  const { uid, role } = await requireAuthenticated(request);
  void uid;
  const { message, conversationHistory = [] } = request.data || {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    throw new HttpsError('invalid-argument', 'message is required');
  }
  const userPrompt = buildOrthodoxBibleUserPrompt(message, conversationHistory);
  const text = await runGemini({
    systemPrompt: ORTHODOX_BIBLE_SYSTEM_PROMPT,
    userPrompt,
    role,
    modelName: AI_MODEL_CONFIG.chatModel,
    temperature: 0.85,
    label: 'Bible Chat',
  });
  return {
    reply: text,
    generatedAt: new Date().toISOString(),
  };
});

/**
 * Parent-facing progress report (HTML). Teacher/Admin only.
 */
export const aiProgressReport = onCall(
  { timeoutSeconds: 180, memory: '512MiB' },
  async (request) => {
    const { role } = await requireAuthenticatedPrivileged(request);
    const { studentId, reportPeriod } = request.data || {};
    if (!studentId || typeof studentId !== 'string') {
      throw new HttpsError('invalid-argument', 'studentId is required');
    }
    const { hasAccess, studentData } = await checkStudentAccess(request.auth!.uid, studentId);
    if (!hasAccess) {
      throw new HttpsError('permission-denied', 'You do not have access to this student');
    }

    const [gradesSnap, attendanceSnap] = await Promise.all([
      db.collection(`students/${studentId}/grades`).orderBy('date', 'desc').limit(30).get(),
      db.collection(`students/${studentId}/attendance`).orderBy('date', 'desc').limit(40).get(),
    ]);
    const gradesData = gradesSnap.docs.map((d) => d.data());
    const attendance = attendanceSnap.docs.map((d) => d.data());
    const attendanceData = prepareAttendanceData(attendance);

    const userPrompt = buildProgressReportPrompt({
      studentName: studentData?.name ?? 'Student',
      gradesData,
      attendanceData: {
        total: attendanceData.total,
        present: attendanceData.present,
        absent: attendanceData.absent,
        late: attendanceData.late,
      },
      reportPeriod,
    });
    const text = await runGemini({
      systemPrompt: PROGRESS_REPORT_SYSTEM_PROMPT,
      userPrompt,
      role,
      modelName: AI_MODEL_CONFIG.proModel,
      label: 'Progress Report',
    });
    return {
      reportHtml: text,
      studentName: studentData?.name ?? 'Student',
      generatedAt: new Date().toISOString(),
    };
  }
);

/**
 * AI Quiz Generator (Teacher/Admin). Returns quiz + answer key HTML.
 */
export const aiQuizGenerator = onCall(
  { timeoutSeconds: 180, memory: '512MiB' },
  async (request) => {
    const { role } = await requireAuthenticatedPrivileged(request);
    const {
      topic,
      gradeLevel = 'Grade 9',
      questionCount = 10,
      difficulty = 'medium',
      questionTypes = 'mixed',
    } = request.data || {};
    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      throw new HttpsError('invalid-argument', 'topic is required');
    }
    const userPrompt = buildQuizGeneratorPrompt({
      topic,
      gradeLevel,
      questionCount: Number(questionCount) || 10,
      difficulty,
      questionTypes,
    });
    const text = await runGemini({
      systemPrompt: QUIZ_GENERATOR_SYSTEM_PROMPT,
      userPrompt,
      role,
      label: 'Quiz Generator',
      maxOutputTokens: 3000,
    });
    const quiz = /<!--\s*QUIZ_START\s*-->([\s\S]*?)<!--\s*QUIZ_END\s*-->/i.exec(text);
    const answers = /<!--\s*ANSWERS_START\s*-->([\s\S]*?)<!--\s*ANSWERS_END\s*-->/i.exec(text);
    return {
      quizHtml: (quiz?.[1] ?? text).trim(),
      answerKeyHtml: (answers?.[1] ?? '').trim(),
      rawHtml: text,
      generatedAt: new Date().toISOString(),
    };
  }
);

/**
 * AI Lesson Plan Generator (Teacher/Admin).
 */
export const aiLessonPlanGenerator = onCall(
  { timeoutSeconds: 180, memory: '512MiB' },
  async (request) => {
    const { role } = await requireAuthenticatedPrivileged(request);
    const {
      topic,
      subject = 'General',
      gradeLevel = 'Grade 9',
      duration = '45 minutes',
      objectives,
    } = request.data || {};
    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      throw new HttpsError('invalid-argument', 'topic is required');
    }
    const userPrompt = buildLessonPlanPrompt({
      topic,
      subject,
      gradeLevel,
      duration,
      objectives,
    });
    const text = await runGemini({
      systemPrompt: LESSON_PLAN_SYSTEM_PROMPT,
      userPrompt,
      role,
      label: 'Lesson Plan Generator',
      maxOutputTokens: 3000,
    });
    return {
      lessonPlanHtml: text,
      generatedAt: new Date().toISOString(),
    };
  }
);

/**
 * AI Parent Email drafter (Teacher/Admin). Returns { subject, body }.
 */
export const aiParentEmail = onCall({ timeoutSeconds: 120, memory: '512MiB' }, async (request) => {
  const { role } = await requireAuthenticatedPrivileged(request);
  const { studentId, emailType = 'progress', parentName, context = '' } = request.data || {};
  if (!studentId || typeof studentId !== 'string') {
    throw new HttpsError('invalid-argument', 'studentId is required');
  }
  const validTypes = new Set(['progress', 'concern', 'achievement', 'attendance']);
  if (!validTypes.has(String(emailType))) {
    throw new HttpsError('invalid-argument', 'invalid emailType');
  }
  const { hasAccess, studentData } = await checkStudentAccess(request.auth!.uid, studentId);
  if (!hasAccess) {
    throw new HttpsError('permission-denied', 'You do not have access to this student');
  }

  const [gradesSnap, attendanceSnap] = await Promise.all([
    db.collection(`students/${studentId}/grades`).orderBy('date', 'desc').limit(15).get(),
    db.collection(`students/${studentId}/attendance`).orderBy('date', 'desc').limit(30).get(),
  ]);
  const grades = gradesSnap.docs.map((d) => d.data());
  const attendance = prepareAttendanceData(attendanceSnap.docs.map((d) => d.data()));

  const userPrompt = buildParentEmailPrompt({
    studentName: studentData?.name ?? 'Student',
    parentName,
    emailType: emailType as any,
    context,
    recentGrades: grades,
    attendanceData: attendance,
  });
  const text = await runGemini({
    systemPrompt: PARENT_EMAIL_SYSTEM_PROMPT,
    userPrompt,
    role,
    label: 'Parent Email',
    maxOutputTokens: 1500,
  });
  const parsed = parseJsonOrThrow<{ subject: string; body: string }>(text, 'Parent email');
  return {
    subject: String(parsed.subject ?? '').trim(),
    body: String(parsed.body ?? '').trim(),
    studentName: studentData?.name ?? 'Student',
    emailType,
    generatedAt: new Date().toISOString(),
  };
});

/**
 * AI Curriculum Gap analysis across a class roster (Teacher/Admin).
 */
export const aiCurriculumGap = onCall({ timeoutSeconds: 300, memory: '1GiB' }, async (request) => {
  const { uid, role } = await requireAuthenticatedPrivileged(request);
  const { className, timeRange, courseId } = request.data || {};

  let allowedStudentIds: string[];
  if (role === 'admin') {
    const snap = await db.collection('students').limit(200).get();
    allowedStudentIds = snap.docs.map((d) => d.id);
  } else {
    const coursesQuery = courseId
      ? db.collection('courses').where('teacherId', '==', uid)
      : db.collection('courses').where('teacherId', '==', uid);
    const courseSnap = await coursesQuery.get();
    const idSet = new Set<string>();
    courseSnap.forEach((c) => {
      if (courseId && c.id !== courseId) return;
      const ids = c.data().studentIds as string[] | undefined;
      if (Array.isArray(ids)) ids.forEach((id) => idSet.add(id));
    });
    allowedStudentIds = Array.from(idSet).slice(0, 200);
  }

  const rosterRows: Array<{ id: string; name: string; categories: any[] }> = [];
  for (const sid of allowedStudentIds.slice(0, 120)) {
    try {
      const [studentDoc, gradesSnap] = await Promise.all([
        db.doc(`students/${sid}`).get(),
        db.collection(`students/${sid}/grades`).orderBy('date', 'desc').limit(20).get(),
      ]);
      const name = studentDoc.data()?.name ?? 'Student';
      const categoryAverages = calculateCategoryAverages(gradesSnap.docs.map((d) => d.data()));
      rosterRows.push({ id: sid, name, categories: categoryAverages });
    } catch {
      // Skip problematic student silently to keep the class analysis resilient.
    }
  }

  const userPrompt = buildCurriculumGapPrompt({
    className,
    timeRange,
    students: rosterRows,
  });
  const text = await runGemini({
    systemPrompt: CURRICULUM_GAP_SYSTEM_PROMPT,
    userPrompt,
    role,
    modelName: AI_MODEL_CONFIG.proModel,
    label: 'Curriculum Gap',
    maxOutputTokens: 3000,
  });
  return {
    reportHtml: text,
    studentsAnalyzed: rosterRows.length,
    generatedAt: new Date().toISOString(),
  };
});

/**
 * AI Early Warning System (Teacher/Admin). Returns JSON list of at-risk students.
 */
export const aiEarlyWarning = onCall({ timeoutSeconds: 300, memory: '1GiB' }, async (request) => {
  const { uid, role } = await requireAuthenticatedPrivileged(request);

  let studentIds: string[];
  if (role === 'admin') {
    const snap = await db.collection('students').limit(200).get();
    studentIds = snap.docs.map((d) => d.id);
  } else {
    const coursesSnap = await db.collection('courses').where('teacherId', '==', uid).get();
    const set = new Set<string>();
    coursesSnap.forEach((c) => {
      const ids = c.data().studentIds as string[] | undefined;
      if (Array.isArray(ids)) ids.forEach((id) => set.add(id));
    });
    studentIds = Array.from(set).slice(0, 200);
  }

  const rosterRows: any[] = [];
  for (const sid of studentIds.slice(0, 150)) {
    try {
      const [studentDoc, gradesSnap, attendanceSnap] = await Promise.all([
        db.doc(`students/${sid}`).get(),
        db.collection(`students/${sid}/grades`).orderBy('date', 'desc').limit(15).get(),
        db.collection(`students/${sid}/attendance`).orderBy('date', 'desc').limit(30).get(),
      ]);
      const name = studentDoc.data()?.name ?? 'Student';
      const grades = gradesSnap.docs.map((d) => d.data());
      const categoryAverages = calculateCategoryAverages(grades);
      const attendance = prepareAttendanceData(attendanceSnap.docs.map((d) => d.data()));
      const gradePercents = grades
        .map((g: any) => {
          const total = Number(g?.totalPoints);
          if (!(total > 0)) return null;
          return (Number(g?.score) / total) * 100;
        })
        .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
      const gradeAverage = gradePercents.length
        ? gradePercents.reduce((a, b) => a + b, 0) / gradePercents.length
        : 0;
      rosterRows.push({
        studentId: sid,
        studentName: name,
        gradeAverage: Number(gradeAverage.toFixed(1)),
        attendanceRate: Number(parseFloat(attendance.attendanceRate).toFixed(1)),
        categories: categoryAverages.map((c) => ({
          category: c.category,
          average: c.average,
          trend: c.trend,
        })),
        recentGradesCount: grades.length,
      });
    } catch {
      // Skip failing students instead of failing the whole analysis.
    }
  }

  const userPrompt = buildEarlyWarningPrompt(rosterRows);
  const text = await runGemini({
    systemPrompt: EARLY_WARNING_SYSTEM_PROMPT,
    userPrompt,
    role,
    modelName: AI_MODEL_CONFIG.proModel,
    label: 'Early Warning',
    maxOutputTokens: 3000,
  });
  const alerts = parseJsonOrThrow<any[]>(text, 'Early Warning');
  return {
    alerts: Array.isArray(alerts) ? alerts : [],
    studentsAnalyzed: rosterRows.length,
    generatedAt: new Date().toISOString(),
  };
});

/**
 * AI Voice Command parser (Teacher/Admin). Returns structured action JSON.
 */
export const aiVoiceCommand = onCall({ timeoutSeconds: 60, memory: '256MiB' }, async (request) => {
  const { role } = await requireAuthenticatedPrivileged(request);
  const { transcript, contextHint } = request.data || {};
  if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
    throw new HttpsError('invalid-argument', 'transcript is required');
  }
  const userPrompt = buildVoiceCommandPrompt(transcript, contextHint);
  const text = await runGemini({
    systemPrompt: VOICE_COMMAND_SYSTEM_PROMPT,
    userPrompt,
    role,
    label: 'Voice Command',
    maxOutputTokens: 800,
    temperature: 0.2,
  });
  const parsed = parseJsonOrThrow<any>(text, 'Voice Command');
  return {
    action: typeof parsed?.action === 'string' ? parsed.action : 'unknown',
    parameters:
      parsed && typeof parsed.parameters === 'object' && parsed.parameters !== null
        ? parsed.parameters
        : {},
    confirmationMessage:
      typeof parsed?.confirmationMessage === 'string' ? parsed.confirmationMessage : '',
    requiresConfirmation: Boolean(parsed?.requiresConfirmation),
    generatedAt: new Date().toISOString(),
  };
});

/**
 * Exam Paper scanner (Teacher/Admin). Accepts image base64 + mime and returns
 * structured questions and detected student answers via Gemini Vision.
 */
export const parseExamPaper = onCall({ timeoutSeconds: 300, memory: '1GiB' }, async (request) => {
  const { role } = await requireAuthenticatedPrivileged(request);
  const { imageBase64, mimeType, hints } = request.data || {};
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    throw new HttpsError('invalid-argument', 'imageBase64 is required');
  }
  const mt = typeof mimeType === 'string' && mimeType ? mimeType : 'image/jpeg';
  if (!/^image\/(png|jpeg|jpg|webp)$/i.test(mt)) {
    throw new HttpsError('invalid-argument', 'Unsupported image mimeType');
  }
  // Enforce a reasonable upload cap (~6MB base64 ≈ ~4.5MB image).
  if (imageBase64.length > 6_500_000) {
    throw new HttpsError('invalid-argument', 'Image too large (max ~5MB)');
  }
  if (!genAI) {
    throw new HttpsError('failed-precondition', aiNotConfiguredMessage());
  }
  const model = genAI.getGenerativeModel({
    model: AI_MODEL_CONFIG.visionModel,
    safetySettings: getSafetySettings(role) as any,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 3000,
      responseMimeType: 'application/json',
    },
  });
  const prompt = `${EXAM_SCANNER_SYSTEM_PROMPT}\n\nAdditional hints from the teacher: ${
    typeof hints === 'string' ? hints : '(none)'
  }`;

  const result = await withTimeout(
    model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }, { inlineData: { data: imageBase64, mimeType: mt } }],
        },
      ],
    }),
    180_000,
    'Gemini API (Exam Scanner)'
  );
  const text = result.response.text();
  const parsed = parseJsonOrThrow<any>(text, 'Exam Scanner');
  return {
    ...parsed,
    generatedAt: new Date().toISOString(),
  };
});

// ==================== ADMIN FUNCTIONS ====================

/**
 * Promote a user to a specific role (Admin only)
 */
export const updateUserRole = onCall(async (request) => {
  // 1. Verify user is authenticated
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }

  // 2. Verify user is an admin
  const adminDoc = await db.doc(`users/${request.auth.uid}`).get();
  if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only administrators can change user roles');
  }

  const { targetUserId, newRole } = request.data;

  if (!targetUserId || !newRole) {
    throw new HttpsError('invalid-argument', 'targetUserId and newRole are required');
  }

  if (!isUserRole(newRole)) {
    throw new HttpsError('invalid-argument', 'newRole must be admin, teacher, or student');
  }

  // 3. Update the user's role
  await db.doc(`users/${targetUserId}`).update({
    role: newRole,
    roleUpdatedAt: new Date().toISOString(),
    roleUpdatedBy: request.auth.uid,
  });

  return {
    success: true,
    message: `User role updated to ${newRole}`,
    updatedUserId: targetUserId,
  };
});

/**
 * Get all users (Admin only)
 */
export const getAllUsers = onCall(async (request) => {
  // 1. Verify user is authenticated
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }

  // 2. Verify user is an admin
  const adminDoc = await db.doc(`users/${request.auth.uid}`).get();
  if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only administrators can view all users');
  }

  // 3. Get all users from Firestore
  const usersSnapshot = await db.collection('users').get();
  const users = usersSnapshot.docs.map((doc) => ({
    uid: doc.id,
    ...doc.data(),
  }));

  return { users };
});

// Note: User documents are now auto-created on the client side during signup
// This is allowed by Firestore security rules for new users with 'student' role

/**
 * Canonicalizes `legalAcceptance.userAgent` on create (control-char strip + max length) so stored data
 * matches `src/core/auth.ts` / signup writes. Does not touch `acceptedAt` (rules-bound to request.time).
 */
export const forensicNormalizeUserLegalAcceptance = onDocumentCreated(
  { document: 'users/{uid}', region: 'us-central1' },
  async (event) => {
    const snap = event.data;
    if (!snap?.exists) return;
    const data = snap.data() as Record<string, unknown>;
    const la = data?.legalAcceptance;
    if (!la || typeof la !== 'object') return;
    const laObj = la as Record<string, unknown>;
    const uaRaw = laObj.userAgent;
    const normalized = normalizeLegalUserAgent(uaRaw);
    if (typeof uaRaw === 'string' && uaRaw === normalized) return;

    await snap.ref.update({
      'legalAcceptance.userAgent': normalized,
    });
  }
);

/**
 * Writes students/{profileId}/grades/assessment_* when a submission is released or fully graded.
 * Replaces client-side grade sync (students cannot write grade docs; rules allow only staff + Admin SDK).
 */
export const syncAssessmentGradeFromSubmission = onDocumentWritten(
  {
    document: 'courses/{classId}/assessments/{assessmentId}/submissions/{studentProfileId}',
    region: 'us-central1',
  },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const d = after.data();
    if (!d || d.needsGrading === true) return;
    if (typeof d.finalScore !== 'number' || typeof d.totalPoints !== 'number') return;
    if (d.released !== true && d.status !== 'graded') return;

    const classId = event.params.classId as string;
    const assessmentId = event.params.assessmentId as string;
    const studentProfileId = event.params.studentProfileId as string;

    const assessmentSnap = await db.doc(`courses/${classId}/assessments/${assessmentId}`).get();
    if (!assessmentSnap.exists) return;
    const title = (assessmentSnap.data()?.title as string) || 'Assessment';
    const cleanTitle = title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40);
    const gradeId = `assessment_${cleanTitle}`;
    const gradedBy =
      typeof d.gradedBy === 'string' && d.gradedBy
        ? d.gradedBy
        : String(assessmentSnap.data()?.createdBy || '');

    await db.doc(`students/${studentProfileId}/grades/${gradeId}`).set(
      {
        studentId: studentProfileId,
        assignmentName: title,
        category: 'Exam',
        score: d.finalScore,
        totalPoints: d.totalPoints,
        date: new Date().toISOString(),
        teacherId: gradedBy,
        source: 'assessment',
      },
      { merge: true }
    );
  }
);
