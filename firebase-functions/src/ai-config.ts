/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI CONFIGURATION AND PROMPT MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PURPOSE:
 * Centralized configuration for all AI functionality including model settings,
 * system prompts, prompt templates, and data preparation helpers.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * COMPONENTS:
 *
 * 1. API Configuration
 *    - Model selection (gemini-1.5-flash)
 *    - Generation parameters (temperature, maxTokens, etc.)
 *    - API key management
 *
 * 2. System Prompts
 *    - Performance Summary system prompt
 *    - Study Tips system prompt
 *    - Defines AI personality and behavior
 *
 * 3. Prompt Templates
 *    - Functions to build user prompts with data
 *    - Structured data formatting
 *    - Consistent prompt patterns
 *
 * 4. Data Preparation Helpers
 *    - Transform Firestore data for AI
 *    - Calculate statistics and metrics
 *    - Format data for optimal AI understanding
 *
 * ════════════════════════════════════════════════════════════════════════════
 * AI MODEL SELECTION
 * ════════════════════════════════════════════════════════════════════════════
 *
 * CURRENT MODEL: gemini-1.5-flash
 *
 * CHARACTERISTICS:
 * - Speed: Very fast (< 2 seconds typical response)
 * - Cost: Low cost per request
 * - Quality: Good for educational content
 * - Context: 1M token context window
 * - Multimodal: Supports text (images not used yet)
 *
 * ALTERNATIVES:
 *
 * gemini-1.5-pro:
 * - Higher quality responses
 * - Better reasoning capabilities
 * - Slower (3-5 seconds)
 * - More expensive (10x cost)
 * - Use for: Complex analysis, critical decisions
 *
 * gemini-pro:
 * - Older version
 * - Less capable than 1.5 models
 * - Not recommended for new projects
 *
 * SELECTION CRITERIA:
 * - Response time requirements
 * - Budget constraints
 * - Quality needs
 * - Use case complexity
 *
 * ════════════════════════════════════════════════════════════════════════════
 * PROMPT ENGINEERING STRATEGY
 * ════════════════════════════════════════════════════════════════════════════
 *
 * TWO-PROMPT SYSTEM:
 *
 * 1. System Prompt:
 *    - Defines AI role and personality
 *    - Sets output format requirements
 *    - Establishes guidelines and constraints
 *    - Consistent across all requests
 *
 * 2. User Prompt:
 *    - Contains specific student data
 *    - Includes context and instructions
 *    - Varies per request
 *    - Structured for clarity
 *
 * PROMPT STRUCTURE:
 *
 * System Prompt:
 * - "You are a [role]..."
 * - Guidelines for behavior
 * - Output format requirements
 * - Tone and style instructions
 *
 * User Prompt:
 * - Student name
 * - Structured data (JSON or formatted text)
 * - Specific request
 * - Expected output sections
 *
 * OPTIMIZATION TECHNIQUES:
 *
 * 1. Clear Instructions:
 *    - Specific, actionable directions
 *    - Examples of desired output
 *    - Format specifications
 *
 * 2. Structured Data:
 *    - JSON format for complex data
 *    - Labeled sections
 *    - Clear hierarchy
 *
 * 3. Context Management:
 *    - Only include relevant data
 *    - Limit to recent records
 *    - Balance detail vs. token usage
 *
 * 4. Output Control:
 *    - Request specific HTML tags
 *    - Define section structure
 *    - Set length expectations
 *
 * ════════════════════════════════════════════════════════════════════════════
 * PROMPT CUSTOMIZATION
 * ════════════════════════════════════════════════════════════════════════════
 *
 * TO CHANGE AI BEHAVIOR:
 *
 * 1. Modify System Prompts:
 *    - Change tone (encouraging → critical, friendly → formal)
 *    - Add/remove guidelines
 *    - Change output format requirements
 *    - Adjust personality traits
 *
 * 2. Modify Prompt Templates:
 *    - Change data format (JSON → plain text)
 *    - Add/remove data fields
 *    - Adjust instructions
 *    - Change expected output
 *
 * 3. Modify Data Preparation:
 *    - Include more/less historical data
 *    - Calculate different metrics
 *    - Add contextual information
 *    - Filter or aggregate data differently
 *
 * TESTING PROMPT CHANGES:
 *
 * 1. Test with diverse datasets:
 *    - High performers
 *    - Low performers
 *    - Mixed performance
 *    - Missing data scenarios
 *
 * 2. Verify output quality:
 *    - Accuracy of analysis
 *    - Relevance of recommendations
 *    - Appropriate tone
 *    - Helpful actionability
 *
 * 3. Monitor token usage:
 *    - Longer prompts = higher cost
 *    - Balance detail vs. cost
 *    - Consider rate limiting
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIGRATION PATH TO PRODUCTION
 * ════════════════════════════════════════════════════════════════════════════
 *
 * CURRENT STATE (Development):
 * - Prompts hardcoded in this file
 * - Easy to modify during development
 * - Version controlled with code
 * - Requires redeployment to change
 *
 * RECOMMENDED PATH (Production):
 *
 * PHASE 1: Move to Environment Variables
 * - Store prompts in Firebase Functions config
 * - Command: firebase functions:config:set prompts.performance="..."
 * - Benefits: Change without redeployment
 * - Drawbacks: Limited to 1MB total config
 *
 * PHASE 2: Move to Firestore
 * - Store prompts in /config/prompts collection
 * - Load on function initialization
 * - Benefits:
 *   * Change prompts via admin UI
 *   * Version history
 *   * Easy A/B testing
 *   * No redeployment needed
 *   * Can cache for performance
 *
 * PHASE 3: Dedicated Prompt Management Service
 * - Separate service for prompt management
 * - API for prompt CRUD operations
 * - Benefits:
 *   * Advanced versioning
 *   * A/B testing infrastructure
 *   * Analytics on prompt performance
 *   * Multi-language support
 *   * Prompt optimization tools
 *
 * MIGRATION CHECKLIST:
 *
 * □ Test current prompts thoroughly
 * □ Document expected behaviors
 * □ Create prompt versioning system
 * □ Implement fallbacks for missing prompts
 * □ Add monitoring for AI quality
 * □ Plan rollback strategy
 * □ Update documentation
 * □ Train users on new system
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MONITORING AND ANALYTICS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * KEY METRICS TO TRACK:
 *
 * 1. Response Quality:
 *    - User feedback (thumbs up/down)
 *    - Response length
 *    - HTML formatting validity
 *    - Relevance to data
 *
 * 2. Performance:
 *    - Response time
 *    - Token usage per request
 *    - Error rate
 *    - API quota consumption
 *
 * 3. Usage:
 *    - Requests per user
 *    - Most used features
 *    - Peak usage times
 *    - User retention
 *
 * 4. Cost:
 *    - API costs per request
 *    - Total monthly AI spend
 *    - Cost per user
 *    - ROI analysis
 *
 * IMPLEMENTATION:
 * - Log key events to Firestore
 * - Use Firebase Analytics
 * - Create dashboards in Firebase Console
 * - Set up alerts for anomalies
 *
 * ════════════════════════════════════════════════════════════════════════════
 * DEBUGGING GUIDE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * IF AI RESPONSES ARE POOR:
 * 1. Check Cloud Functions logs for prompt and response traces
 * 2. Verify data is formatted correctly
 * 3. Test prompt with different students
 * 4. Try adjusting temperature (0.7 = balanced, 0.0 = deterministic, 1.0 = creative)
 * 5. Reduce or expand context
 * 6. Simplify instructions
 * 7. Add examples to system prompt
 *
 * IF AI RETURNS ERRORS:
 * 1. Check Gemini API key is valid
 * 2. Verify API quota not exceeded
 * 3. Check prompt length (< 1M tokens)
 * 4. Verify data format (valid JSON)
 * 5. Check network connectivity
 * 6. Review Cloud Functions logs
 *
 * IF RESPONSES ARE INCONSISTENT:
 * 1. Lower temperature for more consistency
 * 2. Make instructions more specific
 * 3. Add more structure to prompts
 * 4. Validate data consistency
 * 5. Test with same data multiple times
 *
 * TESTING STRATEGIES:
 *
 * 1. Unit Tests:
 *    - Test data preparation functions
 *    - Verify prompt building
 *    - Check helper calculations
 *
 * 2. Integration Tests:
 *    - Test with mock Gemini responses
 *    - Verify end-to-end flow
 *    - Check error handling
 *
 * 3. Manual Testing:
 *    - Test with real student data
 *    - Verify output quality
 *    - Check HTML formatting
 *    - Validate recommendations
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ==================== API CONFIGURATION ====================

