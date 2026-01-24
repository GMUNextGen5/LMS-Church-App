# Student Account Linking Guide

## 🎯 Overview

This guide explains how to link students to their Firebase Auth accounts so they can log in and see their own grades, attendance, and data.

---

## 📋 The Complete Workflow

### Step 1: Student Creates Account
**WHO:** The student themselves  
**WHERE:** Main login page  

1. Student goes to `http://localhost:3000` (or your deployed URL)
2. Student clicks **"Sign Up"**
3. Student enters:
   - Email (e.g., `john.doe@student.edu`)
   - Password (min 6 characters)
4. Student submits form
5. ✅ Firebase creates account with **role = student** (automatic default)
6. 🔑 Firebase Auth assigns a **UID** (e.g., `abc123xyz789`)

**IMPORTANT:** Student MUST complete this step FIRST before admin can link them!

---

### Step 2: Admin Registers Student Record
**WHO:** Administrator  
**WHERE:** Student Registration tab  

1. Admin logs in with admin account
2. Admin goes to **"Student Registration"** tab
3. Admin fills in student details:
   - **Student Name**: John Doe
   - **Membership ID**: STU001
   - **Year of Birth**: 2010
   - **Contact Phone**: +1 (555) 123-4567
   - **Contact Email**: parent@email.com
   - **Link to Student Account**: ⭐ **SELECT from dropdown**
     - Click the dropdown
     - Find student's email (e.g., `john.doe@student.edu - student`)
     - Select it
   - **Notes**: Optional additional information

4. Admin clicks **"Register Student"**
5. ✅ Student record created in Firestore with:
   ```javascript
   {
     name: "John Doe",
     memberId: "STU001",
     studentUid: "abc123xyz789", // ⭐ Links to Firebase Auth UID
     parentUid: "abc123xyz789",   // Same for now
     // ... other fields
   }
   ```

---

### Step 3: Student Logs In
**WHO:** The student  
**WHERE:** Main login page  

1. Student goes to login page
2. Student enters their email and password
3. Student clicks **"Login"**
4. ✅ System automatically:
   - Authenticates with Firebase Auth
   - Fetches student record where `studentUid == their UID`
   - Loads grades, attendance for that student
   - Shows ONLY their own data

---

## 🔧 How It Works Technically

### Data Structure

```
Firebase Auth Users
├── abc123xyz789 (UID)
    ├── email: "john.doe@student.edu"
    ├── role: "student"
    └── (other auth fields)

Firestore Database
├── /users/{abc123xyz789}
│   ├── email: "john.doe@student.edu"
│   ├── role: "student"
│   └── createdAt: "2025-01-07..."
│
└── /students/{studentRecordId}
    ├── name: "John Doe"
    ├── memberId: "STU001"
    ├── studentUid: "abc123xyz789" ⭐ CRITICAL LINK
    ├── parentUid: "abc123xyz789"
    ├── /grades (subcollection)
    │   ├── {gradeId1}: { score: 95, ... }
    │   └── {gradeId2}: { score: 87, ... }
    └── /attendance (subcollection)
        ├── {attendanceId1}: { status: "present", ... }
        └── {attendanceId2}: { status: "present", ... }
```

### Security Rules

```javascript
// Firestore Security Rules
match /students/{studentId} {
  // Student can read ONLY their own record
  allow read: if request.auth.uid == resource.data.studentUid
              || request.auth.uid == resource.data.parentUid
              || isAdmin()
              || isTeacher();
}
```

---

## 🐛 Debugging Guide

### Problem: Student can't see any data after logging in

**CHECK:**

1. **Does student have a Firebase Auth account?**
   - Go to Firebase Console → Authentication → Users
   - Verify student's email is in the list
   - Note their UID

2. **Does student have a student record?**
   - Go to Firebase Console → Firestore → students collection
   - Find student's record
   - Check `studentUid` field

3. **Do UIDs match?**
   - Firebase Auth UID: `abc123xyz789`
   - Firestore `studentUid`: `abc123xyz789`
   - ✅ MUST BE EXACTLY THE SAME

