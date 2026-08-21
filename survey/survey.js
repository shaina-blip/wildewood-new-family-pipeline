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
    const term    = document.getElementById('s1-term')?.value || '';
    const comm    = document.querySelector('input[name="s1-comm"]:checked')?.value || '';
    const phone   = (document.getElementById('s1-phone').value        || '').trim();

    if (!parent)  { alert('Please enter your name so we know who to reach.'); return; }
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) { alert('Please enter a valid email address.'); return; }
    if (!student) { alert("Please enter the student's name."); return; }
    if (!term)    { alert("Please let us know what you're scheduling for."); return; }
    if ((comm === 'Text' || comm === 'Phone') && !phone) {
      alert('Please add a phone number so we can reach you that way.'); return;
    }

    parentName  = parent;
    studentName = student;
    surveyData.parentName    = parent;
    surveyData.studentName   = student;
    surveyData.email         = email.toLowerCase();
    surveyData.phone         = phone;
    surveyData.term          = term;
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
const DAY_ORDER          = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const AFTER_SCHOOL_TIMES = ['3-4pm', '3:30-4:30pm', '4-5pm', '4:30-5:30pm', '5-6pm', '5:30-6:30pm', '6-7pm', '6:30-7:30pm', 'After 7:30pm'];
const DAYTIME_TIMES      = ['8-10am', '10am-Noon', '12-3pm'];
const ALL_TIME_WINDOWS   = [...AFTER_SCHOOL_TIMES, ...DAYTIME_TIMES];

// { Monday: Set(['3-4pm', ...]), ... } — which times are picked for each day
let dayTimeSelections = {};

function renderDayTimePanels() {
  const selectedDays = Array.from(document.querySelectorAll('.day-chip.selected')).map(c => c.dataset.day);
  const panelsEl  = document.getElementById('day-time-panels');
  const emptyHint = document.getElementById('day-time-empty');

  // Forget times for any day that's no longer selected.
  Object.keys(dayTimeSelections).forEach(day => {
    if (!selectedDays.includes(day)) delete dayTimeSelections[day];
  });

  emptyHint.hidden = selectedDays.length > 0;

  const orderedDays = DAY_ORDER.filter(d => selectedDays.includes(d));

  panelsEl.innerHTML = orderedDays.map(day => {
    const picked = dayTimeSelections[day] || new Set();
    const chips = ALL_TIME_WINDOWS.map(t => {
      const label = DAYTIME_TIMES.includes(t) ? `${t} <small>(daytime)</small>` : t;
      const sel   = picked.has(t) ? ' selected' : '';
      return `<button type="button" class="time-chip${sel}" data-day="${day}" data-time="${t}">${label}</button>`;
    }).join('');
    return `
      <div class="card day-time-panel">
        <span class="day-time-panel-heading">${day}</span>
        <div class="chip-grid">${chips}</div>
      </div>`;
  }).join('');

  panelsEl.querySelectorAll('.time-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const day  = chip.dataset.day;
      const time = chip.dataset.time;
      if (!dayTimeSelections[day]) dayTimeSelections[day] = new Set();
      if (dayTimeSelections[day].has(time)) {
        dayTimeSelections[day].delete(time);
        chip.classList.remove('selected');
      } else {
        dayTimeSelections[day].add(time);
        chip.classList.add('selected');
      }
    });
  });
}

