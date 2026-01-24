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
 * - Loaded from .env file (if exists)
 * - Required: GEMINI_API_KEY=your_api_key_here
 * - Use Functions Emulator: npm run serve
 * 
 * PRODUCTION:
 * - Set via Firebase CLI or Console
 * - Command: firebase functions:config:set gemini.api_key="YOUR_KEY"
 * - View: firebase functions:config:get
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
 * 1. Set API Key (FIRST TIME ONLY):
 *    firebase functions:config:set gemini.api_key="YOUR_API_KEY"
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
 * - Look for console.log, console.error output
 * 
 * COMMON ISSUES:
 * 
 * 1. "GEMINI_API_KEY not set"
 *    FIX: firebase functions:config:set gemini.api_key="YOUR_KEY"
 *    Then redeploy functions
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
 * 1. cd functions
 * 2. npm run serve (starts emulator)
 * 3. Set GEMINI_API_KEY in .env file
 * 4. Client auto-connects to emulator on localhost
 * 5. Check terminal for function logs
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
 * - Loads .env file if in emulator or development mode
 * - Required for local testing with Gemini API
 * 
 * PRODUCTION:
 * - Uses Firebase Functions config
 * - Set with: firebase functions:config:set gemini.api_key="YOUR_KEY"
 * 
 * GRACEFUL FAILURE:
 * - If dotenv not installed, continues without error
 * - Production doesn't need dotenv package
 */
if (process.env.FUNCTIONS_EMULATOR || process.env.NODE_ENV !== 'production') {
  try {
    // Only load dotenv in local development
    require('dotenv').config();
    console.log('✅ [Environment] Loaded .env file for local development');
  } catch (e) {
    // dotenv not installed or .env file doesn't exist - that's okay
    // Environment variables will be read from Firebase config in production
    console.log('⚠️ [Environment] .env file not found (this is normal in production)');
  }
}

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
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

// Initialize Gemini AI
// TODO: When migrating to dedicated API service, move this initialization to the service
// The API key is read from environment variable GEMINI_API_KEY
// Set it with: firebase functions:config:set gemini.api_key="YOUR_API_KEY"
const apiKey = getApiKey();
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

