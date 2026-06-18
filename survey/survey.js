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

  // Inject names
  document.querySelectorAll('.parent-name').forEach(el  => { el.textContent = parentName; });
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

  document.getElementById('s1-next').addEventListener('click', () => {
    surveyData.preferredComm = document.querySelector('input[name="s1-comm"]:checked')?.value || '';
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
  return 'Flexible-with-preferences';
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
    'Flexible-with-preferences': 'a flexible schedule while keeping some preferences',
    'On-demand':               'flexible on-demand scheduling'
  };

  const program  = familyData.program  || 'your chosen program';
  const location = familyData.location || 'your chosen location';
  const freq     = surveyData.sessionFrequency || 'TBD';
  const typeStr  = typeLabels[surveyData.schedulingType] || 'flexible scheduling';
  const daysStr  = surveyData.availableDays?.length  ? surveyData.availableDays.join(', ')  : 'any day';
  const timesStr = surveyData.preferredTimes?.length ? surveyData.preferredTimes.join(', ') : 'flexible times';

  const summaryEl = document.getElementById('summary-text');
  summaryEl.innerHTML = `
    <p>You're looking for <strong>${freq}</strong> sessions for <strong>${esc(studentName)}</strong>
    in the <strong>${esc(program)}</strong> program at <strong>${esc(location)}</strong>.</p>

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

  const update = {
    schedulingType:      surveyData.schedulingType      || '',
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

  try {
    if (familyId) {
      await db.collection('families').doc(familyId).update(update);
    }
    await sendEmail(update);
    showSection(6);
    document.getElementById('progress-bar').style.width = '100%';
    document.getElementById('progress-label').textContent = 'Complete!';
  } catch (err) {
    console.error('Submit error:', err);
    submitBtn.disabled    = false;
    submitBtn.textContent = '✅ This looks right — submit';
    alert('There was a problem submitting. Please try again or contact us directly.');
  }
}

async function sendEmail(data) {
  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email:             NOTIFICATION_EMAIL,
      parent_name:          parentName,
      student_name:         studentName,
      program:              familyData.program   || 'TBD',
      location:             familyData.location  || 'TBD',
      scheduling_type:      data.schedulingType,
      frequency:            data.sessionFrequency,
      available_days:       (data.availableDays  || []).join(', ') || 'None specified',
      preferred_times:      (data.preferredTimes || []).join(', ') || 'None specified',
      hard_constraints:     data.hardConstraints     || 'None noted',
      schedule_known_through: data.scheduleKnownThrough || 'Open-ended',
      survey_notes:         data.surveyNotes          || 'None',
      family_id:            familyId
    });
  } catch (err) {
    // Non-fatal — survey was saved to Firestore successfully
    console.warn('EmailJS notification failed (non-fatal):', err);
  }
}

// ─── Helpers ─────────────────────────────────────────────
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
