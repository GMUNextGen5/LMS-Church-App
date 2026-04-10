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
 * - Load from functions/.env (copy from functions/.env.example)
 * - Set GEMINI_API_KEY in functions/.env
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
 * 1. Set GEMINI_API_KEY in functions/.env (see functions/.env.example). Never commit .env.
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
 *    FIX: Set GEMINI_API_KEY in functions/.env (or Firebase config), then redeploy
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
 * 1. Set GEMINI_API_KEY in functions/.env
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
  } catch (e) {
    // dotenv not installed or .env file doesn't exist - that's okay
    // Environment variables will be read from Firebase config in production
  }
}

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Import AI configuration and prompts
import {
  AI_MODEL_CONFIG,
  getApiKey,
  PERFORMANCE_SUMMARY_SYSTEM_PROMPT,
  STUDY_TIPS_SYSTEM_PROMPT,
  buildPerformanceSummaryPrompt,
  buildStudyTipsPrompt,
  prepareGradesData,
  prepareAttendanceData,
  calculateCategoryAverages
} from './ai-config';

// Initialize Firebase Admin SDK
initializeApp();
const db = getFirestore();

// Initialize Gemini AI; key is read from GEMINI_API_KEY (set in functions/.env or Firebase config)
const apiKey = getApiKey();
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;
const isDev = process.env.NODE_ENV !== 'production';