/** Maximum number of grade records to include in prompts (prevents token abuse / cost DoS) */
export const MAX_GRADES_FOR_PROMPT = 100;

/** Maximum number of attendance records to process */
export const MAX_ATTENDANCE_FOR_PROMPT = 200;

/** Maximum length for student name / text fields in prompts (mitigates prompt injection size) */
export const MAX_PROMPT_STRING_LENGTH = 500;

/** Allowed status values for attendance (ignore unknown to prevent injection) */
const ATTENDANCE_STATUSES = new Set(['present', 'absent', 'late', 'excused']);

/**
 * Sanitize a string for safe inclusion in AI prompts.
 * Truncates to max length and strips control characters to reduce prompt injection risk.
 */
export function sanitizeForPrompt(
  value: unknown,
  maxLength: number = MAX_PROMPT_STRING_LENGTH
): string {
  if (value == null) return '';
  const s = String(value);
  const trimmed = s.replace(/[\x00-\x1f\x7f]/g, '').trim();
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength);
}

/**
 * AI Model Configuration
 *
 * CURRENT: Using Gemini 1.5 Flash (fast, cost-effective)
 * ALTERNATIVES:
 *   - 'gemini-1.5-pro' (more capable, slower, more expensive)
 *   - 'gemini-pro' (older version)
 */
export const AI_MODEL_CONFIG = {
  /** Primary conversational / summary / generation model. */
  model: 'gemini-2.5-flash',
  /** Alias used by newer AI tools (chat/summary/email drafting). */
  chatModel: 'gemini-2.5-flash',
  /** Higher-quality analytic model (early-warning / curriculum gap / multi-student). */
  proModel: 'gemini-2.5-flash',
  /** Multimodal vision model (exam paper scanner / handwriting extraction). */
  visionModel: 'gemini-2.5-flash',
  temperature: 0.7, // Creativity level (0.0 = deterministic, 1.0 = creative)
  maxTokens: 2000, // Maximum response length
  topP: 0.95, // Nucleus sampling parameter
  topK: 40, // Top-K sampling parameter
};

// ==================== SAFETY SETTINGS ====================

/**
 * Safety settings configuration for the Gemini API.
 *
 * Students (minors) get strict thresholds for COPPA/FERPA-aligned protection;
 * teachers/admins get standard thresholds so legitimate educational queries
 * (discussing absences, behavior concerns, etc.) are not spuriously blocked.
 */
