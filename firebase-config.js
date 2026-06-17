// firebase-config.js
// Fill in your Firebase project values before deploying.
// Get these from: Firebase Console → Project Settings → Your apps → Web app

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// EmailJS — get from emailjs.com → Account → API Keys
const EMAILJS_SERVICE_ID  = "YOUR_EMAILJS_SERVICE_ID";
const EMAILJS_TEMPLATE_ID = "YOUR_EMAILJS_TEMPLATE_ID";
const EMAILJS_PUBLIC_KEY  = "YOUR_EMAILJS_PUBLIC_KEY";

// Email address that receives survey-completion notifications (Shay)
const NOTIFICATION_EMAIL = "shay@wildewoodeducation.com";

// Full URL to the parent-facing survey folder (including trailing slash)
// After deploying to GitHub Pages this will be:
const SURVEY_BASE_URL = "https://shaina-blip.github.io/schoolwork/survey/";
