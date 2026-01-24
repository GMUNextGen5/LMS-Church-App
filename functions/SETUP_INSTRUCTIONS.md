# Quick Setup Script for Gemini API Key

## For Local Development

The API key has been set up in `functions/.env` file (which is gitignored for security).

## For Production Deployment

You need to set the environment variable in Firebase. Here are your options:

### Option 1: Firebase Console (Easiest)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Functions** → **Configuration** → **Environment Variables**
4. Click **Add variable**
5. Name: `GEMINI_API_KEY`
6. Value: `YOUR_GEMINI_API_KEY` (get from https://makersuite.google.com/app/apikey)
7. Click **Save**
8. Redeploy functions: `firebase deploy --only functions`

### Option 2: Firebase CLI

Run this command in your terminal:

```bash
firebase functions:config:set gemini.api_key="YOUR_GEMINI_API_KEY"
firebase deploy --only functions
```

### Option 3: Using Firebase Functions Secrets (Most Secure)

```bash
# Set the secret (you'll be prompted to enter the value)
# Replace YOUR_GEMINI_API_KEY with your actual API key
echo "YOUR_GEMINI_API_KEY" | firebase functions:secrets:set GEMINI_API_KEY

# Then update functions/src/index.ts to use secrets (see API_KEY_SETUP.md)
```

## Verify Setup

After setting up, test it:

1. **Local Testing:**
   ```bash
   cd functions
   npm run serve
   ```

2. **Check Logs:**
   ```bash
   firebase functions:log
   ```

3. **Test in App:**
   - Log in as a student
   - Go to Dashboard
   - Click "AI Performance Summary" or "Get Study Tips"
   - Check browser console and Firebase logs for any errors

## Security Reminders

✅ **DO:**
- Keep `.env` file in `.gitignore` (already done)
- Use environment variables for production
- Rotate keys if exposed

❌ **DON'T:**
- Commit API keys to git
- Share API keys publicly
- Hardcode keys in source code

## Troubleshooting

If AI features don't work:

1. **Check if key is set:**
   ```bash
   # Local
   cat functions/.env
   
   # Production
   firebase functions:config:get
   ```

2. **Check logs:**
   ```bash
   firebase functions:log --only getPerformanceSummary
   ```

3. **Verify key format:**
   - Should start with `AIza`
   - Should be about 39 characters long
   - No spaces or quotes

4. **Test API key directly:**
   Visit: https://makersuite.google.com/app/apikey
   Make sure your key is active and has Gemini API access enabled

