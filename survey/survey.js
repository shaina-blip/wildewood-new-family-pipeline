'use strict';

// ─── State ───────────────────────────────────────────────
let db;
let familyId   = '';
let parentName = 'there';
let studentName = 'your student';
let familyData = {};     // pre-fetched from Firestore (program, location, etc.)
let surveyData = {};     // collected answers

// ─── Boot ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  familyId    = params.get('id')      || '';
  parentName  = decodeURIComponent(params.get('family')  || 'there');
  studentName = decodeURIComponent(params.get('student') || 'your student');

  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  emailjs.init(EMAILJS_PUBLIC_KEY);

  // Identity is always collected on the survey itself now. Pre-fill the
  // fields if an old personalized link (?family / ?student) was used.
  const knownParent  = params.get('family')  ? parentName  : '';
  const knownStudent = params.get('student') ? studentName : '';
  if (knownParent)  document.getElementById('s1-parent-name').value  = knownParent;
  if (knownStudent) document.getElementById('s1-student-name').value = knownStudent;
  if (!familyId) parentName = ''; // collected from the form

  // Inject names (default placeholders until collected)
  document.querySelectorAll('.parent-name').forEach(el  => { el.textContent = parentName || 'there'; });
  document.querySelectorAll('.student-name').forEach(el => { el.textContent = studentName; });

  // Pre-fetch family record to get program/location/frequency
  if (familyId) {
    try {
      const doc = await db.collection('families').doc(familyId).get();
      if (doc.exists) {
        familyData = doc.data();
        // Pre-select comm preference if already set
        if (familyData.preferredComm) {
          const radio = document.querySelector(`input[name="s1-comm"][value="${familyData.preferredComm}"]`);
          if (radio) radio.checked = true;
        }
        // Pre-select frequency if set
        if (familyData.sessionFrequency) {
          const radio = document.querySelector(`input[name="s3-frequency"][value="${familyData.sessionFrequency}"]`);
          if (radio) radio.checked = true;
        }
      }
    } catch (err) {
      console.warn('Could not pre-fetch family data:', err);
    }
  }

  wireSection1();
  wireSection2();
  wireSection3();
  wireSection4();

  showSection(1);
});

// ─── Section Navigation ───────────────────────────────────
function showSection(n) {
  document.querySelectorAll('.survey-section').forEach(s => { s.hidden = true; });
  const section = document.getElementById(`section-${n}`);
  if (section) {
    section.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  const pct = Math.round((n / 5) * 100);
  document.getElementById('progress-bar').style.width   = `${pct}%`;
  document.getElementById('progress-label').textContent = n <= 5 ? `Step ${n} of 5` : 'Complete!';
}

// ─── Section 1: Welcome ───────────────────────────────────
function wireSection1() {
  // Toggle meeting vs. survey path
  document.querySelectorAll('input[name="s1-method"]').forEach(r => {
    r.addEventListener('change', () => {
      const isMeeting = document.querySelector('input[name="s1-method"]:checked')?.value === 'meeting';
      document.getElementById('s1-meeting-path').hidden = !isMeeting;
      document.getElementById('s1-survey-path').hidden  = isMeeting;
    });
  });

  // Reveal the phone field only when Text or Phone Call is chosen
  document.querySelectorAll('input[name="s1-comm"]').forEach(r => {
    r.addEventListener('change', () => {
      const comm = document.querySelector('input[name="s1-comm"]:checked')?.value;
      document.getElementById('s1-phone-card').hidden = !(comm === 'Text' || comm === 'Phone');
    });
  });

  document.getElementById('s1-next').addEventListener('click', () => {
    const parent  = (document.getElementById('s1-parent-name').value  || '').trim();
    const email   = (document.getElementById('s1-email').value        || '').trim();
    const student = (document.getElementById('s1-student-name').value || '').trim();
    const comm    = document.querySelector('input[name="s1-comm"]:checked')?.value || '';
    const phone   = (document.getElementById('s1-phone').value        || '').trim();

    if (!parent)  { alert('Please enter your name so we know who to reach.'); return; }
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) { alert('Please enter a valid email address.'); return; }
    if (!student) { alert("Please enter the student's name."); return; }
    if ((comm === 'Text' || comm === 'Phone') && !phone) {
      alert('Please add a phone number so we can reach you that way.'); return;
    }

    parentName  = parent;
    studentName = student;
    surveyData.parentName    = parent;
    surveyData.studentName   = student;
    surveyData.email         = email.toLowerCase();
    surveyData.phone         = phone;
    surveyData.preferredComm = comm;

    // Reflect the collected names throughout the survey
    document.querySelectorAll('.parent-name').forEach(el  => { el.textContent = parentName; });
    document.querySelectorAll('.student-name').forEach(el => { el.textContent = studentName; });

    showSection(2);
  });
}

