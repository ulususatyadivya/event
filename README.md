# Gatherly — Event Management App

A responsive event management app using **Bootstrap 5, vanilla JavaScript, Firebase Authentication and Cloud Firestore**.

## Features

### Student
- Student sign up and login with Firebase Authentication.
- Student profile: name, roll number, department and email.
- Duplicate email prevention (Firebase Authentication + normalized email reservation).
- Duplicate roll number prevention (Firestore transaction).
- Browse/search campus events and register once per event.
- Registration capacity checks and a personal “Events you’re attending” dashboard.

### Admin
- No public admin sign-up.
- Admin account is created manually in Firebase Authentication, then explicitly assigned the `admin` role in Firestore.
- Create and publish events.
- View student directory and registration activity.
- Analytics: total students, events, registrations and upcoming events.

### UI
- Mobile-first responsive Bootstrap layout.
- Dark, gradient-based visual design, animated entrance, hover motion, floating note, event cards and toast messages.
- Respects reduced-motion accessibility preference.

---

## Setup in Firebase (required)

### 1. Enable Authentication
1. Open [Firebase Console](https://console.firebase.google.com/) and select project `events2026-80620`.
2. Go to **Build → Authentication → Get started**.
3. Under **Sign-in method**, enable **Email/Password**.

### 2. Create Firestore
1. Go to **Build → Firestore Database → Create database**.
2. Create the database in a region suitable for your users.
3. Open the **Rules** tab and publish the contents of `firestore.rules` from this project.

### 3. Create your admin manually (no admin sign-up screen)
1. In Firebase Console, go to **Authentication → Users → Add user**.
2. Enter the admin email and a strong password. Do not make a student account with this email.
3. Copy the admin user's **UID**.
4. In **Firestore Database → Data**, create a collection named `users`.
5. Add a document whose document ID is exactly the admin UID.
6. Add these fields:
   - `uid` — string — the exact admin UID
   - `name` — string — e.g. `Event Administrator`
   - `email` — string — the admin email
   - `role` — string — `admin`
   - `rollNumber` — string — `ADMIN`
   - `department` — string — `Administration`

Only accounts whose Firestore `users/{uid}.role` is exactly `admin` get admin UI permissions. Never allow users to edit their own role.

### 4. Run locally
Do not open `index.html` by double-clicking; ES module imports may be blocked by the browser's `file://` policy.

Using VS Code:
1. Extract the ZIP.
2. Open the project folder in VS Code.
3. Install the **Live Server** extension if needed.
4. Right-click `index.html` → **Open with Live Server**.
5. Sign up a student, then log out and sign in with the admin account to create events.

Or run a local static server from this folder:
```bash
python -m http.server 5500
```
Then visit `http://localhost:5500`.

## Data model

- `users/{uid}` — profile and role.
- `events/{eventId}` — event details, date, venue, category, capacity and registration count.
- `registrations/{studentUid_eventId}` — one registration per student per event.
- `uniqueEmails/{encodedEmail}` — email reservation for duplicate validation.
- `uniqueRollNumbers/{ROLLNUMBER}` — roll-number reservation for duplicate validation.

## Important production notes

- Firebase client config is public by design; security must come from Authentication and Firestore Security Rules, not hiding the config.
- The current duplicate-email/roll-number reservation uses client-side Firestore transactions. This is appropriate for a classroom/demo project, but the uniqueness collections are not a strong production-grade identity system: a determined authenticated client may attempt to reserve keys. For a public production deployment, enforce uniqueness through trusted Cloud Functions/Admin SDK and validate all fields server-side.
- The rules allow signed-in users to create reservation documents to enable uniqueness checks; because this is client-side, deploy a Cloud Function for robust abuse-resistant validation before production.
- For production, add App Check, server-side event capacity enforcement, admin audit logs and backups.
- Firebase free-tier quotas and console configuration apply.
- If the app reports `permission-denied`, check that Firestore rules were published and that the admin's `users/{uid}` profile document is set up exactly as above.