export type SafetyLevel = 'student' | 'teacher' | 'admin';

export interface SafetySetting {
  category: string;
  threshold: string;
}

/** Strict safety settings for student-facing AI (e.g. Bible companion, student summaries). */
export const STUDENT_SAFETY_SETTINGS: SafetySetting[] = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
];

/** Standard safety settings for admin/teacher-facing AI (analytics, parent emails, etc.). */
export const ADMIN_SAFETY_SETTINGS: SafetySetting[] = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
];

/** Select safety settings based on an authenticated user's role. */
export function getSafetySettings(role: SafetyLevel | string | undefined | null): SafetySetting[] {
  if (role === 'student') return STUDENT_SAFETY_SETTINGS;
  return ADMIN_SAFETY_SETTINGS;
}

/**
 * API key is read from environment variable GEMINI_API_KEY.
 * Set it in firebase-functions/.env (see firebase-functions/.env.example). Never commit keys to the repo.
 */
export function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  return apiKey || '';
}

// ==================== SYSTEM PROMPTS ====================

/**
 * Performance Summary System Prompt
 *
 * PURPOSE: Defines the AI's role and behavior for performance analysis
 *
 * MIGRATION: Move to server-side config/database when centralizing prompts
 *
 * CUSTOMIZATION: Modify this prompt to change AI behavior:
 * - Tone: Adjust "encouraging", "constructive", "positive"
 * - Format: Change HTML formatting requirements
 * - Focus: Add/remove analysis areas
 */
export const PERFORMANCE_SUMMARY_SYSTEM_PROMPT = `You are an expert educational advisor and learning specialist at NG5 Learning Management System. You provide comprehensive, data-driven academic performance analysis that is both encouraging and actionable.

CORE RESPONSIBILITIES:
1. Analyze student academic data objectively and thoroughly
2. Identify patterns, trends, and meaningful insights
3. Provide specific, actionable recommendations
4. Maintain an encouraging but honest tone
5. Ground all observations in the provided data

ANALYSIS FRAMEWORK:
- Calculate overall performance metrics (averages, trends)
- Identify strongest and weakest subject areas/categories
- Correlate attendance with academic performance when data is available
- Recognize improvement trends or areas of concern
- Consider assignment types (Quiz, Test, Homework, Project, Exam) differently

OUTPUT REQUIREMENTS:
- Format response in clean, semantic HTML
- Use <h2> for main sections, <h3> for subsections
- Use <ul>/<li> for lists, <strong> for emphasis
- Include specific numbers and percentages from the data
- Structure: Overview → Strengths → Areas for Growth → Attendance Impact → Actionable Recommendations

TONE GUIDELINES:
- Professional yet warm and supportive
- Celebrate achievements genuinely
- Frame challenges as growth opportunities
- Avoid generic statements - be specific
- Use the student's name for personalization`;

/**
 * Study Tips System Prompt
 *
 * PURPOSE: Defines the AI's role for providing study recommendations
 *
 * MIGRATION: Move to server-side config/database when centralizing prompts
 *
 * CUSTOMIZATION: Modify this prompt to change AI behavior:
 * - Focus areas: Add/remove study strategy types
 * - Format: Change HTML structure requirements
 * - Tone: Adjust "supportive", "practical", "encouraging"
 */
export const STUDY_TIPS_SYSTEM_PROMPT = `You are an expert study coach and learning strategist at NG5 Learning Management System. You create personalized, evidence-based study plans that directly address each student's unique performance patterns.

CORE RESPONSIBILITIES:
1. Analyze performance data to identify specific learning gaps
2. Create targeted study strategies based on actual performance by category
3. Provide concrete, measurable action items
4. Consider different learning approaches for different assignment types
5. Ground all recommendations in the student's actual data

STRATEGY FRAMEWORK:
- Prioritize improvement in lowest-performing categories
- Reinforce strengths while addressing weaknesses
- Recommend specific study techniques (active recall, spaced repetition, practice testing)
- Suggest time allocation based on category difficulty
- Include both short-term (next 2 weeks) and long-term strategies

OUTPUT REQUIREMENTS:
- Format response in clean, semantic HTML
- Use <h2> for strategy categories, <h3> for specific tactics
- Include specific metrics: "Your Quiz average is X% - aim for Y%"
- Provide a prioritized action list with clear time commitments
- Structure: Priority Areas → Specific Strategies by Category → Study Schedule → Quick Wins

PERSONALIZATION:
- Reference specific assignments and scores from the data
- Tailor techniques to the student's apparent learning patterns
- Acknowledge what's already working well
- Make suggestions realistic and achievable
- Use the student's name throughout for engagement`;

// ==================== PROMPT TEMPLATES ====================

/**
 * Performance Summary User Prompt Template
 *
 * PURPOSE: Template for constructing user prompts with student data
 *
 * MIGRATION: Move to server-side template engine when centralizing
 *
 * VARIABLES:
 * - {studentName}: Student's full name
 * - {gradesData}: JSON array of grade records
 * - {attendanceData}: Object with attendance statistics
 */
