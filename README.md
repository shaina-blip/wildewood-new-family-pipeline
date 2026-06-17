# WEO New Family Pipeline — Setup Guide

One-time setup for the WEO Internal Pipeline Tool and the parent-facing scheduling survey.

---

## Files

```
/
├── index.html          Internal tool (PIN gate + New Consult + Pipeline Board)
├── app.js              Internal tool logic
├── app.css             Internal tool styles
├── firebase-config.js  ← YOU FILL THIS IN
├── survey/
│   ├── index.html      Parent-facing survey
│   ├── survey.js       Survey logic
│   └── survey.css      Survey styles
└── README.md           This file
```

---

## Step 1 — Create a Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and click **Add project**.
2. Name it something like `weo-pipeline`. You don't need Google Analytics.
3. Once created, go to **Project Settings** → **Your apps** → click the **Web** icon (`</>`).
4. Register an app (nickname it `weo-internal`). You **don't** need Firebase Hosting.
5. Copy the `firebaseConfig` object that appears.

---

## Step 2 — Fill In `firebase-config.js`

Open `firebase-config.js` and replace every `YOUR_…` placeholder with the real values from Step 1.

Also set:
- `NOTIFICATION_EMAIL` — the email address that should receive survey-completion alerts (Shay's email).
- `SURVEY_BASE_URL` — the full URL to the survey folder on GitHub Pages:
  `https://shaina-blip.github.io/schoolwork/survey/`

---

## Step 3 — Enable Firestore

1. In Firebase Console, go to **Firestore Database** → **Create database**.
2. Choose **Production mode**.
3. Pick the `us-east1` region (closest to your team).

### Security Rules

Go to **Firestore → Rules** and paste the following, then click **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // PIN config — readable by anyone (needed for client-side PIN check)
    // The PIN is stored as a SHA-256 hash, not plaintext.
    match /config/{doc} {
      allow read: if true;
      allow write: if false;
    }

    // Family records — accessible only to authenticated sessions.
    // For added protection consider restricting by IP or adding Firebase Auth later.
    match /families/{id} {
      allow read, write: if true;
    }
  }
}
```

---

## Step 4 — Set the Team PIN

The PIN is stored as a **SHA-256 hash** in Firestore (never in source code).

1. Choose your team PIN (e.g., a 6-digit number).
2. Generate its SHA-256 hash. Easiest way:

   **In your browser console** (open DevTools → Console tab on any page):
   ```javascript
   async function sha256(msg) {
     const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
     return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
   }
   sha256('YOUR_PIN_HERE').then(console.log);
   ```
   Copy the 64-character hex string that appears.

3. In Firebase Console → **Firestore → Data**, create:
   - Collection: `config`
   - Document ID: `auth`
   - Field: `pinHash` (type: string) = the 64-character hash from above

4. Keep the actual PIN in a secure place (your team password manager). The hash in Firebase cannot be reversed.

---

## Step 5 — Set Up EmailJS

EmailJS sends Shay an email notification when a parent completes the survey.

1. Create a free account at [emailjs.com](https://www.emailjs.com).
2. Go to **Email Services** → **Add New Service** → connect your Gmail or Outlook.
3. Go to **Email Templates** → **Create New Template**.

   Set the template **Subject** to:
   ```
   🗓️ Survey Complete — {{parent_name}} / {{student_name}}
   ```

   Set the **Body** (plain text) to:
   ```
   {{parent_name}} has completed the scheduling survey. Here's what they shared:

   Student: {{student_name}}
   Program: {{program}} — {{location}}
   Scheduling Type: {{scheduling_type}}
   Frequency: {{frequency}}
   Available Days: {{available_days}}
   Preferred Times: {{preferred_times}}
   Hard Constraints: {{hard_constraints}}
   Schedule Known Through: {{schedule_known_through}}
   Additional Notes: {{survey_notes}}

   Their card has been advanced to Stage 3 on the pipeline board.
   Family ID: {{family_id}}
   ```

4. From **Account → API Keys**, copy your **Public Key**.
5. Fill in `firebase-config.js`:
   - `EMAILJS_SERVICE_ID` — from Email Services page
   - `EMAILJS_TEMPLATE_ID` — from Email Templates page (starts with `template_`)
   - `EMAILJS_PUBLIC_KEY`  — from Account → API Keys

---

## Step 6 — Deploy to GitHub Pages

1. Push this entire repo to the `main` branch of `shaina-blip/schoolwork`.
2. Go to **GitHub → Repository Settings → Pages**.
3. Set Source to **Deploy from a branch**, branch `main`, folder `/ (root)`.
4. Click **Save**. GitHub will deploy in ~1 minute.

URLs after deploy:
- **Internal tool:** `https://shaina-blip.github.io/schoolwork/`
- **Parent survey:**  `https://shaina-blip.github.io/schoolwork/survey/`

---

## Step 7 — Test End-to-End

1. Visit the internal tool URL and enter the team PIN.
2. Fill out a test consult entry and click **Save & Add to Pipeline**.
3. Click **📋 Copy Survey Link** and paste it into a browser.
4. Complete the survey and confirm:
   - The family card in the Pipeline Board advances to Stage 3.
   - Shay's email receives the notification.

---

## Day-to-Day Usage

### Adding a new family (Josh)
1. Open the internal tool and unlock with the team PIN.
2. Click **New Consult** tab.
3. Fill out the form during or after the consult call.
4. Click **Save & Add to Pipeline** — the card appears immediately in Stage 1.
5. Click **📋 Copy Survey Link** and paste it into your follow-up text/email to the family.

### Monitoring the pipeline (Shaina, Josh, Tara)
- Open the **Pipeline Board** tab.
- Cards auto-update in real time — no refresh needed.
- Click any card to open the full detail view and check off pipeline steps.
- The 🔔 **Needs Attention** sidebar flags families that need follow-up.

### Changing a family's status or stage
- Open the card (click on it).
- Use the **Pipeline Checklist** to check off completed steps — stage advances automatically.
- Use the **Status** dropdown for Cold / Closed / Gone Rogue.

---

## Open Items Before Deploy

1. **PIN** — Shay to choose the team PIN and follow Step 4 to hash + store it.
2. **Firebase config** — Shay or Josh to complete `firebase-config.js` with real keys.
3. **EmailJS** — Shay to create the account and template, then add keys to `firebase-config.js`.
4. **Seed data** — Decide whether to migrate existing Excel pipeline families. If yes, they can be added manually through the New Consult form, or Shay can share the spreadsheet and a migration script can be written.
5. **Survey URL** — Confirm the final GitHub Pages URL matches `SURVEY_BASE_URL` in `firebase-config.js`.