// ==================== HELPER FUNCTIONS ====================

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
export const getPerformanceSummary = onCall(async (request) => {
  console.log('🤖 [getPerformanceSummary] Request received', {
    userId: request.auth?.uid,
    studentId: request.data?.studentId
  });
  
  // STEP 1: Verify user is authenticated
  if (!request.auth) {
    console.error('❌ [getPerformanceSummary] Unauthenticated request');
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const { studentId } = request.data;
  
  // STEP 2: Validate input
  if (!studentId) {
    console.error('❌ [getPerformanceSummary] Missing studentId');
    throw new HttpsError('invalid-argument', 'studentId is required');
  }
  
  // STEP 3: Verify user has permission to access this student
  console.log('🔍 [getPerformanceSummary] Checking access permissions...');
  const { hasAccess, studentData } = await checkStudentAccess(
    request.auth.uid,
    studentId
  );
  
  if (!hasAccess) {
    console.error('❌ [getPerformanceSummary] Access denied', {
      userId: request.auth.uid,
      studentId
    });
    throw new HttpsError(
      'permission-denied',
      'You do not have access to this student'
    );
  }
  
  console.log('✅ [getPerformanceSummary] Access granted', {
    studentName: studentData.name
  });
  
  // STEP 4: Fetch student's grades
  console.log('📊 [getPerformanceSummary] Fetching grades...');
  const gradesSnapshot = await db
    .collection(`students/${studentId}/grades`)
    .orderBy('date', 'desc')
    .limit(20)
    .get();
  
  const grades = gradesSnapshot.docs.map(doc => doc.data());
  
  if (grades.length === 0) {
    console.warn('⚠️ [getPerformanceSummary] No grades found');
    throw new HttpsError(
      'failed-precondition',
      'No grades available for this student'
    );
  }
  
  console.log(`✅ [getPerformanceSummary] Found ${grades.length} grades`);
  
  // STEP 5: Fetch student's attendance (optional but recommended)
  console.log('📅 [getPerformanceSummary] Fetching attendance...');
  const attendanceSnapshot = await db
    .collection(`students/${studentId}/attendance`)
    .orderBy('date', 'desc')
    .limit(30)
    .get();
  
  const attendance = attendanceSnapshot.docs.map(doc => doc.data());
  console.log(`✅ [getPerformanceSummary] Found ${attendance.length} attendance records`);
  
  // STEP 6: Prepare data for AI analysis
  console.log('🔧 [getPerformanceSummary] Preparing data for AI...');
  const gradesData = prepareGradesData(grades);
  const attendanceData = prepareAttendanceData(attendance);
  
  // DEBUG: Log prepared data (remove in production or use debug flag)
  console.log('📋 [getPerformanceSummary] Prepared data:', {
    gradesCount: gradesData.length,
    attendanceStats: attendanceData
  });
  
  // STEP 7: Check if AI is configured
  if (!genAI) {
    console.error('❌ [getPerformanceSummary] Gemini AI not initialized - missing API key');
    throw new HttpsError(
      'failed-precondition',
      'AI service is not configured. Please contact administrator.'
    );
  }
  
  // STEP 8: Call AI API
  try {
    console.log('🤖 [getPerformanceSummary] Calling Gemini API...');
    
    // Get AI model with configuration
    const model = genAI.getGenerativeModel({ 
      model: AI_MODEL_CONFIG.model
    });
    
    // Build prompts using templates from ai-config.ts
    // TODO: When migrating prompts to database, fetch them here instead
    const systemPrompt = PERFORMANCE_SUMMARY_SYSTEM_PROMPT;
    const userPrompt = buildPerformanceSummaryPrompt(
      studentData.name,
      gradesData,
      attendanceData
    );
    
    // DEBUG: Log prompt structure (remove in production or use debug flag)
    console.log('📝 [getPerformanceSummary] Prompt structure:', {
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
      totalLength: systemPrompt.length + userPrompt.length
    });
    
    // Generate content using Gemini API
    // TODO: When migrating to dedicated API service, replace this call
    const result = await model.generateContent({
      contents: [{ 
        role: 'user', 
        parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] 
      }]
    });
    
    const response = result.response;
    const text = response.text();
    
    console.log('✅ [getPerformanceSummary] AI response received', {
      responseLength: text.length,
      studentName: studentData.name
    });
    
    // STEP 9: Return the AI-generated summary
    return { 
      summaryHtml: text,
      studentName: studentData.name,
      generatedAt: new Date().toISOString(),
      metadata: {
        gradesAnalyzed: grades.length,
        attendanceRecordsAnalyzed: attendance.length,
        model: AI_MODEL_CONFIG.model
      }
    };
    
  } catch (error: any) {
    // Enhanced error logging for debugging
    console.error('❌ [getPerformanceSummary] Gemini API error:', {
      error: error.message,
      code: error.code,
      stack: error.stack,
      studentId,
      studentName: studentData.name
    });
    
    // Provide user-friendly error message
    const errorMessage = error.message || 'Unknown error occurred';
    throw new HttpsError(
      'internal',
      `Failed to generate AI summary: ${errorMessage}. Please try again later.`
    );
  }
});

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
export const getStudyTips = onCall(async (request) => {
  console.log('🤖 [getStudyTips] Request received', {
    userId: request.auth?.uid,
    studentId: request.data?.studentId
  });
  
  // STEP 1: Verify user is authenticated
  if (!request.auth) {
    console.error('❌ [getStudyTips] Unauthenticated request');
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const { studentId } = request.data;
  
  // STEP 2: Validate input
  if (!studentId) {
    console.error('❌ [getStudyTips] Missing studentId');
    throw new HttpsError('invalid-argument', 'studentId is required');
  }
  
  // STEP 3: Verify user has permission to access this student
  console.log('🔍 [getStudyTips] Checking access permissions...');
  const { hasAccess, studentData } = await checkStudentAccess(
    request.auth.uid,
    studentId
  );
  
  if (!hasAccess) {
    console.error('❌ [getStudyTips] Access denied', {
      userId: request.auth.uid,
      studentId
    });
    throw new HttpsError(
      'permission-denied',
      'You do not have access to this student'
    );
  }
  
  console.log('✅ [getStudyTips] Access granted', {
    studentName: studentData.name
  });
  
  // STEP 4: Fetch student's grades
  console.log('📊 [getStudyTips] Fetching grades...');
  const gradesSnapshot = await db
    .collection(`students/${studentId}/grades`)
    .orderBy('date', 'desc')
    .limit(15)
    .get();
  
  const grades = gradesSnapshot.docs.map(doc => doc.data());
  
  if (grades.length === 0) {
    console.warn('⚠️ [getStudyTips] No grades found');
    throw new HttpsError(
      'failed-precondition',
      'No grades available for this student'
    );
  }
  
  console.log(`✅ [getStudyTips] Found ${grades.length} grades`);
  
  // STEP 5: Analyze grades to identify weak areas
  console.log('🔧 [getStudyTips] Analyzing performance by category...');
  const categoryAverages = calculateCategoryAverages(grades);
  
  // Prepare recent assignments summary
  const recentAssignments = grades.slice(0, 5).map(g => 
    `- ${g.assignmentName} (${g.category}): ${((g.score/g.totalPoints)*100).toFixed(1)}%`
  );
  
  // DEBUG: Log analysis results
  console.log('📋 [getStudyTips] Category analysis:', {
    categories: categoryAverages.length,
    categoryAverages
  });
  
  // STEP 6: Check if AI is configured
  if (!genAI) {
    console.error('❌ [getStudyTips] Gemini AI not initialized - missing API key');
    throw new HttpsError(
      'failed-precondition',
      'AI service is not configured. Please contact administrator.'
    );
  }
  
  // STEP 7: Call AI API
  try {
    console.log('🤖 [getStudyTips] Calling Gemini API...');
    
    // Get AI model with configuration
    const model = genAI.getGenerativeModel({ 
      model: AI_MODEL_CONFIG.model
    });
    
    // Build prompts using templates from ai-config.ts
    // TODO: When migrating prompts to database, fetch them here instead
    const systemPrompt = STUDY_TIPS_SYSTEM_PROMPT;
    const userPrompt = buildStudyTipsPrompt(
      studentData.name,
      categoryAverages,
      recentAssignments
    );
    
    // DEBUG: Log prompt structure (remove in production or use debug flag)
    console.log('📝 [getStudyTips] Prompt structure:', {
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
      totalLength: systemPrompt.length + userPrompt.length
    });
    
    // Generate content using Gemini API
    // TODO: When migrating to dedicated API service, replace this call
    const result = await model.generateContent({
      contents: [{ 
        role: 'user', 
        parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] 
      }]
    });
    
    const response = result.response;
    const text = response.text();
    
    console.log('✅ [getStudyTips] AI response received', {
      responseLength: text.length,
      studentName: studentData.name
    });
    
    // STEP 8: Return the AI-generated study tips
    return { 
      tipsHtml: text,
      studentName: studentData.name,
      generatedAt: new Date().toISOString(),
      metadata: {
        gradesAnalyzed: grades.length,
        categoriesAnalyzed: categoryAverages.length,
        model: AI_MODEL_CONFIG.model
      }
    };
    
  } catch (error: any) {
    // Enhanced error logging for debugging
    console.error('❌ [getStudyTips] Gemini API error:', {
      error: error.message,
      code: error.code,
      stack: error.stack,
      studentId,
      studentName: studentData.name
    });
    
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
  console.log('🤖 [aiAgentChat] Request received', {
    userId: request.auth?.uid,
    messageLength: request.data?.message?.length
  });
  
  // STEP 1: Verify user is authenticated and is admin
  if (!request.auth) {
    console.error('❌ [aiAgentChat] Unauthenticated request');
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  // Verify admin role
  const userDoc = await db.doc(`users/${request.auth.uid}`).get();
  if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
    console.error('❌ [aiAgentChat] Non-admin access attempt', {
      userId: request.auth.uid,
      role: userDoc.data()?.role
    });
    throw new HttpsError(
      'permission-denied',
      'Only administrators can use the AI Agent'
    );
  }
  
  const { message, conversationHistory = [] } = request.data;
  
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'Message is required');
  }
  
  console.log('✅ [aiAgentChat] Admin verified, loading data...');
  
  // STEP 2: Load all student data
  console.log('📊 [aiAgentChat] Loading all students...');
  const studentsSnapshot = await db.collection('students').get();
  const students = studentsSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as Array<{ id: string; name?: string; memberId?: string; yearOfBirth?: number; contactEmail?: string; [key: string]: any }>;
  console.log(`✅ [aiAgentChat] Loaded ${students.length} students`);
  
  // STEP 3: Load grades and attendance for all students
  console.log('📊 [aiAgentChat] Loading grades and attendance...');
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
      console.warn(`⚠️ [aiAgentChat] Error loading data for student ${student.id}:`, error);
    }
  }
  
  console.log(`✅ [aiAgentChat] Loaded ${allGrades.length} grades and ${allAttendance.length} attendance records`);
  
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
    recentGrades: allGrades.slice(0, 30).map(g => ({
      studentName: g.studentName,
      assignment: g.assignmentName,
      category: g.category,
      score: g.score,
      totalPoints: g.totalPoints,
      percentage: ((g.score / g.totalPoints) * 100).toFixed(1) + '%',
      date: g.date
    })),
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
    console.error('❌ [aiAgentChat] Gemini AI not initialized - missing API key');
    throw new HttpsError(
      'failed-precondition',
      'AI service is not configured. Please contact administrator.'
    );
  }
  
  // STEP 6: Build conversation with context
  try {
    console.log('🤖 [aiAgentChat] Calling Gemini API...');
    
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
${conversationHistory.length > 0 
  ? conversationHistory.map((h: any, i: number) => `[Turn ${i + 1}]\nUser: ${h.user}\nAssistant: ${h.assistant}`).join('\n---\n')
  : '(New conversation - no previous context)'
}

=== CURRENT REQUEST ===
User's Question: "${message}"

Instructions: Answer this question using ONLY the data provided above. If the user asks about a specific student, search for their name in the Student Roster and Grade/Attendance records. If the requested information isn't available in the data, clearly state what's missing.`;
    
    // DEBUG: Log prompt structure
    console.log('📝 [aiAgentChat] Prompt structure:', {
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
      conversationHistoryLength: conversationHistory.length
    });
    
    // Generate response
    const result = await model.generateContent({
      contents: [{ 
        role: 'user', 
        parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] 
      }]
    });
    
    const response = result.response;
    const text = response.text();
    
    console.log('✅ [aiAgentChat] AI response received', {
      responseLength: text.length
    });
    
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
    console.error('❌ [aiAgentChat] Gemini API error:', {
      error: error.message,
      code: error.code,
      stack: error.stack
    });
    
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