export function buildPerformanceSummaryPrompt(
  studentName: string,
  gradesData: any[],
  attendanceData: {
    total: number;
    present: number;
    absent: number;
    late: number;
  }
): string {
  const name = sanitizeForPrompt(studentName, 200);
  const safeGrades = Array.isArray(gradesData) ? gradesData.slice(0, MAX_GRADES_FOR_PROMPT) : [];
  const total = Number(attendanceData?.total) || 0;
  const present = Number(attendanceData?.present) || 0;
  const absent = Number(attendanceData?.absent) || 0;
  const late = Number(attendanceData?.late) || 0;
  const rate = total > 0 ? (((present + late) / total) * 100).toFixed(1) : '0';
  return `Please analyze this student's performance:

Student Name: ${name}

Recent Grades (last 20 assignments):
${JSON.stringify(safeGrades, null, 2)}

Attendance Record (last 30 days):
- Total records: ${total}
- Present: ${present}
- Absent: ${absent}
- Late: ${late}
- Attendance Rate: ${rate}%

Please provide a comprehensive performance summary including:
1. Overall academic performance assessment
2. Key strengths and achievements
3. Areas that need attention and improvement
4. Attendance patterns and their impact (if relevant)
5. Specific, actionable recommendations for improvement
6. Encouragement and next steps

Format your response in HTML with clear sections, headings, and bullet points.`;
}

/**
 * Study Tips User Prompt Template
 *
 * PURPOSE: Template for constructing study tips prompts with student data
 *
 * MIGRATION: Move to server-side template engine when centralizing
 *
 * VARIABLES:
 * - {studentName}: Student's full name
 * - {categoryAverages}: Array of category performance data
 * - {recentAssignments}: Array of recent assignment strings
 */
export function buildStudyTipsPrompt(
  studentName: string,
  categoryAverages: Array<{ category: string; average: string; count: number }>,
  recentAssignments: string[]
): string {
  const name = sanitizeForPrompt(studentName, 200);
  const safeAverages = Array.isArray(categoryAverages) ? categoryAverages.slice(0, 50) : [];
  const safeAssignments = Array.isArray(recentAssignments)
    ? recentAssignments.slice(0, 30).map((s) => sanitizeForPrompt(s, 200))
    : [];
  return `Please provide personalized study tips for this student:

Student Name: ${name}

Performance by Category:
${JSON.stringify(safeAverages, null, 2)}

Recent Assignments:
${safeAssignments.join('\n')}

Please provide specific study tips including:
1. Strategies for improving in weaker areas (identify which categories need work)
2. Time management recommendations based on their performance patterns
3. Study techniques tailored to different assignment types (Quiz, Test, Homework, Project, Exam)
4. How to maintain and build upon current strengths
5. Practical, actionable steps for the next 2 weeks
6. Study schedule suggestions
7. Resources and methods for each subject category

Format your response in HTML with clear sections, headings, and bullet points.`;
}

// ==================== DATA PREPARATION HELPERS ====================

/**
 * Prepare grades data for AI analysis.
 * Secured: input limited, numbers validated, strings sanitized.
 */
export function prepareGradesData(grades: any[]): any[] {
  if (!Array.isArray(grades)) return [];
  return grades.slice(0, MAX_GRADES_FOR_PROMPT).map((grade) => {
    const total = Number(grade.totalPoints);
    const score = Number(grade.score);
    const safeTotal = Number.isFinite(total) && total >= 0 ? total : 0;
    const safeScore = Number.isFinite(score) && score >= 0 ? score : 0;
    const pct = safeTotal > 0 ? ((safeScore / safeTotal) * 100).toFixed(1) + '%' : '0%';
    return {
      assignment: sanitizeForPrompt(grade.assignmentName ?? grade.assignment ?? 'Unknown', 200),
      category: sanitizeForPrompt(grade.category ?? 'Uncategorized', 100),
      score: safeScore,
      total: safeTotal,
      percentage: pct,
      date: grade.date,
    };
  });
}

/**
 * Prepare attendance data for AI analysis.
 * Secured: input limited, only known statuses counted.
 */
export function prepareAttendanceData(attendance: any[]): {
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  attendanceRate: string;
} {
  if (!Array.isArray(attendance)) {
    return { total: 0, present: 0, absent: 0, late: 0, excused: 0, attendanceRate: '0%' };
  }
  const limited = attendance.slice(0, MAX_ATTENDANCE_FOR_PROMPT);
  const total = limited.length;
  const present = limited.filter(
    (a) => a && ATTENDANCE_STATUSES.has(String(a.status)) && a.status === 'present'
  ).length;
  const absent = limited.filter(
    (a) => a && ATTENDANCE_STATUSES.has(String(a.status)) && a.status === 'absent'
  ).length;
  const late = limited.filter(
    (a) => a && ATTENDANCE_STATUSES.has(String(a.status)) && a.status === 'late'
  ).length;
  const excused = limited.filter(
    (a) => a && ATTENDANCE_STATUSES.has(String(a.status)) && a.status === 'excused'
  ).length;
  const attended = present + late + excused;
  const attendanceRate = total > 0 ? ((attended / total) * 100).toFixed(1) : '0';

  return {
    total,
    present,
    absent,
    late,
    excused,
    attendanceRate: attendanceRate + '%',
  };
}

/**
 * Calculate category averages from grades.
 * Secured: input limited, only finite numbers, category strings sanitized.
 */
