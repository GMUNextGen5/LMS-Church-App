# AI System Documentation

## Overview

The AI system provides intelligent analysis of student performance and personalized study recommendations using Google's Gemini AI. All AI processing happens server-side through Firebase Cloud Functions for security and performance.

## Architecture

### Current Structure

```
Client (Browser)
  ↓
Firebase Cloud Functions (Server)
  ↓
Google Gemini AI API
```

### Files Structure

- **`functions/src/ai-config.ts`**: Centralized AI configuration, prompts, and data preparation helpers
- **`functions/src/index.ts`**: Cloud Functions that handle AI requests
- **`src/main.ts`**: Client-side functions that call Cloud Functions

## Key Features

1. **Performance Summary**: Analyzes grades and attendance to provide comprehensive performance insights
2. **Study Tips**: Generates personalized study recommendations based on performance patterns

## Configuration

### API Key Setup

Set the Gemini API key as an environment variable:

```bash
firebase functions:config:set gemini.api_key="YOUR_API_KEY"
```

Or set it directly in Firebase Console under Functions > Configuration > Environment Variables.

### Model Configuration

Edit `functions/src/ai-config.ts` to change:
- Model selection (`gemini-1.5-flash`, `gemini-1.5-pro`, etc.)
- Temperature (creativity level)
- Max tokens (response length)
- Other generation parameters

## System Prompts

System prompts are defined in `functions/src/ai-config.ts`:

- `PERFORMANCE_SUMMARY_SYSTEM_PROMPT`: Defines AI behavior for performance analysis
- `STUDY_TIPS_SYSTEM_PROMPT`: Defines AI behavior for study recommendations

### Customizing Prompts

To customize AI behavior, edit the prompts in `ai-config.ts`. The prompts include:
- Role definition
- Guidelines for tone and format
- Structure requirements
- Output formatting instructions

## Migration Path to Dedicated API Service

The codebase is structured to make migration easy:

### 1. System Prompts

**Current**: Defined in `functions/src/ai-config.ts`

**Migration**: 
- Move prompts to environment variables or database
- Update `functions/src/index.ts` to fetch prompts from new location
- Marked with `TODO: When migrating prompts to database`

### 2. API Calls

**Current**: Direct calls to Gemini API in Cloud Functions

**Migration**:
- Create dedicated API service endpoint
- Replace Gemini API calls with calls to your service
- Marked with `TODO: When migrating to dedicated API service`

### 3. Client Calls

**Current**: Calls Firebase Cloud Functions

**Migration**:
- Update `src/main.ts` to call new API endpoint
- Replace `httpsCallable` with `fetch` or API client
- Marked with `TODO: When migrating to dedicated API service`

## Debugging

### Client-Side Debugging

Check browser console for:
- `🤖 [generatePerformanceSummary]` logs
- `🤖 [generateStudyTips]` logs
- Error messages with error codes

### Server-Side Debugging

Check Cloud Functions logs for:
- `🤖 [getPerformanceSummary]` logs
- `🤖 [getStudyTips]` logs
- `📊` Data fetching logs
- `🔧` Data preparation logs
- `📝` Prompt structure logs
- `❌` Error logs with full context

### Common Issues

1. **"AI service is not configured"**
   - Check `GEMINI_API_KEY` is set in Firebase Functions config
   - Verify API key is valid

2. **"No grades available"**
   - Ensure student has grades in Firestore
   - Check studentId is correct

3. **"Permission denied"**
   - Verify user has access to student data
   - Check Cloud Functions logs for access check details

4. **API errors**
   - Check Gemini API status
   - Verify API key has sufficient quota
   - Review error logs for specific error codes

## Data Flow

### Performance Summary

1. Client calls `generatePerformanceSummary(studentId)`
2. Cloud Function `getPerformanceSummary`:
   - Validates authentication and permissions
   - Fetches grades (last 20) and attendance (last 30)
   - Prepares data using `prepareGradesData()` and `prepareAttendanceData()`
   - Builds prompt using `buildPerformanceSummaryPrompt()`
   - Calls Gemini API with system and user prompts
   - Returns HTML-formatted summary

### Study Tips

1. Client calls `generateStudyTips(studentId)`
2. Cloud Function `getStudyTips`:
   - Validates authentication and permissions
   - Fetches grades (last 15)
   - Analyzes performance by category using `calculateCategoryAverages()`
   - Builds prompt using `buildStudyTipsPrompt()`
   - Calls Gemini API with system and user prompts
   - Returns HTML-formatted tips

## Security

- All AI processing happens server-side
- API keys are stored securely in Firebase Functions config
- Access control enforced via `checkStudentAccess()`
- FERPA-compliant data handling
- No student data exposed to client unnecessarily

## Performance Considerations

- Grades limited to 20 for performance summary
- Grades limited to 15 for study tips
- Attendance limited to 30 records
- Response caching can be added if needed
- Rate limiting handled by Gemini API

## Future Enhancements

- Cache AI responses for frequently accessed students
- Add more AI features (assignment feedback, grade predictions)
- Support multiple AI providers
- A/B testing for prompt variations
- Analytics on AI usage and effectiveness

