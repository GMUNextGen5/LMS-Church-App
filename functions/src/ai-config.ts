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
 * 1. Check prompt logs (console.log in Cloud Functions)
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
export function sanitizeForPrompt(value: unknown, maxLength: number = MAX_PROMPT_STRING_LENGTH): string {
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
 * 
 * TODO: Move to environment variable when migrating to dedicated API service
 */
export const AI_MODEL_CONFIG = {
  model: 'gemini-2.5-flash',
  temperature: 0.7, // Creativity level (0.0 = deterministic, 1.0 = creative)
  maxTokens: 2000,   // Maximum response length
  topP: 0.95,        // Nucleus sampling parameter
  topK: 40          // Top-K sampling parameter
};

/**
 * API key is read from environment variable GEMINI_API_KEY.
 * Set it in functions/.env (see functions/.env.example). Never commit keys to the repo.
 */
export function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ GEMINI_API_KEY not set. AI features will not work.');
  }
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
  const rate = total > 0 ? ((present + late) / total * 100).toFixed(1) : '0';
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
    ? recentAssignments.slice(0, 30).map(s => sanitizeForPrompt(s, 200))
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
  return grades.slice(0, MAX_GRADES_FOR_PROMPT).map(grade => {
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
      date: grade.date
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
  const present = limited.filter(a => a && ATTENDANCE_STATUSES.has(String(a.status)) && a.status === 'present').length;
  const absent = limited.filter(a => a && ATTENDANCE_STATUSES.has(String(a.status)) && a.status === 'absent').length;
  const late = limited.filter(a => a && ATTENDANCE_STATUSES.has(String(a.status)) && a.status === 'late').length;
  const excused = limited.filter(a => a && ATTENDANCE_STATUSES.has(String(a.status)) && a.status === 'excused').length;
  const attended = present + late + excused;
  const attendanceRate = total > 0 
    ? ((attended / total) * 100).toFixed(1) 
    : '0';
  
  return {
    total,
    present,
    absent,
    late,
    excused,
    attendanceRate: attendanceRate + '%'
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
  
  limited.forEach(grade => {
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
      trend
    };
  });
}