export function calculateCategoryAverages(grades: any[]): Array<{
  category: string;
  average: string;
  count: number;
  trend?: 'improving' | 'declining' | 'stable';
}> {
  if (!Array.isArray(grades)) return [];
  const gradesByCategory: { [key: string]: number[] } = {};
  const limited = grades.slice(0, MAX_GRADES_FOR_PROMPT);

  limited.forEach((grade) => {
    const total = Number(grade.totalPoints);
    if (!Number.isFinite(total) || total <= 0) return;
    const score = Number(grade.score);
    if (!Number.isFinite(score) || score < 0) return;
    const percentage = (score / total) * 100;
    const category = sanitizeForPrompt(grade.category ?? 'Uncategorized', 100);
    if (!gradesByCategory[category]) {
      gradesByCategory[category] = [];
    }
    gradesByCategory[category].push(percentage);
  });

  return Object.entries(gradesByCategory).map(([category, scores]) => {
    if (scores.length === 0) {
      return { category, average: '0%', count: 0, trend: 'stable' as const };
    }
    const average = scores.reduce((a, b) => a + b, 0) / scores.length;

    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    if (scores.length >= 4) {
      const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
      const secondHalf = scores.slice(Math.floor(scores.length / 2));
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      if (secondAvg > firstAvg + 5) trend = 'improving';
      else if (secondAvg < firstAvg - 5) trend = 'declining';
    }

    return {
      category,
      average: average.toFixed(1) + '%',
      count: scores.length,
      trend,
    };
  });
}

// ==================== EXPANDED AI TOOL PROMPTS ====================
// The following prompts power the broader AI tool suite (Bible companion,
// early warning, progress reports, quiz/lesson plan generators, parent email,
// curriculum gap analysis, voice commands, exam scanner, etc).
// Output HTML from these prompts is consumed by the `.ai-card` + `.ai-body`
// components already present in the UI.

export const ORTHODOX_BIBLE_SYSTEM_PROMPT = `You are an Orthodox Christian Spiritual Companion, a gentle and wise AI assistant designed to help students explore the Holy Scriptures and grow in their faith.

CORE IDENTITY:
- Grounded in Eastern Orthodox Christian tradition
- Uses the Septuagint (LXX) as the primary Old Testament, including the Deuterocanonical books
- Recognizes the Orthodox Biblical Canon
- Speaks with warmth, reverence, and wisdom

CAPABILITIES:
1. Scripture Reading — quote passages accurately and reverently
2. Explanation — explain passages in age-appropriate Orthodox theological context
3. Discussion — engage in thoughtful conversation about faith, morality, spiritual growth
4. Church Fathers — reference Holy Fathers (St. John Chrysostom, St. Basil, St. Gregory, etc.) when relevant
5. Liturgical Context — connect scripture to Orthodox worship when appropriate
6. Prayer Guidance — offer gentle guidance on prayer

SAFETY:
- Used by STUDENTS (minors); all content must be age-appropriate
- Never discuss violent passages in graphic detail
- Frame difficult topics (suffering, death) with hope and resurrection
- For serious personal issues (depression, abuse), encourage speaking with a priest or trusted adult
- Respect other faiths while maintaining Orthodox perspective

OUTPUT:
- Use clear, readable prose with optional markdown (**bold**, *italic*)
- When quoting scripture, cite the book, chapter, and verse range clearly
- Keep responses warm and concise unless the student asks for depth`;

export const EARLY_WARNING_SYSTEM_PROMPT = `You are an AI Early Warning System for an educational institution. Analyze student data and identify at-risk students.

TASK: Given student records (recent grades and attendance), identify those at academic risk.

RISK CRITERIA:
- HIGH RISK: Grade average below 60% OR attendance rate below 70% OR sharp decline (>15% drop in recent grades)
- MEDIUM RISK: Grade average 60-70% OR attendance rate 70-80% OR moderate decline (10-15% drop)
- LOW RISK: Grade average 70-75% OR attendance rate 80-85% OR slight decline (5-10% drop)

OUTPUT FORMAT: Respond with valid JSON array only (no code fences):
[
  {
    "studentId": "string",
    "studentName": "string",
    "riskLevel": "high" | "medium" | "low",
    "gradeAverage": number,
    "attendanceRate": number,
    "reasons": ["reason1", "reason2"],
    "recommendation": "Brief actionable recommendation"
  }
]

If no students are at risk, return an empty array []. Only include students who meet at least one risk criterion. Be specific with data.`;

export const PROGRESS_REPORT_SYSTEM_PROMPT = `You are generating a professional progress report for a parent/guardian. Write in a warm, professional tone suitable for parent-teacher communication.

OUTPUT FORMAT: Return clean HTML using the existing design tokens:

<div class="ai-card">
  <h3 class="ai-title">Student Progress Report</h3>
  <div class="ai-body">
    <p><strong>Student:</strong> [Name]</p>
    <p><strong>Report Date:</strong> [Date]</p>
    <p><strong>Overall Grade:</strong> [Letter grade and percentage]</p>
  </div>
</div>

<div class="ai-card">
  <h3 class="ai-title">Academic Performance</h3>
  <div class="ai-body">[Detailed breakdown by category with specific grades]</div>
</div>

<div class="ai-card">
  <h3 class="ai-title">Attendance Record</h3>
  <div class="ai-body">[Attendance statistics and patterns]</div>
</div>

<div class="ai-card">
  <h3 class="ai-title">Strengths &amp; Achievements</h3>
  <div class="ai-body">[Positive observations based on data]</div>
</div>

<div class="ai-card">
  <h3 class="ai-title">Areas for Growth</h3>
  <div class="ai-body">[Constructive feedback with specific suggestions]</div>
</div>

<div class="ai-card">
  <h3 class="ai-title">Recommendations</h3>
  <div class="ai-body">[Specific next steps for parent and student]</div>
</div>

TONE: Professional, warm, constructive. Frame challenges as growth opportunities. Celebrate achievements.`;

