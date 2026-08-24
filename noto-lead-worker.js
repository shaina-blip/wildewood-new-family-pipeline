/**
 * noto-lead-worker.js
 *
 * Cloudflare Worker: receives a POST from the scheduling survey (GitHub Pages,
 * static site) and creates a lead card in Noto via POST /api/v1/leads.
 *
 * The Noto API key never touches the browser — it's a Worker secret, set with:
 *   wrangler secret put NOTO_API_KEY
 *
 * Deploy this Worker with its own config:
 *   wrangler deploy --config wrangler-noto.toml
 *
 * ── SETUP REQUIRED BEFORE THIS WORKS ─────────────────────────────────────
 * 1. In Noto: create custom field definitions for any survey field that
 *    isn't a native member field (see CUSTOM_FIELD_IDS below). For any
 *    dropdown/multi-select field, the options configured in Noto must match
 *    the survey's option strings exactly, or the API returns a 400.
 * 2. Call GET /api/v1/custom-fields to get each definition_id, fill in below.
 * 3. Call GET /api/v1/stages to get the stage_id for new survey leads.
 * 4. Call GET /api/v1/staff to get assigned_to_staff_id (or use
 *    ASSIGN_BY_EMAIL instead — see config below).
 * 5. Deploy: wrangler deploy --config wrangler-noto.toml
 * 6. Point the survey's submitSurvey() at this Worker's URL by setting
 *    NOTO_WORKER_URL in firebase-config.js.
 * ──────────────────────────────────────────────────────────────────────────
 */

// ─── CONFIG — fill these in after running the GET lookups above ───────────

const NOTO_BASE_URL = "https://app.withnoto.com/api/v1";

// The CRM stage new survey leads land in — "Survey Completed" (board: Leads).
const STAGE_ID = 5968;

// EITHER set a staff id (from GET /api/v1/staff) OR an email to assign by.
// Only one of these two should be non-null. Assigning by email to Shaina.
const ASSIGN_STAFF_ID = null;
const ASSIGN_STAFF_EMAIL = "shaina@wildewoodeducation.com";

// Map each non-native survey field to its Noto custom_fields definition_id.
// Get these from GET /api/v1/custom-fields after creating the fields in Noto.
// Fields left as `null` are skipped (not sent) until you fill them in.
const CUSTOM_FIELD_IDS = {
  preferredComm: 5915,        // Preferred Communication Method (TEXT)
  schedulingType: 5966,       // Scheduling Style
  sameTimePref: 5967,         // Same time each week?
  sameTutorPref: 5969,        // Tutor consistency preference
  planningPref: 5970,         // Planning horizon
  availableDays: 5971,        // Available Days (MULTI_SELECT)
  preferredTimes: 5972,       // Preferred times (MULTI_SELECT)
  hardConstraints: 5974,      // Never available (TEXT)
  scheduleKnownThrough: 5975, // Schedule known through (TEXT)
  sessionFrequency: 5973,     // Session frequency
  surveyNotes: 5524,          // Additional Information Before Consultation (TEXT)
};

// Only allow requests from an actual survey origin. Add/remove entries here
// any time the survey moves to a new domain — nothing else needs to change.
const ALLOWED_ORIGINS = [
  "https://shaina-blip.github.io",
  "https://wildewood-education.github.io",
];

// ────────────────────────────────────────────────────────────────────────

/**
 * Very simple "first token / rest" name split. Survey collects a single
 * full-name string; Noto wants first_name + last_name separately.
 * Adjust this if your survey ever starts collecting first/last separately.
 */
function splitName(fullName) {
  const trimmed = (fullName || "").trim();
  if (!trimmed) return { first_name: "", last_name: "" };
  const parts = trimmed.split(/\s+/);
  const first_name = parts[0];
  const last_name = parts.slice(1).join(" ") || first_name; // fallback if only one word
  return { first_name, last_name };
}

/**
 * Builds the custom_fields array for the dependent (student), including
 * only fields that have a configured definition_id and a non-empty value.
 */
function buildCustomFields(payload) {
  const fields = [];
  for (const [surveyKey, definitionId] of Object.entries(CUSTOM_FIELD_IDS)) {
    if (definitionId == null) continue; // not configured yet — skip
    const value = payload[surveyKey];
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    fields.push({ definition_id: definitionId, value });
  }
  return fields;
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request, env) {
    // Echo back the caller's origin only if it's on the allow-list — this is
    // what actually lets the browser accept the response. Previously this
    // always echoed a single hardcoded origin, so calls from any other
    // allowed domain were silently blocked by the browser's CORS check.
    const requestOrigin = request.headers.get("Origin") || "";
    const origin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];

    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    let payload;
    try {
      payload = await request.json();
    } catch (err) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    // Minimal validation — adjust required fields as needed
    const required = ["parentName", "studentName", "email"];
    const missing = required.filter((f) => !payload[f]);
    if (missing.length > 0) {
      return new Response(
        JSON.stringify({ error: `Missing required field(s): ${missing.join(", ")}` }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
      );
    }

    if (!STAGE_ID) {
      return new Response(
        JSON.stringify({ error: "Worker misconfigured: STAGE_ID not set" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
      );
    }

    const guardianName = splitName(payload.parentName);
    const studentName = splitName(payload.studentName);

    const notoPayload = {
      stage_id: STAGE_ID,
      ...(ASSIGN_STAFF_ID
        ? { assigned_to_staff_id: ASSIGN_STAFF_ID }
        : { assigned_to_staff_email: ASSIGN_STAFF_EMAIL }),
      lead_name: `${studentName.first_name} ${studentName.last_name} — Scheduling Survey`,
      note: payload.surveyNotes || undefined,
      guardian: {
        first_name: guardianName.first_name,
        last_name: guardianName.last_name,
        email: payload.email, // match key — repeat submissions upsert this guardian
        phone_number: payload.phone || undefined,
      },
      dependent: {
        first_name: studentName.first_name,
        last_name: studentName.last_name,
        custom_fields: buildCustomFields(payload),
      },
    };

    let notoResponse;
    try {
      notoResponse = await fetch(`${NOTO_BASE_URL}/leads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.NOTO_API_KEY}`,
        },
        body: JSON.stringify(notoPayload),
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Failed to reach Noto API", details: String(err) }),
        { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
      );
    }

    const notoBody = await notoResponse.json().catch(() => null);

    if (!notoResponse.ok) {
      // Surface Noto's error back so you can see validation issues while testing
      return new Response(
        JSON.stringify({ error: "Noto API error", status: notoResponse.status, details: notoBody }),
        { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
      );
    }

    return new Response(JSON.stringify({ success: true, lead: notoBody?.data }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  },
};

/**
 * Expected fetch() call from the survey's submitSurvey():
 *
 * await fetch("https://your-worker.your-subdomain.workers.dev", {
 *   method: "POST",
 *   headers: { "Content-Type": "application/json" },
 *   body: JSON.stringify({
 *     parentName, studentName, email, phone, preferredComm,
 *     schedulingType, sameTimePref, sameTutorPref, planningPref,
 *     availableDays, preferredTimes, hardConstraints,
 *     scheduleKnownThrough, sessionFrequency, surveyNotes,
 *   }),
 * });
 *
 * This runs alongside (not instead of) the existing Firestore write and
 * EmailJS call — one more fetch() in the same submit handler, wrapped so a
 * Noto failure never blocks the survey's confirmation flow.
 */
