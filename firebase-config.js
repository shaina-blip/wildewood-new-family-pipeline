// firebase-config.js
// Fill in your Firebase project values before deploying.
// Get these from: Firebase Console → Project Settings → Your apps → Web app

const firebaseConfig = {
  apiKey: "AIzaSyCO_fe-_iK3EY9TClPtf52yYA-NvmSEcqY",
  authDomain: "weo-new-family-pipeline.firebaseapp.com",
  projectId: "weo-new-family-pipeline",
  storageBucket: "weo-new-family-pipeline.firebasestorage.app",
  messagingSenderId: "635022856627",
  appId: "1:635022856627:web:8dcbc387e0fb4dc52e3bc6"
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