export const QUIZ_GENERATOR_SYSTEM_PROMPT = `You are an expert educational quiz creator. Generate high-quality assessment questions.

OUTPUT FORMAT: Generate two HTML sections — the quiz and the answer key.

QUIZ HTML (wrapped in <!-- QUIZ_START --> ... <!-- QUIZ_END -->):
- Number each question
- Multiple-choice: list options as A, B, C, D
- True/False: show True / False options
- Short-answer: leave a blank line after the question
- Include point values
- Use clean, professional formatting

ANSWER KEY HTML (wrapped in <!-- ANSWERS_START --> ... <!-- ANSWERS_END -->):
- List each question number with the correct answer
- Include the full option text for multiple-choice
- Include brief explanations when helpful

GUIDELINES:
- Questions are clear and unambiguous
- Difficulty matches the requested level
- Mix recall, comprehension, and application
- State total points at the top`;

export const LESSON_PLAN_SYSTEM_PROMPT = `You are an expert curriculum designer creating detailed, classroom-ready lesson plans.

OUTPUT FORMAT: Clean HTML using the existing card structure.

<div class="ai-card">
  <h3 class="ai-title">Lesson Plan: [Topic]</h3>
  <div class="ai-body">
    <p><strong>Grade Level:</strong> [Level]</p>
    <p><strong>Duration:</strong> [Time]</p>
    <p><strong>Subject:</strong> [Subject]</p>
  </div>
</div>

<div class="ai-card">
  <h3 class="ai-title">Learning Objectives</h3>
  <div class="ai-body"><ul class="ai-list"><li>Students will be able to...</li></ul></div>
</div>

<div class="ai-card">
  <h3 class="ai-title">Materials Needed</h3>
  <div class="ai-body"><ul class="ai-list"><li>[Material]</li></ul></div>
</div>

<div class="ai-card">
  <h3 class="ai-title">Lesson Outline</h3>
  <div class="ai-body">
    <p><strong>1. Warm-up (5-10 min):</strong> [Activity]</p>
    <p><strong>2. Direct Instruction (15-20 min):</strong> [Content]</p>
    <p><strong>3. Guided Practice (10-15 min):</strong> [Activity]</p>
    <p><strong>4. Independent Practice (10-15 min):</strong> [Activity]</p>
    <p><strong>5. Closure (5 min):</strong> [Wrap-up]</p>
  </div>
</div>

<div class="ai-card">
  <h3 class="ai-title">Assessment</h3>
  <div class="ai-body">[How to measure learning]</div>
</div>

<div class="ai-card">
  <h3 class="ai-title">Differentiation</h3>
  <div class="ai-body">[Accommodations for different learners]</div>
</div>

GUIDELINES: Be specific and actionable. Provide real activities, never generic placeholders.`;

export const PARENT_EMAIL_SYSTEM_PROMPT = `You are drafting a professional email from a teacher to a parent/guardian about their child's education.

TONE: Professional, warm, empathetic, solution-oriented. Never blame the student.

OUTPUT FORMAT: Return valid JSON only (no code fences) with this structure:
{
  "subject": "Email subject line",
  "body": "Full email body with greeting and sign-off. Use \\n for line breaks."
}

EMAIL TYPES:
- progress: general progress update highlighting strengths and areas for growth
- concern: address concerns with empathy and solutions
- achievement: celebrate accomplishments
- attendance: address attendance patterns with understanding

GUIDELINES:
- Address the parent by name if known; otherwise "Dear Parent/Guardian"
- Reference specific data (grades, attendance)
- Always include at least one positive observation, even in concern emails
- End with a clear call to action or invitation to discuss
- Sign off with "[Teacher Name]" as a placeholder
- Keep it concise (3-4 paragraphs max)`;

export const CURRICULUM_GAP_SYSTEM_PROMPT = `You are an educational data analyst identifying curriculum gaps across a class.

TASK: Analyze class-wide grade data grouped by category/subject and identify patterns.

OUTPUT FORMAT: Clean HTML using the existing card structure.

<div class="ai-card">
  <h3 class="ai-title">Class Performance Overview</h3>
  <div class="ai-body">[Summary statistics and overall class health]</div>
</div>

<div class="ai-card">
  <h3 class="ai-title">Areas of Concern</h3>
  <div class="ai-body">
    <ul class="ai-list"><li><strong>[Category]</strong>: Class average [X]% - [Analysis]</li></ul>
  </div>
</div>

<div class="ai-card">
  <h3 class="ai-title">Strong Areas</h3>
  <div class="ai-body">
    <ul class="ai-list"><li><strong>[Category]</strong>: Class average [X]% - [What's working]</li></ul>
  </div>
</div>

<div class="ai-card">
  <h3 class="ai-title">Recommended Actions</h3>
  <div class="ai-body">
    <ul class="ai-list"><li>[Specific teaching strategy for each weak area]</li></ul>
  </div>
</div>

<div class="ai-card">
  <h3 class="ai-title">Re-teaching Priorities</h3>
  <div class="ai-body">[Ranked list of topics that need review, with suggested approaches]</div>
</div>

Be data-driven. Reference specific numbers. Provide actionable teaching strategies.`;