function wireSection3() {
  // Day chips — toggling a day shows/hides its own time panel below
  document.querySelectorAll('.day-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
      renderDayTimePanels();
    });
  });
  renderDayTimePanels(); // initial render (empty until a day is picked)

  // Schedule horizon toggle
  document.querySelectorAll('input[name="s3-sched-known"]').forEach(r => {
    r.addEventListener('change', () => {
      document.getElementById('sched-through-container').hidden =
        document.querySelector('input[name="s3-sched-known"]:checked')?.value !== 'yes';
    });
  });

  document.getElementById('s3-back').addEventListener('click', () => showSection(2));
  document.getElementById('s3-next').addEventListener('click', () => {
    const selectedDays = Array.from(document.querySelectorAll('.day-chip.selected')).map(c => c.dataset.day);
    const schedKnown   = document.querySelector('input[name="s3-sched-known"]:checked')?.value;

    if (!selectedDays.length) { alert('Please pick at least one day you could work with.'); return; }

    const incompleteDay = selectedDays.find(d => !dayTimeSelections[d] || dayTimeSelections[d].size === 0);
    if (incompleteDay) {
      alert(`Please pick at least one time for ${incompleteDay}, or deselect that day.`);
      return;
    }

    const orderedDays = DAY_ORDER.filter(d => selectedDays.includes(d));
    const dayAvailability = {};
    orderedDays.forEach(d => { dayAvailability[d] = Array.from(dayTimeSelections[d]); });

    // Flattened union fields kept for backward compatibility (e.g. Noto's
    // existing "Available Days" / "Preferred times" fields, which don't
    // know about per-day detail).
    const allTimes = new Set();
    orderedDays.forEach(d => dayAvailability[d].forEach(t => allTimes.add(t)));

    surveyData.dayAvailability     = dayAvailability;
    surveyData.availableDays       = orderedDays;
    surveyData.preferredTimes      = Array.from(allTimes);
    surveyData.availabilityDetail  = orderedDays.map(d => `${d}: ${dayAvailability[d].join(', ')}`).join(' | ');

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

  const programPart  = program  ? ` in the <strong>${esc(program)}</strong> program` : '';
  const locationPart = location ? ` at <strong>${esc(location)}</strong>`            : '';

  const termPart = surveyData.term ? ` for <strong>${esc(surveyData.term)}</strong>` : '';

  const dayAvailability = surveyData.dayAvailability || {};
  const dayListHtml = Object.keys(dayAvailability).length
    ? `<ul style="margin:.5rem 0 0; padding-left:1.25rem;">${
        Object.entries(dayAvailability).map(([day, times]) =>
          `<li><strong>${esc(day)}</strong>: ${esc(times.join(', '))}</li>`
        ).join('')
      }</ul>`
    : '<p style="margin:.5rem 0 0;">any day, flexible times</p>';

  const summaryEl = document.getElementById('summary-text');
  summaryEl.innerHTML = `
    <p>You're looking for <strong>${freq}</strong> sessions for <strong>${esc(studentName)}</strong>${programPart}${locationPart}${termPart}.</p>

    <p>You prefer <strong>${typeStr}</strong>, and here's your availability by day:</p>
    ${dayListHtml}

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

  // Honeypot — real visitors never see or fill this field. If it's filled,
  // silently show the normal "thank you" screen without sending anything,
  // so bots get no signal that they were caught.
  const honeypot = document.getElementById('s1-hp')?.value || '';
  if (honeypot) {
    showSection(6);
    document.getElementById('progress-bar').style.width = '100%';
    document.getElementById('progress-label').textContent = 'Complete!';
    return;
  }

  submitBtn.disabled    = true;
  submitBtn.textContent = 'Submitting…';

  const now = firebase.firestore.Timestamp.now();

  // Readable labels for the three scheduling-style questions, so Noto and
  // the notification email show each preference plainly (not just the
  // blended type).
  const SAME_TIME_LABELS  = { 0: 'Very important', 1: 'Somewhat important', 2: 'Not important' };
  const SAME_TUTOR_LABELS = { 0: 'Wants one consistent tutor', 1: 'Prefers one, but flexible', 2: 'Any tutor is fine' };
  const PLANNING_LABELS   = { 0: 'Can commit to a recurring weekly slot', 1: 'Knows schedule 1-2 weeks ahead', 2: 'Books week to week' };

  const update = {
    parentName:          surveyData.parentName        || parentName || '',
    studentName:         surveyData.studentName       || studentName || '',
    email:               surveyData.email             || '',
    phone:               surveyData.phone             || '',
    term:                surveyData.term              || '',
    schedulingType:      surveyData.schedulingType      || '',
    sameTimePref:        SAME_TIME_LABELS[surveyData.q1]  || '',
    sameTutorPref:       SAME_TUTOR_LABELS[surveyData.q2] || '',
    planningPref:        PLANNING_LABELS[surveyData.q3]   || '',
    availableDays:       surveyData.availableDays        || [],
    preferredTimes:      surveyData.preferredTimes       || [],
    dayAvailability:     surveyData.dayAvailability       || {},
    availabilityDetail:  surveyData.availabilityDetail    || '',
    hardConstraints:     surveyData.hardConstraints      || '',
    scheduleKnownThrough:surveyData.scheduleKnownThrough || '',
    sessionFrequency:    surveyData.sessionFrequency     || '',
    surveyNotes:         surveyData.surveyNotes          || '',
    preferredComm:       surveyData.preferredComm        || '',
    surveyComplete:      true,
    surveyCompletedAt:   now,
    updatedAt:           now
  };

  // The email is a reliable backup record. sendToNoto pushes the lead
  // straight into Noto's API when configured. The Firestore write is a
  // non-fatal archive, so the survey still completes even if Firebase
  // is ever turned off.
  const emailOk = await sendEmail(update);
  const dbOk    = await saveToFirestore(update);
  const notoOk  = await sendToNoto(update);
  sendFamilyCopy(update); // fire-and-forget — never blocks or gates success
  console.log('Submit results:', { emailOk, dbOk, notoOk });

  // Only promise the family a copy if that template is actually configured.
  const copyNote = document.getElementById('thankyou-copy-note');
  if (copyNote) copyNote.hidden = !(typeof EMAILJS_PARENT_TEMPLATE_ID !== 'undefined' && EMAILJS_PARENT_TEMPLATE_ID);

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

// Scheduling-related fields worth preserving in history when a returning
// family overwrites them with a new term's answers.
const HISTORY_FIELDS = [
  'term', 'schedulingType', 'sameTimePref', 'sameTutorPref', 'planningPref',
  'availableDays', 'preferredTimes', 'dayAvailability', 'availabilityDetail',
  'hardConstraints', 'scheduleKnownThrough', 'sessionFrequency', 'surveyNotes',
  'preferredComm', 'surveyCompletedAt'
];

// Archives a record's current scheduling answers into responseHistory (if it
// already completed a survey before), then applies the new answers on top —
// so the new term's answers are what Noto and the team see, while nothing
// from a prior term is lost.
async function archiveAndApply(ref, update) {
  const snap  = await ref.get();
  const prior = snap.exists ? snap.data() : null;
  const payload = { ...update };

  if (prior && prior.surveyComplete) {
    const archived = {};
    HISTORY_FIELDS.forEach(f => { if (prior[f] !== undefined) archived[f] = prior[f]; });
    payload.responseHistory = firebase.firestore.FieldValue.arrayUnion(archived);
  }

  await ref.update(payload);
}

// Backup record in Firestore. Returns true on success, false on failure
// (never throws — a failure here must not block the submission).
async function saveToFirestore(update) {
  try {
    if (familyId) {
      await archiveAndApply(db.collection('families').doc(familyId), update);
      return true;
    }

    // No personalized link — match an existing family by email regardless of
    // survey-completion status, so a returning family (e.g. resubmitting for
    // a new term) updates their own record instead of creating a duplicate.
    let targetRef = null;
    if (update.email) {
      const snap = await db.collection('families').where('email', '==', update.email).get();
      if (!snap.empty) {
        // Most recently created match, in case more than one exists.
        const docs = snap.docs.slice().sort((a, b) => {
          const at = a.data().createdAt?.toMillis?.() || 0;
          const bt = b.data().createdAt?.toMillis?.() || 0;
          return bt - at;
        });
        targetRef = docs[0].ref;
      }
    }

    if (targetRef) {
      await archiveAndApply(targetRef, update);
    } else {
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
        term:                 data.term,
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
  const byDay = data.availabilityDetail
    ? data.availabilityDetail.split(' | ').map(line => `  - ${line}`).join('\n')
    : '  None specified';

  // A complete plain-text digest — everything needed to create the Noto lead
  // in one block, so nothing is lost regardless of the email template layout.
  const fullSummary =
`NEW SCHEDULING SURVEY — ${data.studentName || 'Unknown student'}
Scheduling for: ${data.term || 'Not specified'}

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

AVAILABILITY BY DAY
${byDay}
• Never available: ${data.hardConstraints || 'None noted'}
• Schedule known through: ${data.scheduleKnownThrough || 'Open-ended'}

NOTES
${data.surveyNotes || 'None'}`;

  const params = {
    parent_name:            data.parentName  || '',
    student_name:           data.studentName || '',
    parent_email:           data.email || '',
    parent_phone:           data.phone || '',
    term:                   data.term || 'Not specified',
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
    availability_by_day:    byDay,
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

// Emails the family a plain-language copy of their own responses. Uses a
// separate, family-facing EmailJS template (EMAILJS_PARENT_TEMPLATE_ID) —
// no-op until that template is created and configured. Never blocks or
// gates the submission; failures here are silent.
async function sendFamilyCopy(data) {
  if (typeof EMAILJS_PARENT_TEMPLATE_ID === 'undefined' || !EMAILJS_PARENT_TEMPLATE_ID) return;
  if (!data.email) return;

  const byDay = data.availabilityDetail
    ? data.availabilityDetail.split(' | ').join('\n')
    : 'Not specified';

  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_PARENT_TEMPLATE_ID, {
      to_email:      data.email,
      parent_name:   data.parentName  || 'there',
      student_name:  data.studentName || 'your student',
      term:          data.term || 'Not specified',
      frequency:     data.sessionFrequency || 'Not sure yet',
      availability_by_day:    byDay,
      hard_constraints:       data.hardConstraints     || 'None noted',
      schedule_known_through: data.scheduleKnownThrough || 'Open-ended',
      survey_notes:  data.surveyNotes || 'None',
    });
  } catch (err) {
    console.warn('Family copy email failed (non-fatal):', err);
  }
}

// ─── Helpers ─────────────────────────────────────────────
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
