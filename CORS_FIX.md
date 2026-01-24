# CORS Issue Fix for AI Agent

## Problem
The AI Agent is experiencing CORS errors when trying to connect to the Cloud Function from `localhost:3000`.

## Solution

The issue is that the `aiAgentChat` Cloud Function needs to be deployed. Firebase Functions v2 `onCall` functions handle CORS automatically, but the function must be deployed first.

### Steps to Fix:

1. **Deploy the Cloud Function:**
   ```bash
   cd functions
   npm run build
   firebase deploy --only functions:aiAgentChat
   ```

2. **Verify Deployment:**
   ```bash
   firebase functions:list
   ```
   You should see `aiAgentChat` in the list.

3. **Check Function URL:**
   After deployment, check the Firebase Console:
   - Go to Firebase Console > Functions
   - Find `aiAgentChat` function
   - Verify it's deployed and active

4. **If Still Having Issues:**

   **Option A: Use Functions Emulator for Local Development**
   ```bash
   # Terminal 1: Start emulator
   cd functions
   npm run serve
   
   # Terminal 2: Connect client to emulator
   # Add this to your code before initializing Firebase:
   ```
   ```typescript
   import { connectFunctionsEmulator } from 'firebase/functions';
   if (window.location.hostname === 'localhost') {
     connectFunctionsEmulator(functions, 'localhost', 5001);
   }
   ```

   **Option B: Deploy All Functions**
   ```bash
   firebase deploy --only functions
   ```

## Configuration Added

I've added explicit configuration to the `aiAgentChat` function:
- `cors: true` - Explicitly enables CORS (though onCall handles it automatically)
- `timeoutSeconds: 540` - Increased timeout for data loading
- `memory: '512MiB'` - More memory for handling large datasets

## Testing

After deployment, test the AI Agent:
1. Log in as admin
2. Go to "AI Agent" tab
3. Type a question like "How many students are there?"
4. Check browser console for any errors
5. Check Firebase Functions logs: `firebase functions:log --only aiAgentChat`

## Common Issues

1. **Function Not Deployed:** Most common issue - deploy the function first
2. **Wrong Region:** If you specified a region, make sure client connects to same region
3. **Authentication:** Make sure you're logged in as admin
4. **API Key:** Ensure GEMINI_API_KEY is set in Firebase Functions config

## Next Steps

1. Deploy the function: `firebase deploy --only functions:aiAgentChat`
2. Test the AI Agent in the app
3. Check logs if errors persist