// ─── Section 2: Scheduling Style ─────────────────────────
function wireSection2() {
  document.getElementById('s2-back').addEventListener('click', () => showSection(1));
  document.getElementById('s2-next').addEventListener('click', () => {
    const q1 = document.querySelector('input[name="q1"]:checked');
    const q2 = document.querySelector('input[name="q2"]:checked');
    const q3 = document.querySelector('input[name="q3"]:checked');

    if (!q1 || !q2 || !q3) {
      alert('Please answer all three questions before continuing.');
      return;
    }

    surveyData.q1 = parseInt(q1.value);
    surveyData.q2 = parseInt(q2.value);
    surveyData.q3 = parseInt(q3.value);
    surveyData.schedulingType = classify(surveyData.q1, surveyData.q2, surveyData.q3);

    showSection(3);
  });
}

function classify(q1, q2, q3) {
  const veryCount = [q1, q2, q3].filter(v => v === 0).length;
  const flexCount = [q1, q2, q3].filter(v => v === 2).length;
  if (veryCount >= 2) return 'Structured';
  if (flexCount >= 2) return 'On-demand';
  return 'Flexible with preferences';
}

// ─── Section 3: Availability ──────────────────────────────
function wireSection3() {
  // Day chips
  document.querySelectorAll('.day-chip').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('selected'));
  });

  // Time chips
  document.querySelectorAll('.time-chip').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('selected'));
  });

  // Schedule horizon toggle
  document.querySelectorAll('input[name="s3-sched-known"]').forEach(r => {
    r.addEventListener('change', () => {
      document.getElementById('sched-through-container').hidden =
        document.querySelector('input[name="s3-sched-known"]:checked')?.value !== 'yes';
    });
  });

  document.getElementById('s3-back').addEventListener('click', () => showSection(2));
  document.getElementById('s3-next').addEventListener('click', () => {
    const days  = Array.from(document.querySelectorAll('.day-chip.selected')).map(c => c.dataset.day);
    const times = Array.from(document.querySelectorAll('.time-chip.selected')).map(c => c.dataset.time);
    const schedKnown = document.querySelector('input[name="s3-sched-known"]:checked')?.value;

    surveyData.availableDays       = days;
    surveyData.preferredTimes      = times;
    surveyData.hardConstraints     = (document.getElementById('s3-constraints')?.value || '').trim();
    surveyData.scheduleKnownThrough = schedKnown === 'yes'
      ? (document.getElementById('s3-sched-through')?.value || '').trim()
      : '';
    surveyData.sessionFrequency    = document.querySelector('input[name="s3-frequency"]:checked')?.value || 'Not sure yet';

    showSection(4);
  });
}

// ─── Section 4: Anything Else ─────────────────────────────
function wireSection4() {
  document.getElementById('s4-back').addEventListener('click', () => showSection(3));
  document.getElementById('s4-next').addEventListener('click', () => {
    surveyData.surveyNotes = (document.getElementById('s4-notes')?.value || '').trim();
    buildSummary();
    showSection(5);
  });
}

// ─── Section 5: Summary ───────────────────────────────────
function buildSummary() {
  const typeLabels = {
    'Structured':              'consistent recurring sessions at the same time each week',
    'Flexible with preferences': 'a flexible schedule while keeping some preferences',
    'On-demand':               'flexible on-demand scheduling'
  };

  const program  = familyData.program  || '';
  const location = familyData.location || '';
  const freq     = surveyData.sessionFrequency || 'TBD';
  const typeStr  = typeLabels[surveyData.schedulingType] || 'flexible scheduling';
  const daysStr  = surveyData.availableDays?.length  ? surveyData.availableDays.join(', ')  : 'any day';
  const timesStr = surveyData.preferredTimes?.length ? surveyData.preferredTimes.join(', ') : 'flexible times';

  const programPart  = program  ? ` in the <strong>${esc(program)}</strong> program` : '';
  const locationPart = location ? ` at <strong>${esc(location)}</strong>`            : '';

  const summaryEl = document.getElementById('summary-text');
  summaryEl.innerHTML = `
    <p>You're looking for <strong>${freq}</strong> sessions for <strong>${esc(studentName)}</strong>${programPart}${locationPart}.</p>

    <p>You prefer <strong>${typeStr}</strong> and are available <strong>${esc(daysStr)}</strong>,
    typically in the <strong>${esc(timesStr)}</strong>.</p>

    ${surveyData.hardConstraints
      ? `<p>You mentioned: <em>"${esc(surveyData.hardConstraints)}"</em></p>`
      : ''}

    ${surveyData.scheduleKnownThrough
      ? `<p>Your schedule is confirmed through <strong>${esc(surveyData.scheduleKnownThrough)}</strong>.</p>`
      : ''}

    <p>We'll put together a proposed schedule and reach out within <strong>1 business day</strong> to confirm.</p>`;

  // Wire summary buttons (remove old listeners first to avoid double-fire)
  const editBtn   = document.getElementById('s5-edit');
  const submitBtn = document.getElementById('s5-submit');

  const freshEdit   = editBtn.cloneNode(true);
  const freshSubmit = submitBtn.cloneNode(true);
  editBtn.parentNode.replaceChild(freshEdit, editBtn);
  submitBtn.parentNode.replaceChild(freshSubmit, submitBtn);

  freshEdit.addEventListener('click',   () => showSection(3));
  freshSubmit.addEventListener('click', submitSurvey);
}