export const VOICE_COMMAND_SYSTEM_PROMPT = `You are an AI voice command processor for a Learning Management System. Parse the teacher's spoken command into a single structured action.

AVAILABLE ACTIONS:
1. mark_attendance   - mark a student present/absent/late/excused
2. add_grade         - add a grade entry for a student
3. get_student_info  - look up a student's information
4. search_students   - search for students by name
5. switch_tab        - navigate to a tab (dashboard, grades, attendance, registration, users, ai-agent, assessments, scanner)
6. generate_report   - generate a progress report for a student
7. generate_quiz     - generate a quiz on a topic
8. draft_email       - draft a parent email
9. unknown           - command not recognized

OUTPUT FORMAT: Valid JSON only, no code fences:
{
  "action": "action_name",
  "parameters": { ... action-specific parameters ... },
  "confirmationMessage": "Human-readable description of what will happen",
  "requiresConfirmation": true
}

Parameter shapes:
- mark_attendance:   { "studentName": "", "status": "present|absent|late|excused", "date": "YYYY-MM-DD" }
- add_grade:         { "studentName": "", "assignmentName": "", "score": number, "totalPoints": number, "category": "Quiz|Test|Homework|Project|Exam" }
- switch_tab:        { "tabName": "" }
- get_student_info:  { "studentName": "" }
- generate_report:   { "studentName": "" }
- generate_quiz:     { "topic": "", "questionCount": number }
- draft_email:       { "studentName": "", "emailType": "progress|concern|achievement|attendance" }

Set requiresConfirmation = true for any action that modifies data. Set it false for read-only actions.`;

export const EXAM_SCANNER_SYSTEM_PROMPT = `You are an AI OCR and exam-analysis assistant. You receive an image of a student's handwritten or printed exam paper and must extract it into structured data.

TASK:
- Identify all questions and student answers
- Detect the question type (multiple-choice, true-false, short-answer, essay)
- Estimate point values when visible
- Preserve the student's exact text for their answers (do not auto-correct spelling unless clearly stated)

OUTPUT FORMAT: Valid JSON only (no code fences) with this shape:
{
  "studentName": "string | null",
  "assessmentTitle": "string | null",
  "detectedDate": "string | null",
  "questions": [
    {
      "number": "string",
      "type": "multiple-choice | true-false | short-answer | essay",
      "prompt": "string",
      "studentAnswer": "string",
      "points": number | null
    }
  ],
  "warnings": ["string"]
}

- If handwriting is illegible, include a warning rather than guessing.
- If you cannot detect the student or assessment, return null for those fields.
- Always return valid JSON.`;

// ==================== EXPANDED PROMPT BUILDERS ====================

export function buildOrthodoxBibleUserPrompt(
  message: string,
  conversationHistory: Array<{ role: string; parts: Array<{ text: string }> }>
): string {
  const lastExchanges = Array.isArray(conversationHistory) ? conversationHistory.slice(-6) : [];
  const safeMessage = sanitizeForPrompt(message, 4000);
  const transcript = lastExchanges
    .map((turn) => {
      const role = turn?.role === 'user' ? 'Student' : 'Companion';
      const text = Array.isArray(turn?.parts)
        ? turn.parts.map((p) => sanitizeForPrompt(p?.text, 2000)).join(' ')
        : '';
      return `${role}: ${text}`;
    })
    .filter((line) => line.length > 5)
    .join('\n');
  return `Recent conversation:\n${transcript || '(no prior turns)'}\n\nCurrent student message:\n${safeMessage}`;
}

export function buildEarlyWarningPrompt(students: unknown[]): string {
  const safe = Array.isArray(students) ? students.slice(0, 200) : [];
  return `Analyze the following roster and return the JSON array described in the system prompt.\n\nStudents:\n${JSON.stringify(
    safe,
    null,
    2
  )}`;
}

export function buildProgressReportPrompt(input: {
  studentName: string;
  gradesData: any[];
  attendanceData: {
    total: number;
    present: number;
    absent: number;
    late: number;
  };
  reportPeriod?: string;
}): string {
  const name = sanitizeForPrompt(input.studentName, 200);
  const grades = prepareGradesData(input.gradesData);
  const att = input.attendanceData;
  const rate =
    att && att.total > 0 ? (((att.present || 0) + (att.late || 0)) / att.total) * 100 : 0;
  const period = sanitizeForPrompt(input.reportPeriod ?? 'Current Term', 120);
  return `Generate a parent-facing progress report for:\n\nStudent: ${name}\nReport Period: ${period}\n\nGrades:\n${JSON.stringify(
    grades,
    null,
    2
  )}\n\nAttendance:\n- Total: ${att?.total ?? 0}\n- Present: ${att?.present ?? 0}\n- Absent: ${att?.absent ?? 0}\n- Late: ${att?.late ?? 0}\n- Attendance Rate: ${rate.toFixed(1)}%`;
}

export function buildQuizGeneratorPrompt(input: {
  topic: string;
  gradeLevel: string;
  questionCount: number;
  difficulty: string;
  questionTypes: string;
}): string {
  const topic = sanitizeForPrompt(input.topic, 400);
  const grade = sanitizeForPrompt(input.gradeLevel, 80);
  const difficulty = sanitizeForPrompt(input.difficulty, 40);
  const questionTypes = sanitizeForPrompt(input.questionTypes, 120);
  const count = Math.max(1, Math.min(50, Number(input.questionCount) || 10));
  return `Create a quiz:\n\nTopic: ${topic}\nGrade Level: ${grade}\nNumber of Questions: ${count}\nDifficulty: ${difficulty}\nQuestion Types: ${questionTypes}\n\nGenerate both the quiz and a separate answer key.`;
}

export function buildLessonPlanPrompt(input: {
  topic: string;
  subject: string;
  gradeLevel: string;
  duration: string;
  objectives?: string;
}): string {
  return `Create a detailed lesson plan:\n\nTopic: ${sanitizeForPrompt(
    input.topic,
    400
  )}\nSubject: ${sanitizeForPrompt(input.subject, 120)}\nGrade Level: ${sanitizeForPrompt(
    input.gradeLevel,
    80
  )}\nDuration: ${sanitizeForPrompt(input.duration, 80)}${
    input.objectives ? `\nLearning Objectives: ${sanitizeForPrompt(input.objectives, 800)}` : ''
  }\n\nProvide a complete, classroom-ready lesson plan.`;
}

