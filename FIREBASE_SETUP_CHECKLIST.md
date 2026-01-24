# Firebase Setup Checklist

## 🎯 Current Status
- ✅ Firebase CLI installed (v15.4.0)
- ⏳ Firebase project needs to be created
- ⏳ Configuration needs to be added

---

## 📝 Step-by-Step Instructions

### 1. Create Firebase Project (5 min)

Open this link: **https://console.firebase.google.com**

1. Click **"Add project"** button
2. Enter project name: `lms-church-app`
3. Click **"Continue"**
4. Disable Google Analytics (optional)
5. Click **"Create project"**
6. Wait 30-60 seconds
7. Click **"Continue"**

---

### 2. Enable Authentication (2 min)

In your new project:

1. Left sidebar → Click **"Authentication"**
2. Click **"Get started"**
3. Click **"Email/Password"** provider
4. Toggle **Enable** switch ON
5. Click **"Save"**

---

### 3. Enable Firestore Database (2 min)

1. Left sidebar → Click **"Firestore Database"**
2. Click **"Create database"**
3. Select **"Start in production mode"**
4. Choose location: **us-central** (or closest to you)
   - ⚠️ Cannot be changed later!
5. Click **"Enable"**
6. Wait 30-60 seconds

---

### 4. Get Firebase Configuration (3 min)

1. Click **gear icon ⚙️** next to "Project Overview"
2. Click **"Project settings"**
3. Scroll down to **"Your apps"** section
4. Click the **`</>`** Web icon
5. Enter nickname: `LMS Web App`
6. Leave "Firebase Hosting" unchecked
7. Click **"Register app"**

You'll see configuration like this:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "lms-church-app.firebaseapp.com",
  projectId: "lms-church-app",
  storageBucket: "lms-church-app.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};
```

**📋 COPY ALL THESE VALUES!**

---

### 5. Update Your Local Files

After you have the config, come back and I'll help you update:
- `src/config.ts` - Add your Firebase config
- `.firebaserc` - Add your project ID

---

## ⏭️ After Configuration

Once you provide the config, we'll:
1. ✅ Login to Firebase CLI
2. ✅ Install dependencies
3. ✅ Deploy security rules
4. ✅ Start the dev server
5. ✅ Test your login page!

---

## 💡 Quick Tips

- **API keys are PUBLIC** - They're safe to commit to Git
- **Security is enforced** by Firestore rules, not by hiding keys
- **Choose location carefully** - It cannot be changed later
- **Use a clear project name** - You'll reference it often

---

## 🆘 Need Help?

If you get stuck, just let me know which step you're on!