// ─── Submit ───────────────────────────────────────────────
async function submitSurvey() {
  const submitBtn = document.getElementById('s5-submit');
  submitBtn.disabled    = true;
  submitBtn.textContent = 'Submitting…';

  const now = firebase.firestore.Timestamp.now();

  // Readable labels for the three scheduling-style questions, so the
  // pipeline card can show each preference plainly (not just the blended type).
  const SAME_TIME_LABELS  = { 0: 'Very important', 1: 'Somewhat important', 2: 'Not important' };
  const SAME_TUTOR_LABELS = { 0: 'Wants one consistent tutor', 1: 'Prefers one, but flexible', 2: 'Any tutor is fine' };
  const PLANNING_LABELS   = { 0: 'Can commit to a recurring weekly slot', 1: 'Knows schedule 1-2 weeks ahead', 2: 'Books week to week' };

  const update = {
    parentName:          surveyData.parentName        || parentName || '',
    studentName:         surveyData.studentName       || studentName || '',
    email:               surveyData.email             || '',
    phone:               surveyData.phone             || '',
    schedulingType:      surveyData.schedulingType      || '',
    sameTimePref:        SAME_TIME_LABELS[surveyData.q1]  || '',
    sameTutorPref:       SAME_TUTOR_LABELS[surveyData.q2] || '',
    planningPref:        PLANNING_LABELS[surveyData.q3]   || '',
    availableDays:       surveyData.availableDays        || [],
    preferredTimes:      surveyData.preferredTimes       || [],
    hardConstraints:     surveyData.hardConstraints      || '',
    scheduleKnownThrough:surveyData.scheduleKnownThrough || '',
    sessionFrequency:    surveyData.sessionFrequency     || '',
    surveyNotes:         surveyData.surveyNotes          || '',
    preferredComm:       surveyData.preferredComm        || '',
    surveyComplete:      true,
    surveyCompletedAt:   now,
    updatedAt:           now
  };

  // The email is the primary handoff (read it to create the Noto lead).
  // The database write is a non-fatal backup, so the survey still completes
  // even if Firebase is ever turned off after the pipeline retires.
  // sendToNoto pushes the lead straight into Noto's API when configured.
  const emailOk = await sendEmail(update);
  const dbOk    = await saveToFirestore(update);
  const notoOk  = await sendToNoto(update);
  console.log('Submit results:', { emailOk, dbOk, notoOk });

  if (emailOk || dbOk || notoOk) {
    showSection(6);
    document.getElementById('progress-bar').style.width = '100%';
    document.getElementById('progress-label').textContent = 'Complete!';
  } else {
    submitBtn.disabled    = false;
    submitBtn.textContent = '✅ This looks right — submit';
    alert('There was a problem submitting. Please try again, or email us directly at ' + NOTIFICATION_EMAIL + '.');
  }
}

// Backup record in Firestore. Returns true on success, false on failure
// (never throws — a failure here must not block the submission).
async function saveToFirestore(update) {
  try {
    if (familyId) {
      await db.collection('families').doc(familyId).update(update);
      return true;
    }
    // Match an existing awaiting-survey record by email, else add a new one.
    let matched = false;
    if (update.email) {
      const snap = await db.collection('families')
        .where('email', '==', update.email)
        .where('surveyComplete', '==', false)
        .limit(1)
        .get();
      if (!snap.empty) {
        await snap.docs[0].ref.update(update);
        matched = true;
      }
    }
    if (!matched) {
      await db.collection('families').add({
        ...update,
        pendingMatch: true,
        createdAt:    firebase.firestore.Timestamp.now(),
        consultDate:  firebase.firestore.Timestamp.now(),
        status:       'active',
        monthTab:     '',
      });
    }
    return true;
  } catch (err) {
    console.warn('Firestore save failed (non-fatal):', err);
    return false;
  }
}