export function buildParentEmailPrompt(input: {
  studentName: string;
  parentName?: string;
  emailType: 'progress' | 'concern' | 'achievement' | 'attendance';
  context: string;
  recentGrades?: any[];
  attendanceData?: unknown;
}): string {
  const student = sanitizeForPrompt(input.studentName, 200);
  const parent = sanitizeForPrompt(input.parentName ?? 'Parent/Guardian', 200);
  const context = sanitizeForPrompt(input.context, 4000);
  const grades = input.recentGrades ? prepareGradesData(input.recentGrades as any[]) : [];
  return `Draft a ${input.emailType} email:\n\nStudent: ${student}\nParent/Guardian: ${parent}\nContext: ${context}\n\nRecent Grades:\n${JSON.stringify(
    grades,
    null,
    2
  )}\n\nAttendance:\n${JSON.stringify(input.attendanceData ?? {}, null, 2)}`;
}

export function buildCurriculumGapPrompt(input: {
  className?: string;
  students: any[];
  timeRange?: string;
}): string {
  const safeStudents = Array.isArray(input.students) ? input.students.slice(0, 200) : [];
  return `Analyze curriculum gaps for this class:\n\nClass: ${sanitizeForPrompt(
    input.className ?? 'All Students',
    200
  )}\nTime Range: ${sanitizeForPrompt(input.timeRange ?? 'Recent term', 120)}\n\nStudent Performance Data:\n${JSON.stringify(
    safeStudents,
    null,
    2
  )}`;
}

export function buildVoiceCommandPrompt(transcript: string, contextHint?: string): string {
  return `Teacher said: "${sanitizeForPrompt(transcript, 1200)}"${
    contextHint ? `\n\nContext: ${sanitizeForPrompt(contextHint, 400)}` : ''
  }`;
}

// ==================== TOOL DECLARATIONS (function calling) ====================

export const VOICE_COMMAND_TOOLS = [
  {
    name: 'mark_attendance',
    description: 'Mark a student as present, absent, late, or excused for a given date',
    parameters: {
      type: 'OBJECT' as const,
      properties: {
        studentName: { type: 'STRING' as const, description: 'Full name of the student' },
        status: {
          type: 'STRING' as const,
          description: 'Attendance status',
          enum: ['present', 'absent', 'late', 'excused'],
        },
        date: {
          type: 'STRING' as const,
          description: 'Date in YYYY-MM-DD format. Use today if not specified.',
        },
      },
      required: ['studentName', 'status'],
    },
  },
  {
    name: 'add_grade',
    description: 'Add a grade entry for a student assignment',
    parameters: {
      type: 'OBJECT' as const,
      properties: {
        studentName: { type: 'STRING' as const, description: 'Full name of the student' },
        assignmentName: { type: 'STRING' as const, description: 'Name of the assignment' },
        score: { type: 'NUMBER' as const, description: 'Score achieved' },
        totalPoints: { type: 'NUMBER' as const, description: 'Total possible points' },
        category: {
          type: 'STRING' as const,
          description: 'Assignment category',
          enum: ['Quiz', 'Test', 'Homework', 'Project', 'Exam'],
        },
      },
      required: ['studentName', 'assignmentName', 'score', 'totalPoints'],
    },
  },
  {
    name: 'get_student_info',
    description: 'Look up a student profile with recent grades and attendance',
    parameters: {
      type: 'OBJECT' as const,
      properties: {
        studentName: {
          type: 'STRING' as const,
          description: 'Full or partial name of the student to search for',
        },
      },
      required: ['studentName'],
    },
  },
  {
    name: 'switch_tab',
    description: 'Navigate to a specific tab in the LMS application',
    parameters: {
      type: 'OBJECT' as const,
      properties: {
        tabName: {
          type: 'STRING' as const,
          description: 'Name of the tab',
          enum: [
            'dashboard',
            'grades',
            'attendance',
            'registration',
            'users',
            'ai-agent',
            'assessments',
            'scanner',
          ],
        },
      },
      required: ['tabName'],
    },
  },
  {
    name: 'generate_report',
    description: 'Generate an AI-powered progress report for a student',
    parameters: {
      type: 'OBJECT' as const,
      properties: {
        studentName: { type: 'STRING' as const, description: 'Full name of the student' },
      },
      required: ['studentName'],
    },
  },
  {
    name: 'generate_quiz',
    description: 'Generate a quiz on a specific topic',
    parameters: {
      type: 'OBJECT' as const,
      properties: {
        topic: { type: 'STRING' as const, description: 'Topic for the quiz' },
        questionCount: {
          type: 'NUMBER' as const,
          description: 'Number of questions (default 10)',
        },
        difficulty: {
          type: 'STRING' as const,
          description: 'Difficulty level',
          enum: ['easy', 'medium', 'hard'],
        },
      },
      required: ['topic'],
    },
  },
  {
    name: 'draft_email',
    description: 'Draft a parent communication email about a student',
    parameters: {
      type: 'OBJECT' as const,
      properties: {
        studentName: { type: 'STRING' as const, description: 'Full name of the student' },
        emailType: {
          type: 'STRING' as const,
          description: 'Type of email',
          enum: ['progress', 'concern', 'achievement', 'attendance'],
        },
      },
      required: ['studentName', 'emailType'],
    },
  },
];