function aiNotConfiguredMessage(): string {
  return [
    'AI service is not configured.',
    '',
    'Admin setup:',
    '- Set GEMINI_API_KEY in Firebase Functions (Secret Manager / env) or in functions/.env for local emulator.',
    '- Redeploy functions.',
    '',
    'Docs:',
    '- See DEPLOYMENT.md and functions/.env.example in this repo.',
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
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

/**
 * Check if the authenticated user has permission to access student data
 * 
 * PURPOSE: Enforces FERPA-compliant access control
 * 
 * DEBUG: Logs access checks for troubleshooting permission issues
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
  const isOwner = 
    uid === studentData?.parentUid || 
    uid === studentData?.studentUid;
  
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
  const { hasAccess, studentData } = await checkStudentAccess(
    request.auth.uid,
    studentId
  );
  
  if (!hasAccess) {
    throw new HttpsError(
      'permission-denied',
      'You do not have access to this student'
    );
  }
  
  // STEP 4: Fetch student's grades
  const gradesSnapshot = await db
    .collection(`students/${studentId}/grades`)
    .orderBy('date', 'desc')
    .limit(20)
    .get();
  
  const grades = gradesSnapshot.docs.map(doc => doc.data());
  
  if (grades.length === 0) {
    throw new HttpsError(
      'failed-precondition',
      'No grades available for this student'
    );
  }
  
  // STEP 5: Fetch student's attendance (optional but recommended)
  const attendanceSnapshot = await db
    .collection(`students/${studentId}/attendance`)
    .orderBy('date', 'desc')
    .limit(30)
    .get();
  
  const attendance = attendanceSnapshot.docs.map(doc => doc.data());
  
  // STEP 6: Prepare data for AI analysis
  const gradesData = prepareGradesData(grades);
  const attendanceData = prepareAttendanceData(attendance);
  
  // STEP 7: Check if AI is configured
  if (!genAI) {
    throw new HttpsError(
      'failed-precondition',
      aiNotConfiguredMessage()
    );
  }
  
  // STEP 8: Call AI API
  try {
    // Get AI model with configuration
    const model = genAI.getGenerativeModel({ 
      model: AI_MODEL_CONFIG.model
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
        contents: [{ 
          role: 'user', 
          parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] 
        }]
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
        model: AI_MODEL_CONFIG.model
      }
    };
    
  } catch (error: any) {
    // Provide user-friendly error message
    const errorMessage = error.message || 'Unknown error occurred';
    throw new HttpsError(
      'internal',
      `Failed to generate AI summary: ${errorMessage}. Please try again later.`
    );
  }
});  // end getPerformanceSummary

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
export const getStudyTips = onCall(
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
  const { hasAccess, studentData } = await checkStudentAccess(
    request.auth.uid,
    studentId
  );
  
  if (!hasAccess) {
    throw new HttpsError(
      'permission-denied',
      'You do not have access to this student'
    );
  }
  
  // STEP 4: Fetch student's grades
  const gradesSnapshot = await db
    .collection(`students/${studentId}/grades`)
    .orderBy('date', 'desc')
    .limit(15)
    .get();
  
  const grades = gradesSnapshot.docs.map(doc => doc.data());
  
  if (grades.length === 0) {
    throw new HttpsError(
      'failed-precondition',
      'No grades available for this student'
    );
  }
  
  // STEP 5: Analyze grades to identify weak areas
  const categoryAverages = calculateCategoryAverages(grades);
  
  // Prepare recent assignments summary (guard division by zero and missing fields)
  const recentAssignments = grades.slice(0, 5).map(g => {
    const total = Number(g.totalPoints);
    const pct = total > 0 ? ((Number(g.score) / total) * 100).toFixed(1) : '0';
    return `- ${g.assignmentName ?? 'Assignment'} (${g.category ?? 'General'}): ${pct}%`;
  });
  
  // STEP 6: Check if AI is configured
  if (!genAI) {
    throw new HttpsError(
      'failed-precondition',
      aiNotConfiguredMessage()
    );
  }
  
  // STEP 7: Call AI API
  try {
    // Get AI model with configuration
    const model = genAI.getGenerativeModel({ 
      model: AI_MODEL_CONFIG.model
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
        contents: [{ 
          role: 'user', 
          parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] 
        }]
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
        model: AI_MODEL_CONFIG.model
      }
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
 * - Has access to all student data
 * - Can answer questions about grades, attendance, performance
 * - Provides insights and analysis
 * 
 * DEBUG:
 * - Check Cloud Functions logs for conversation flow
 * - Verify data is being loaded correctly
 * - Review prompt structure in logs
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
    maxInstances: 10
  },
  async (request) => {
  // STEP 1: Verify user is authenticated and is admin
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  // Verify admin or teacher role
  const userDoc = await db.doc(`users/${request.auth.uid}`).get();
  const role = userDoc.data()?.role;
  if (!userDoc.exists || (role !== 'admin' && role !== 'teacher')) {
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

  let students: Array<{ id: string; name?: string; memberId?: string; yearOfBirth?: number; contactEmail?: string; [key: string]: any }> = [];
  if (role === 'admin') {
    const studentsSnapshot = await db.collection('students').get();
    students = studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as typeof students;
  } else if (role === 'teacher') {
    const coursesSnap = await db.collection('courses').where('teacherId', '==', request.auth.uid).get();
    const allowedIds = new Set<string>();
    coursesSnap.forEach((c) => {
      const ids = c.data().studentIds as string[] | undefined;
      if (Array.isArray(ids)) ids.forEach((id) => allowedIds.add(id));
    });
    const idList = Array.from(allowedIds);
    for (let i = 0; i < idList.length; i += 30) {
      const chunk = idList.slice(i, i + 30);
      if (chunk.length === 0) continue;
      const snaps = await db.collection('students').where(FieldPath.documentId(), 'in', chunk).get();
      snaps.forEach((doc) => students.push({ id: doc.id, ...doc.data() } as (typeof students)[0]));
    }
  }
  
  // STEP 3: Load grades and attendance for all students
  const allGrades: any[] = [];
  const allAttendance: any[] = [];
  
  for (const student of students.slice(0, 50)) { // Limit to 50 students for performance
    try {
      // Load grades
      const gradesSnapshot = await db
        .collection(`students/${student.id}/grades`)
        .orderBy('date', 'desc')
        .limit(10)
        .get();
      
      gradesSnapshot.docs.forEach(doc => {
        allGrades.push({
          studentId: student.id,
          studentName: student.name || 'Unknown',
          ...doc.data()
        });
      });
      
      // Load attendance
      const attendanceSnapshot = await db
        .collection(`students/${student.id}/attendance`)
        .orderBy('date', 'desc')
        .limit(20)
        .get();
      
      attendanceSnapshot.docs.forEach(doc => {
        allAttendance.push({
          studentId: student.id,
          studentName: student.name || 'Unknown',
          ...doc.data()
        });
      });
    } catch (error) {
      // Ignore a single student's data load failure; continue with the rest.
    }
  }
  
  // STEP 4: Build context summary
  const contextSummary = {
    totalStudents: students.length,
    studentsSummary: students.slice(0, 20).map(s => ({
      name: s.name || 'Unknown',
      memberId: s.memberId || 'N/A',
      yearOfBirth: s.yearOfBirth || null,
      contactEmail: s.contactEmail || 'N/A'
    })),
    totalGrades: allGrades.length,
    totalAttendance: allAttendance.length,
    recentGrades: allGrades.slice(0, 30).map(g => {
      const total = Number(g.totalPoints);
      const pct = total > 0 ? ((Number(g.score) / total) * 100).toFixed(1) + '%' : '0%';
      return {
        studentName: g.studentName,
        assignment: g.assignmentName,
        category: g.category,
        score: g.score,
        totalPoints: g.totalPoints,
        percentage: pct,
        date: g.date
      };
    }),
    attendanceStats: allAttendance.reduce((acc, a) => {
      if (!acc[a.studentName]) {
        acc[a.studentName] = { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
      }
      acc[a.studentName][a.status] = (acc[a.studentName][a.status] || 0) + 1;
      acc[a.studentName].total += 1;
      return acc;
    }, {} as any)
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
      model: AI_MODEL_CONFIG.model
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
${contextSummary.studentsSummary.map((s: any, i: number) => 
  `${i + 1}. ${s.name} | ID: ${s.memberId} | Born: ${s.yearOfBirth || 'N/A'} | Email: ${s.contactEmail}`
).join('\n')}

📝 RECENT GRADE RECORDS (Last ${contextSummary.recentGrades.length} entries):
${contextSummary.recentGrades.map((g: any) => 
  `• ${g.studentName}: ${g.assignment} (${g.category}) - ${g.score}/${g.totalPoints} = ${g.percentage}`
).join('\n')}

📅 ATTENDANCE BY STUDENT:
${Object.entries(contextSummary.attendanceStats).map(([name, stats]: [string, any]) => {
  const rate = stats.total > 0 ? ((stats.present + stats.late + stats.excused) / stats.total * 100).toFixed(1) : '0';
  return `• ${name}: ${rate}% attendance (Present: ${stats.present}, Absent: ${stats.absent}, Late: ${stats.late}, Excused: ${stats.excused})`;
}).join('\n') || 'No attendance records available'}

=== CONVERSATION CONTEXT ===
${safeHistory.length > 0 
  ? safeHistory.map((h: any, i: number) => `[Turn ${i + 1}]\nUser: ${h.user}\nAssistant: ${h.assistant}`).join('\n---\n')
  : '(New conversation - no previous context)'
}

=== CURRENT REQUEST ===
User's Question: "${message}"

Instructions: Answer this question using ONLY the data provided above. If the user asks about a specific student, search for their name in the Student Roster and Grade/Attendance records. If the requested information isn't available in the data, clearly state what's missing.`;
    
    // Generate response
    const result = await model.generateContent({
      contents: [{ 
        role: 'user', 
        parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] 
      }]
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
        attendanceAnalyzed: allAttendance.length
      }
    };
    
  } catch (error: any) {
    const errorMessage = error.message || 'Unknown error occurred';
    throw new HttpsError(
      'internal',
      `Failed to get AI response: ${errorMessage}. Please try again later.`
    );
  }
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
    throw new HttpsError(
      'permission-denied',
      'Only administrators can change user roles'
    );
  }
  
  const { targetUserId, newRole } = request.data;
  
  if (!targetUserId || !newRole) {
    throw new HttpsError(
      'invalid-argument',
      'targetUserId and newRole are required'
    );
  }
  
  if (!['admin', 'teacher', 'student'].includes(newRole)) {
    throw new HttpsError(
      'invalid-argument',
      'newRole must be admin, teacher, or student'
    );
  }
  
  // 3. Update the user's role
  await db.doc(`users/${targetUserId}`).update({
    role: newRole,
    roleUpdatedAt: new Date().toISOString(),
    roleUpdatedBy: request.auth.uid
  });
  
  return {
    success: true,
    message: `User role updated to ${newRole}`,
    updatedUserId: targetUserId
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
    throw new HttpsError(
      'permission-denied',
      'Only administrators can view all users'
    );
  }
  
  // 3. Get all users from Firestore
  const usersSnapshot = await db.collection('users').get();
  const users = usersSnapshot.docs.map(doc => ({
    uid: doc.id,
    ...doc.data()
  }));
  
  return { users };
});

// Note: User documents are now auto-created on the client side during signup
// This is allowed by Firestore security rules for new users with 'student' role

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
