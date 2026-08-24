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
const EMAILJS_SERVICE_ID  = "service_l9mx95t";
const EMAILJS_TEMPLATE_ID = "template_cj0dhqm";         // survey completion → internal team notification
const EMAILJS_ASSIGNMENT_TEMPLATE_ID = "template_vz9rnq1"; // owner assignment notification
const EMAILJS_PUBLIC_KEY  = "qghGWe4KNOpRWqn86";

// Optional: EmailJS template that sends the FAMILY a copy of their own
// survey responses (separate from the internal notification template
// above). Leave blank until you've created this template in EmailJS.
const EMAILJS_PARENT_TEMPLATE_ID = "";

// Email addresses that receive survey-completion notifications
const NOTIFICATION_EMAIL = "shaina@wildewoodeducation.com";
const OPERATIONS_EMAIL   = "operations@wildewoodeducation.com";

// Optional: Noto's email-to-lead intake address. When set, each survey
// response is also emailed here so it flows straight into Noto. Leave blank
// until you have that address from Noto (Settings → intake / integrations).
const NOTO_INTAKE_EMAIL = "";

// Optional: URL of the deployed noto-lead-worker Cloudflare Worker. When set,
// each survey response is POSTed here to create a lead in Noto via its API.
// Leave blank until the Worker is deployed (see noto-lead-worker.js).
const NOTO_WORKER_URL = "https://noto-lead-worker.shaina-4f5.workers.dev";

// Full URL to the parent-facing survey folder (including trailing slash)
// After deploying to GitHub Pages this will be:
const SURVEY_BASE_URL = "https://shaina-blip.github.io/wildewood-new-family-pipeline/survey/";