// Push the response straight into Noto via the noto-lead-worker Cloudflare
// Worker. No-op until NOTO_WORKER_URL is configured. Returns true on success,
// false on any failure (never throws — must not block the confirmation flow).
async function sendToNoto(data) {
  if (typeof NOTO_WORKER_URL === 'undefined' || !NOTO_WORKER_URL) return false;
  try {
    const res = await fetch(NOTO_WORKER_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parentName:           data.parentName,
        studentName:          data.studentName,
        email:                data.email,
        phone:                data.phone,
        preferredComm:        data.preferredComm,
        schedulingType:       data.schedulingType,
        sameTimePref:         data.sameTimePref,
        sameTutorPref:        data.sameTutorPref,
        planningPref:         data.planningPref,
        availableDays:        data.availableDays,
        preferredTimes:       data.preferredTimes,
        hardConstraints:      data.hardConstraints,
        scheduleKnownThrough: data.scheduleKnownThrough,
        sessionFrequency:     data.sessionFrequency,
        surveyNotes:          data.surveyNotes,
      }),
    });
    if (!res.ok) {
      console.warn('Noto lead create failed:', res.status, await res.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Noto lead create failed (non-fatal):', err);
    return false;
  }
}

async function sendEmail(data) {
  const days  = (data.availableDays  || []).join(', ') || 'None specified';
  const times = (data.preferredTimes || []).join(', ') || 'None specified';

  // A complete plain-text digest — everything needed to create the Noto lead
  // in one block, so nothing is lost regardless of the email template layout.
  const fullSummary =
`NEW SCHEDULING SURVEY — ${data.studentName || 'Unknown student'}

CONTACT
• Parent:  ${data.parentName || '—'}
• Student: ${data.studentName || '—'}
• Email:   ${data.email || '—'}
• Phone:   ${data.phone || '—'}
• Prefers contact by: ${data.preferredComm || '—'}

SCHEDULING PREFERENCES
• Style:            ${data.schedulingType || '—'}
• Same time weekly: ${data.sameTimePref  || 'Not answered'}
• Same tutor:       ${data.sameTutorPref || 'Not answered'}
• Plans ahead:      ${data.planningPref  || 'Not answered'}
• Frequency:        ${data.sessionFrequency || '—'}

AVAILABILITY
• Days:  ${days}
• Times: ${times}
• Never available: ${data.hardConstraints || 'None noted'}
• Schedule known through: ${data.scheduleKnownThrough || 'Open-ended'}

NOTES
${data.surveyNotes || 'None'}`;

  const params = {
    parent_name:            data.parentName  || '',
    student_name:           data.studentName || '',
    parent_email:           data.email || '',
    parent_phone:           data.phone || '',
    preferred_comm:         data.preferredComm || '',
    program:                familyData.program   || 'TBD',
    location:               familyData.location  || 'TBD',
    scheduling_type:        data.schedulingType,
    same_time_pref:         data.sameTimePref  || 'Not answered',
    same_tutor_pref:        data.sameTutorPref || 'Not answered',
    planning_pref:          data.planningPref  || 'Not answered',
    frequency:              data.sessionFrequency,
    available_days:         days,
    preferred_times:        times,
    hard_constraints:       data.hardConstraints     || 'None noted',
    schedule_known_through: data.scheduleKnownThrough || 'Open-ended',
    survey_notes:           data.surveyNotes          || 'None',
    full_summary:           fullSummary,
    family_id:              familyId
  };

  // Recipients: always the team inbox, plus a Noto intake address if one is
  // configured (email-to-lead), so responses can flow straight into Noto.
  const recipients = [NOTIFICATION_EMAIL];
  if (typeof NOTO_INTAKE_EMAIL !== 'undefined' && NOTO_INTAKE_EMAIL) {
    recipients.push(NOTO_INTAKE_EMAIL);
  }

  let anySent = false;
  for (const to of recipients) {
    try {
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, { ...params, to_email: to });
      anySent = true;
    } catch (err) {
      console.warn(`EmailJS send to ${to} failed:`, err);
    }
  }
  return anySent;
}

// ─── Helpers ─────────────────────────────────────────────
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