4. **Check Console Logs:**
   Open browser console (F12) and look for:
   ```
   🔍 [fetchStudents] Fetching students for: {uid: "abc123xyz789", role: "student"}
   🎓 [fetchStudents] Student mode: fetching own record only
   📊 [fetchStudents] Query returned 1 records
   ✅ [fetchStudents] Student found their own record
   ```

5. **If you see "No student record found!" warning:**
   - Student record doesn't exist OR
   - `studentUid` doesn't match their Firebase Auth UID

---

### Problem: Dropdown is empty when registering student

**CHECK:**

1. **Are Cloud Functions deployed?**
   - Functions needed: `getAllUsers`
   - Run: `firebase deploy --only functions`
   - Note: Requires Blaze (pay-as-you-go) plan

2. **Is billing enabled?**
   - Cloud Functions require Blaze plan
   - Free tier includes: 2M invocations/month

3. **Check Console Logs:**
   ```
   🔍 [populateStudentAccountDropdown] Fetching all registered accounts...
   ✅ [populateStudentAccountDropdown] Loaded 5 accounts into dropdown
   ```

4. **If error appears:**
   - "Make sure Cloud Functions are deployed and billing is enabled"
   - Deploy functions: `firebase deploy --only functions`

---

### Problem: "Permission denied" errors

**CHECK:**

1. **Firestore Security Rules deployed?**
   ```bash
   firebase deploy --only firestore:rules
   ```

2. **User has correct role?**
   - Check `/users/{uid}` document
   - `role` field must be: `admin`, `teacher`, or `student`

3. **Console Logs show:**
   ```
   🔒 [fetchGrades] Permission denied - check Firestore security rules
   ```

---

## 💡 Best Practices

### For Administrators

1. ✅ **Students create accounts FIRST**
   - Share signup link with students
   - Wait for them to register
   - Then link them in admin panel

2. ✅ **Verify email addresses**
   - Make sure you select correct student from dropdown
   - Double-check email matches

3. ✅ **Use Membership IDs**
   - Helps identify students
   - Shown in dropdowns: "John Doe (ID: STU001)"

4. ✅ **Check console logs**
   - Open browser console (F12)
   - Look for emoji indicators:
     - ✅ = Success
     - ❌ = Error
     - ⚠️ = Warning
     - 🔍 = Debug info

### For Students

1. ✅ **Create account BEFORE contacting admin**
   - Use school/organization email
   - Remember your password
   - Write down your email address

2. ✅ **Contact admin AFTER account creation**
   - Tell admin your exact email address
   - Admin will link your account

3. ✅ **Log in with correct credentials**
   - Use email you signed up with
   - Password is case-sensitive

---

## 🔒 Security Features

1. **Role-Based Access Control**
   - Students see ONLY their own data
   - Teachers see students in their courses
   - Admins see all students

2. **FERPA Compliance**
   - Students can't access other students' records
   - Parents can access only their children's records
   - Enforced by Firestore security rules

3. **Server-Side Enforcement**
   - Security rules run on Firebase servers
   - Can't be bypassed by client code
   - Always enforced, even with dev tools

---

## 📊 Console Log Reference

### Success Indicators
- ✅ Operation completed successfully
- 👑 Admin operation
- 👨‍🏫 Teacher operation
- 🎓 Student operation
- 📊 Data fetched
- 🔗 Account linked

### Debug Indicators
- 🔍 Fetching/searching data
- 📝 Creating/updating data
- 🔄 Refreshing data
- 💡 Helpful tip

### Warning Indicators
- ⚠️ Warning (non-critical)
- 🔒 Permission/security issue

### Error Indicators
- ❌ Critical error
- 🚫 Operation failed

---

## 📞 Support

If you encounter issues:

1. Check browser console (F12) for detailed logs
2. Verify Firestore data in Firebase Console
3. Check security rules are deployed
4. Ensure Cloud Functions are working
5. Verify billing is enabled (for functions)

All operations include detailed console logs with emoji indicators for easy debugging!

