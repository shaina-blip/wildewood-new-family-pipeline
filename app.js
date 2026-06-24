'use strict';

// ─── State ──────────────────────────────────────────────
let db;
let allFamilies = [];
let unsubscribeFamilies = null;
let lastSavedFamilyId = null;
let currentMonth = '';
let activeView = 'pipeline';
let calendarMonth = null;

const STAGE_NAMES = {
  1: 'Consult Complete',
  2: 'Survey Sent',
  3: 'Survey Complete',
  4: 'Schedule Built',
  5: 'Schedule Confirmed',
  6: 'Confirmed & Invoiced',
  7: 'Invoice Paid',
  8: 'Active'
};

// ─── Boot ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  emailjs.init(EMAILJS_PUBLIC_KEY);

  setCurrentMonth();
  initConsultForm();
  setupTabNav();
  setupModal();
  setupSidebar();
  setupViewToggle();
  setupAuthGate();
});

// ─── Auth (Google Sign-In) ────────────────────────────────
function setupAuthGate() {
  firebase.auth().onAuthStateChanged(user => {
    if (user && isAuthorized(user)) {
      unlockApp(user);
    } else {
      if (user) {
        firebase.auth().signOut();
        showAuthError('This tool is for @wildewoodeducation.com accounts only.');
      }
      showAuthGate();
    }
  });

  document.getElementById('google-signin-btn').addEventListener('click', handleSignIn);
  document.getElementById('signout-btn').addEventListener('click', () => firebase.auth().signOut());
}

async function handleSignIn() {
  const btn   = document.getElementById('google-signin-btn');
  const errEl = document.getElementById('auth-error');
  btn.disabled  = true;
  errEl.hidden  = true;

  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ hd: 'wildewoodeducation.com' });
    await firebase.auth().signInWithPopup(provider);
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
      showAuthError('Sign-in failed — make sure popups are allowed and try again.');
      console.error(err);
    }
    btn.disabled = false;
  }
}

function isAuthorized(user) {
  return user?.email?.endsWith('@wildewoodeducation.com') ?? false;
}

function showAuthGate() {
  document.getElementById('pin-gate').hidden  = false;
  document.getElementById('main-app').hidden  = true;
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.hidden = false;
}

function unlockApp(user) {
  document.getElementById('pin-gate').hidden  = true;
  document.getElementById('main-app').hidden  = false;

  if (user) {
    const firstName = user.displayName?.split(' ')[0] || user.email.split('@')[0];
    const nameEl = document.getElementById('header-user-name');
    if (nameEl) nameEl.textContent = firstName;
  }

  initPipelineBoard();
}

// ─── Tab Navigation ──────────────────────────────────────
function setupTabNav() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(c => { c.hidden = true; });
      document.getElementById(`tab-${tab}`).hidden = false;
    });
  });
}

// ─── Consult Form ─────────────────────────────────────────
function initConsultForm() {
  // Pepper buttons
  document.querySelectorAll('.pepper-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pepper-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('leadWarmth').value = btn.dataset.value;
    });
  });

  // IEP notes toggle
  const iepCheck = document.getElementById('iepAccommodations');
  const iepNotes = document.getElementById('iepNotes');
  iepCheck.addEventListener('change', () => { iepNotes.hidden = !iepCheck.checked; });

  // Auto-assign owner + toggle next-step section from decision status
  document.getElementById('decisionStatus').addEventListener('change', function() {
    document.getElementById('currentOwner').value = ownerForDecision(this.value);
    updateNextStepDisplay(this.value);
  });

  // Dynamic additional students
  document.getElementById('add-student-btn').addEventListener('click', () => {
    const container = document.getElementById('additional-students');
    const idx = container.children.length;
    const slot = document.createElement('div');
    slot.className = 'student-slot';
    slot.innerHTML = `
      <div class="form-grid">
        <div class="form-group">
          <label>Student ${idx + 2} Name</label>
          <input type="text" class="add-student-name" autocomplete="off">
        </div>
        <div class="form-group">
          <label>Grade</label>
          <input type="text" class="add-student-grade" placeholder="e.g. 3rd">
        </div>
        <div class="form-group">
          <label>Program</label>
          <select class="add-student-program">
            <option value="">Select…</option>
            <option value="Roots">Roots</option>
            <option value="Bridge">Bridge</option>
            <option value="Launch">Launch</option>
            <option value="Gleamworks">Gleamworks</option>
            <option value="Teams">Teams</option>
          </select>
        </div>
        <div class="form-group student-slot-remove">
          <button type="button" class="btn-remove-student">× Remove</button>
        </div>
      </div>
    `;
    slot.querySelector('.btn-remove-student').addEventListener('click', () => slot.remove());
    container.appendChild(slot);
  });

  // Form submit
  document.getElementById('consult-form').addEventListener('submit', handleFormSubmit);

  // Copy survey link
  document.getElementById('copy-survey-btn').addEventListener('click', copySurveyLink);
}

const DECISION_OWNER = {
  'Decided to move forward': 'Shaina',
  'Want a trial session':    'Shaina',
  'Want to see the space':   'Shaina',
  'Need a proposal':         'Tara',
  'Need a family meeting':   'Tara',
  'Scheduled':               'Josh',
};

const SURVEY_READY = new Set(['Decided to move forward', 'Want a trial session', 'Want to see the space']);

function ownerForDecision(decision) {
  return DECISION_OWNER[decision] || (decision ? 'Josh' : '');
}

function isReadyForSurvey(f) {
  return SURVEY_READY.has(f.decisionStatus) || f.preferredContact === 'survey' || f.preferredContact === 'call-scheduled';
}

const CLOSED_STATUSES = new Set(['Not moving forward', 'Gone Rogue']);

const OWNER_EMAILS = {
  'Shaina': 'shaina@wildewoodeducation.com',
  'Tara':   'tara@wildewoodeducation.com',
  'Josh':   'josh@wildewoodeducation.com',
};

async function sendAssignmentEmail(ownerName, parentName, studentName, decisionStatus) {
  const toEmail = OWNER_EMAILS[ownerName];
  if (!toEmail || !EMAILJS_ASSIGNMENT_TEMPLATE_ID) return;
  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_ASSIGNMENT_TEMPLATE_ID, {
      to_email:        toEmail,
      owner_name:      ownerName,
      parent_name:     parentName,
      student_name:    studentName,
      decision_status: decisionStatus || '—',
      pipeline_url:    'https://shaina-blip.github.io/wildewood-new-family-pipeline/',
    });
  } catch (err) {
    console.warn('Assignment email failed (non-fatal):', err);
  }
}

function updateNextStepDisplay(decision) {
  const els = {
    survey:   document.getElementById('nextstep-survey'),
    session:  document.getElementById('nextstep-session'),
    reminder: document.getElementById('nextstep-reminder'),
    closed:   document.getElementById('nextstep-closed'),
  };
  Object.values(els).forEach(el => { if (el) el.hidden = true; });

  if (!decision || SURVEY_READY.has(decision)) {
    els.survey.hidden = false;
    const surveyRadio = document.querySelector('input[name="preferredContact"][value="survey"]');
    if (surveyRadio && !document.querySelector('input[name="preferredContact"]:checked')) surveyRadio.checked = true;
  } else if (decision === 'Scheduled') {
    els.session.hidden = false;
  } else if (CLOSED_STATUSES.has(decision)) {
    els.closed.hidden = false;
  } else {
    els.reminder.hidden = false;
  }
}

async function handleFormSubmit(e) {
  e.preventDefault();

  const btn = document.getElementById('save-btn');
  btn.disabled    = true;
  btn.textContent = 'Saving…';

  const now      = firebase.firestore.Timestamp.now();
  const programs = Array.from(document.querySelectorAll('input[name="programs"]:checked')).map(cb => cb.value);
  const additionalStudents = Array.from(document.querySelectorAll('#additional-students .student-slot')).map(slot => ({
    name:    slot.querySelector('.add-student-name')?.value?.trim()   || '',
    grade:   slot.querySelector('.add-student-grade')?.value?.trim()  || '',
    program: slot.querySelector('.add-student-program')?.value        || '',
  })).filter(s => s.name);

  const data = {
    parentName:            v('parentName'),
    studentName:           v('studentName'),
    grade:                 v('grade'),
    phone:                 v('phone'),
    email:                 v('email'),
    referralSource:        v('referralSource'),
    referredBy:            v('referredBy'),
    district:              v('district'),
    location:              v('location'),
    need:                  v('need'),
    iepAccommodations:     document.getElementById('iepAccommodations').checked,
    iepNotes:              v('iepNotes'),
    programsDiscussed:     programs,
    program:               v('program'),
    additionalStudents:    additionalStudents,
    keyFactors: {
      tutorPreference:     intOrNull('kf-tutor'),
      scheduleFlexibility: intOrNull('kf-schedule'),
      budget:              intOrNull('kf-budget')
    },
    preferredComm:         radio('preferredComm'),
    sessionFrequency:      v('sessionFrequency'),
    schedulingConstraints: v('schedulingConstraints'),
    leadWarmth:            intOrNull('leadWarmth'),
    decisionStatus:        v('decisionStatus'),
    likelihoodOfReg:       radio('likelihoodOfReg'),
    likelihoodReason:      v('likelihoodReason'),
    currentOwner:          v('currentOwner'),
    notes:                 v('notes'),
    preferredContact:      SURVEY_READY.has(v('decisionStatus'))
                             ? (radio('preferredContact') || 'survey')
                             : 'reminder',

    // Pipeline booleans (all start false)
    surveyLinkCopied:          false,
    surveyLinkCopiedAt:        null,
    surveyComplete:            false,
    surveyCompletedAt:         null,
    scheduleBuilt:             false,
    scheduleConfirmed:         false,
    locationConfirmationSent:  false,
    invoiceSent:               false,
    invoiceSentAt:             null,
    invoicePaid:               false,
    invoiceAmount:             null,
    firstSessionFollowUp:      false,

    // First session date — set directly when Scheduled
    firstSessionDate: (() => {
      const d = document.getElementById('firstSessionDateInput')?.value;
      return d && v('decisionStatus') === 'Scheduled'
        ? firebase.firestore.Timestamp.fromDate(new Date(d + 'T12:00:00'))
        : null;
    })(),

    // Calendar actions
    nextActionDate: (() => {
      if (v('decisionStatus') === 'Scheduled') {
        const d = document.getElementById('firstSessionDateInput')?.value;
        return d ? firebase.firestore.Timestamp.fromDate(addBusinessDays(new Date(d + 'T12:00:00'), 2)) : null;
      }
      const d = document.getElementById('reminderDate')?.value;
      return d && !SURVEY_READY.has(v('decisionStatus')) && !CLOSED_STATUSES.has(v('decisionStatus'))
        ? firebase.firestore.Timestamp.fromDate(new Date(d + 'T09:00:00'))
        : null;
    })(),
    nextActionNote: (() => {
      if (v('decisionStatus') === 'Scheduled') {
        return document.getElementById('firstSessionDateInput')?.value
          ? 'Follow up: check in after first session' : '';
      }
      return !SURVEY_READY.has(v('decisionStatus')) && !CLOSED_STATUSES.has(v('decisionStatus'))
        ? (document.getElementById('reminderNote')?.value || '').trim() : '';
    })(),

    // Metadata
    consultDate: now,
    createdAt:   now,
    updatedAt:   now,
    monthTab:    currentMonth,
    status:      CLOSED_STATUSES.has(v('decisionStatus'))
                   ? (v('decisionStatus') === 'Gone Rogue' ? 'gone-rogue' : 'closed')
                   : 'active'
  };

  if (!data.parentName || !data.studentName) {
    alert('Parent name and student name are required.');
    btn.disabled    = false;
    btn.textContent = 'Save & Add to Pipeline';
    return;
  }

  try {
    const ref = await db.collection('families').add(data);
    lastSavedFamilyId = ref.id;

    if (data.currentOwner) {
      sendAssignmentEmail(data.currentOwner, data.parentName, data.studentName, data.decisionStatus);
    }

    document.getElementById('copy-survey-btn').disabled = false;

    const msg = document.getElementById('success-message');
    msg.textContent = `${data.parentName} added to the pipeline! Copy their survey link below.`;
    document.getElementById('form-success').hidden = false;
    setTimeout(() => { document.getElementById('form-success').hidden = true; }, 6000);

    // Reset form
    e.target.reset();
    document.querySelectorAll('.pepper-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('leadWarmth').value = '';
    document.getElementById('iepNotes').hidden  = true;
    document.getElementById('additional-students').innerHTML = '';
    // Restore nextstep to default state after reset
    updateNextStepDisplay('');
    document.getElementById('copy-survey-btn').disabled = true;
    lastSavedFamilyId = ref.id; // keep for copy button even after reset
    document.getElementById('copy-survey-btn').disabled = false;

  } catch (err) {
    console.error('Save error:', err);
    alert('Error saving. Check Firebase configuration.');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Save & Add to Pipeline';
  }
}

async function copySurveyLink() {
  if (!lastSavedFamilyId) return;
  try {
    const doc  = await db.collection('families').doc(lastSavedFamilyId).get();
    if (!doc.exists) return;
    const data = doc.data();

    const params = new URLSearchParams({
      family:  data.parentName  || '',
      student: data.studentName || '',
      id:      lastSavedFamilyId
    });
    const url = `${SURVEY_BASE_URL}?${params}`;

    await navigator.clipboard.writeText(url);

    await db.collection('families').doc(lastSavedFamilyId).update({
      surveyLinkCopied:   true,
      surveyLinkCopiedAt: firebase.firestore.Timestamp.now(),
      updatedAt:          firebase.firestore.Timestamp.now()
    });

    const btn = document.getElementById('copy-survey-btn');
    btn.textContent = '✅ Copied!';
    setTimeout(() => { btn.textContent = '📋 Copy Survey Link'; }, 2000);
  } catch (err) {
    console.error('Copy error:', err);
    alert('Could not copy to clipboard. URL: ' + SURVEY_BASE_URL + '?id=' + lastSavedFamilyId);
  }
}

// ─── Pipeline Board ──────────────────────────────────────
function initPipelineBoard() {
  setupBoardFilters();

  db.collection('families')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snapshot => {
      allFamilies = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      updateMonthTabs();
      renderFilteredBoard();
    }, err => console.error('Firestore error:', err));
}

function setupBoardFilters() {
  ['search-input', 'filter-owner', 'filter-program', 'filter-location', 'filter-status']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input',  renderFilteredBoard);
        el.addEventListener('change', renderFilteredBoard);
      }
    });
}

function renderFilteredBoard() {
  const search   = document.getElementById('search-input')?.value.toLowerCase() || '';
  const owner    = document.getElementById('filter-owner')?.value  || '';
  const program  = document.getElementById('filter-program')?.value || '';
  const location = document.getElementById('filter-location')?.value || '';
  const status   = document.getElementById('filter-status')?.value  || 'active';
  const month    = document.querySelector('.month-tab.active')?.dataset.month || currentMonth;

  const filtered = allFamilies.filter(f => {
    if (month && f.monthTab !== month) return false;
    if (search && !f.parentName?.toLowerCase().includes(search) && !f.studentName?.toLowerCase().includes(search)) return false;
    if (owner    && f.currentOwner !== owner)    return false;
    if (program  && f.program !== program)       return false;
    if (location && f.location !== location)     return false;

    const effectiveStatus = f.status || 'active';
    const isInactive = effectiveStatus === 'cold' || effectiveStatus === 'closed' || effectiveStatus === 'gone-rogue'
                    || f.decisionStatus === 'Not moving forward' || f.decisionStatus === 'Gone Rogue';

    if (status === 'active'     && isInactive) return false;
    if (status === 'cold'       && effectiveStatus !== 'cold') return false;
    if (status === 'closed'     && effectiveStatus !== 'closed' && f.decisionStatus !== 'Not moving forward') return false;
    if (status === 'gone-rogue' && effectiveStatus !== 'gone-rogue' && f.decisionStatus !== 'Gone Rogue') return false;

    return true;
  });

  if (activeView === 'pipeline')  renderBoard(filtered);
  else if (activeView === 'owner')    renderOwnerView(filtered);
  else if (activeView === 'calendar') renderCalendarView(filtered);
  updateAttentionSidebar(allFamilies);
}

function getStage(f) {
  if (f.firstSessionDate && f.firstSessionFollowUp) return 8;
  if (f.invoicePaid)     return 7;
  if (f.invoiceSent)     return 6;
  if (f.scheduleConfirmed) return 5;
  if (f.scheduleBuilt)   return 4;
  if (f.surveyComplete || f.preferredContact === 'call-scheduled') return 3;
  if (f.surveyLinkCopied) return 2;
  return 1;
}

function getFlags(f) {
  const flags = [];
  const now   = Date.now();
  const days  = ts => ts ? (now - ts.toMillis()) / 86400000 : 0;

  if (f.pendingMatch) flags.push({ label: 'Needs review', days: null, level: 'error' });

  if (f.surveyLinkCopied && !f.surveyComplete && f.preferredContact !== 'call-scheduled' && days(f.surveyLinkCopiedAt) >= 2)
    flags.push({ label: 'Survey not returned', days: Math.floor(days(f.surveyLinkCopiedAt)), level: 'warning' });

  if (f.invoiceSent && !f.invoicePaid && days(f.invoiceSentAt) >= 7)
    flags.push({ label: 'Invoice overdue', days: Math.floor(days(f.invoiceSentAt)), level: 'error' });

  if (f.firstSessionDate && !f.firstSessionFollowUp && days(f.firstSessionDate) >= 0)
    flags.push({ label: 'Follow-up needed', days: Math.floor(days(f.firstSessionDate)), level: 'error' });

  if (f.scheduleConfirmed && !f.firstSessionDate)
    flags.push({ label: 'No session date set', days: null, level: 'error' });

  if (f.decisionStatus === 'Still thinking' && days(f.consultDate) >= 7)
    flags.push({ label: 'Check in', days: Math.floor(days(f.consultDate)), level: 'warning' });

  return flags;
}

function renderBoard(families) {
  const board = document.getElementById('kanban-board');
  const cols  = {};
  for (let i = 1; i <= 8; i++) cols[i] = [];
  families.forEach(f => cols[getStage(f)].push(f));

  board.innerHTML = '';
  for (let i = 1; i <= 8; i++) {
    const col = document.createElement('div');
    col.className = 'kanban-col' + (i === 8 ? ' col-stage-active' : '');
    col.dataset.stage = i;
    col.innerHTML = `
      <div class="col-header">
        <span class="col-num">${i}</span>
        <span class="col-title">${STAGE_NAMES[i]}</span>
        <span class="col-count">${cols[i].length}</span>
      </div>
      <div class="col-cards">${cols[i].map(renderCard).join('')}</div>`;
    board.appendChild(col);
  }

  board.querySelectorAll('.family-card').forEach(card =>
    card.addEventListener('click', () => openCardModal(card.dataset.id))
  );
}

function renderCard(f) {
  const flags       = getFlags(f);
  const warmth      = f.leadWarmth ? '🌶️'.repeat(f.leadWarmth) : '';
  const initials    = f.currentOwner ? f.currentOwner.slice(0, 2).toUpperCase() : '';
  const ownerClass  = f.currentOwner ? `owner-${f.currentOwner.toLowerCase()}` : '';
  const callBooked  = f.preferredContact === 'call-scheduled' && getStage(f) === 3;

  const statusBadge = getCardStatusBadge(f);
  const cardClass   = getCardClass(f);

  const allStudents = [
    { name: f.studentName, grade: f.grade, program: f.program },
    ...(f.additionalStudents || [])
  ];
  const isMulti = allStudents.length > 1;

  let namesHtml;
  if (isMulti) {
    namesHtml = allStudents.map(s => {
      const pc = s.program ? `badge-program-${s.program.toLowerCase()}` : '';
      return `<div class="card-student-row">
        <span class="card-student">${esc(s.name)}</span>
        ${s.grade ? `<span class="card-grade">${esc(s.grade)}</span>` : ''}
        ${s.program ? `<span class="badge ${pc}">${esc(s.program)}</span>` : ''}
      </div>`;
    }).join('');
  } else {
    namesHtml = `<span class="card-parent">${esc(f.parentName)}</span>
        <span class="card-student">${esc(f.studentName)}</span>`;
  }

  const progClass = f.program ? `badge-program-${f.program.toLowerCase()}` : '';

  return `<div class="family-card ${cardClass}${isMulti ? ' card-multi-student' : ''}" data-id="${f.id}">
    <div class="card-top">
      <div class="card-names">
        ${isMulti ? `<span class="card-parent">${esc(f.parentName)}</span>` + namesHtml : namesHtml}
      </div>
      <div class="card-indicators">
        ${flags.length ? '<span class="flag-bell">🔔</span>' : ''}
        ${initials ? `<span class="owner-circle ${ownerClass}">${initials}</span>` : ''}
      </div>
    </div>
    <div class="card-badges">
      ${!isMulti && f.program   ? `<span class="badge ${progClass}">${esc(f.program)}</span>` : ''}
      ${f.location  ? `<span class="badge badge-location">${esc(f.location)}</span>` : ''}
      ${callBooked  ? '<span class="badge badge-call-booked">Call Booked</span>' : ''}
      ${statusBadge}
    </div>
    ${warmth ? `<div class="card-warmth">${warmth}</div>` : ''}
  </div>`;
}

function getCardClass(f) {
  if (f.pendingMatch)                                                        return 'card-status-pending';
  if (f.status === 'gone-rogue' || f.decisionStatus === 'Gone Rogue')      return 'card-status-gone-rogue';
  if (f.status === 'closed'     || f.decisionStatus === 'Not moving forward') return 'card-status-closed';
  if (f.status === 'cold')                                                  return 'card-status-cold';
  if (f.decisionStatus === 'Still thinking')                                return 'card-status-thinking';
  return '';
}

function getCardStatusBadge(f) {
  if (f.pendingMatch)                                                           return '<span class="badge badge-status-pending">Needs Review</span>';
  if (f.status === 'gone-rogue' || f.decisionStatus === 'Gone Rogue')         return '<span class="badge badge-status-gone-rogue">Gone Rogue</span>';
  if (f.status === 'closed'     || f.decisionStatus === 'Not moving forward')  return '<span class="badge badge-status-closed">Closed</span>';
  if (f.status === 'cold')                                                     return '<span class="badge badge-status-cold">Cold</span>';
  if (f.decisionStatus === 'Still thinking')                                   return '<span class="badge badge-status-thinking">Still Thinking</span>';
  return '';
}

// ─── Needs Attention Sidebar ──────────────────────────────
function updateAttentionSidebar(families) {
  const flagged = families
    .map(f => ({ f, flags: getFlags(f) }))
    .filter(({ flags }) => flags.length > 0);

  const countEl = document.getElementById('attention-count');
  countEl.textContent = flagged.length;
  countEl.hidden = flagged.length === 0;

  const body = document.getElementById('sidebar-body');
  if (flagged.length === 0) {
    body.innerHTML = '<p class="sidebar-empty">All clear! 🎉</p>';
    return;
  }

  body.innerHTML = flagged.map(({ f, flags }) => `
    <div class="sidebar-item" data-id="${f.id}">
      <div class="sidebar-item-name">${esc(f.parentName)}</div>
      <div class="sidebar-item-student">${esc(f.studentName)}</div>
      <div class="sidebar-item-flags">
        ${flags.map(fl => `<span class="flag-tag flag-${fl.level}">${fl.label}${fl.days != null ? ` · ${fl.days}d` : ''}</span>`).join('')}
      </div>
    </div>`).join('');

  body.querySelectorAll('.sidebar-item').forEach(el =>
    el.addEventListener('click', () => openCardModal(el.dataset.id))
  );
}

function setupSidebar() {
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    const sidebar = document.getElementById('attention-sidebar');
    sidebar.classList.toggle('collapsed');
    const chev = sidebar.querySelector('.sidebar-chevron');
    chev.textContent = sidebar.classList.contains('collapsed') ? '›' : '‹';
  });
}

// ─── View Toggle ─────────────────────────────────────────
function setupViewToggle() {
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeView = btn.dataset.view;
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.getElementById('board-view-pipeline').hidden = activeView !== 'pipeline';
      document.getElementById('board-view-owner').hidden    = activeView !== 'owner';
      document.getElementById('board-view-calendar').hidden = activeView !== 'calendar';

      document.getElementById('month-tabs').closest('.board-controls-row2')
        .querySelector('.month-tabs-row').style.display = activeView === 'pipeline' ? '' : 'none';

      renderFilteredBoard();
    });
  });
}

// ─── Owner View ───────────────────────────────────────────
function renderOwnerView(families) {
  const container = document.getElementById('board-view-owner');
  const owners    = ['Shaina', 'Tara', 'Josh'];
  const byOwner   = {};
  owners.forEach(o => byOwner[o] = []);
  byOwner['Unassigned'] = [];

  families.forEach(f => {
    const o = owners.includes(f.currentOwner) ? f.currentOwner : 'Unassigned';
    byOwner[o].push(f);
  });

  owners.forEach(o => byOwner[o].sort((a, b) => getStage(a) - getStage(b)));
  byOwner['Unassigned'].sort((a, b) => getStage(a) - getStage(b));

  const allCols = [...owners, ...(byOwner['Unassigned'].length ? ['Unassigned'] : [])];

  container.innerHTML = `<div class="owner-view">${
    allCols.map(owner => `
      <div class="owner-col">
        <div class="owner-col-header owner-hdr-${owner.toLowerCase()}">
          <span>${owner}</span>
          <span class="col-count">${byOwner[owner].length}</span>
        </div>
        <div class="owner-col-cards">${byOwner[owner].map(renderCard).join('')}</div>
      </div>`).join('')
  }</div>`;

  container.querySelectorAll('.family-card').forEach(card =>
    card.addEventListener('click', () => openCardModal(card.dataset.id))
  );
}

// ─── Calendar View ────────────────────────────────────────
function renderCalendarView(families) {
  if (!calendarMonth) {
    calendarMonth = new Date();
    calendarMonth.setDate(1);
    calendarMonth.setHours(0, 0, 0, 0);
  }
  const container = document.getElementById('board-view-calendar');
  container.innerHTML = buildCalendarHTML(families);

  container.querySelector('#cal-prev').addEventListener('click', () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
    renderCalendarView(families);
  });
  container.querySelector('#cal-next').addEventListener('click', () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
    renderCalendarView(families);
  });
  container.querySelectorAll('.cal-card').forEach(el =>
    el.addEventListener('click', () => openCardModal(el.dataset.id))
  );
}

function getCalendarActions(families) {
  const actions = [];
  families.forEach(f => {
    if (f.nextActionDate) {
      actions.push({
        date: f.nextActionDate.toDate(),
        label: f.nextActionNote || 'Action needed',
        family: f,
        type: 'manual'
      });
    }
    if (f.firstSessionDate) {
      actions.push({
        date: f.firstSessionDate.toDate(),
        label: 'First session',
        family: f,
        type: 'session'
      });
    }
  });
  return actions.sort((a, b) => a.date - b.date);
}

function buildCalendarHTML(families) {
  const yr  = calendarMonth.getFullYear();
  const mo  = calendarMonth.getMonth();
  const monthLabel = calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const actions    = getCalendarActions(families);
  const byDateKey  = {};
  actions.forEach(a => {
    const k = `${a.date.getFullYear()}-${a.date.getMonth()}-${a.date.getDate()}`;
    if (!byDateKey[k]) byDateKey[k] = [];
    byDateKey[k].push(a);
  });

  const firstWeekday = new Date(yr, mo, 1).getDay();
  const daysInMonth  = new Date(yr, mo + 1, 0).getDate();
  const today        = new Date();

  let cells = '';
  for (let i = 0; i < firstWeekday; i++) cells += '<div class="cal-cell cal-cell-empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const k    = `${yr}-${mo}-${d}`;
    const hits = byDateKey[k] || [];
    const isToday = today.getFullYear() === yr && today.getMonth() === mo && today.getDate() === d;
    cells += `<div class="cal-cell${isToday ? ' cal-today' : ''}${hits.length ? ' cal-has-items' : ''}">
      <span class="cal-date-num">${d}</span>
      ${hits.slice(0, 2).map(a => `
        <div class="cal-dot cal-dot-${a.type}" data-id="${a.family.id}">
          ${esc(a.family.parentName.split(' ')[0])}
        </div>`).join('')}
      ${hits.length > 2 ? `<div class="cal-dot-more">+${hits.length - 2}</div>` : ''}
    </div>`;
  }

  const now = new Date(); now.setHours(0, 0, 0, 0);
  const overdue  = actions.filter(a => a.date < now);
  const upcoming = actions.filter(a => a.date >= now);

  const agendaSection = (list, title) => list.length ? `
    <div class="cal-agenda-section">
      <h4 class="cal-agenda-label">${title}</h4>
      ${list.map(a => `
        <div class="cal-agenda-item">
          <div class="cal-agenda-date">${a.date.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>
          <div class="cal-agenda-info">
            <span class="cal-agenda-name cal-card" data-id="${a.family.id}">${esc(a.family.parentName)}</span>
            <span class="cal-agenda-note">${esc(a.label)}</span>
          </div>
          <span class="cal-stage-badge">Stage ${getStage(a.family)}</span>
          ${a.type === 'manual' ? `<button class="btn-done-action" onclick="doneNextAction('${a.family.id}')">✓ Done</button>` : ''}
        </div>`).join('')}
    </div>` : '';

  return `<div class="cal-view">
    <div class="cal-header">
      <button id="cal-prev" class="cal-nav">‹</button>
      <span class="cal-month-label">${monthLabel}</span>
      <button id="cal-next" class="cal-nav">›</button>
    </div>
    <div class="cal-weekdays">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="cal-weekday">${d}</div>`).join('')}</div>
    <div class="cal-grid">${cells}</div>
    <div class="cal-agenda">
      ${agendaSection(overdue, '⚠️ Overdue')}
      ${agendaSection(upcoming, '📅 Upcoming')}
      ${!overdue.length && !upcoming.length ? '<p class="cal-empty">No sessions or actions scheduled yet.</p>' : ''}
    </div>
  </div>`;
}

// ─── Card Modal ───────────────────────────────────────────
function setupModal() {
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('card-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('card-modal')) closeModal();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

function closeModal() { document.getElementById('card-modal').hidden = true; }

function openCardModal(id) {
  const family = allFamilies.find(f => f.id === id);
  if (!family) return;

  document.getElementById('modal-content').innerHTML = buildModalHTML(family);
  document.getElementById('card-modal').hidden = false;

  // Track owner locally so rapid decision→owner changes don't double-email
  let modalOwner = family.currentOwner;

  // Wire pipeline toggles
  document.querySelectorAll('.pipeline-toggle').forEach(cb => {
    cb.addEventListener('change', e => {
      const field = e.target.dataset.field;
      const val   = e.target.checked;
      const update = { [field]: val, updatedAt: firebase.firestore.Timestamp.now() };
      if (field === 'invoiceSent' && val) update.invoiceSentAt = firebase.firestore.Timestamp.now();
      db.collection('families').doc(id).update(update);
    });
  });

  // Wire inline decision-status select
  const decSel = document.querySelector('.modal-decision-select');
  if (decSel) decSel.addEventListener('change', function() {
    const newDecision = this.value;
    const newOwner    = ownerForDecision(newDecision);
    const update = { decisionStatus: newDecision, updatedAt: firebase.firestore.Timestamp.now() };
    if (newOwner) {
      update.currentOwner = newOwner;
      const ownerSel = document.querySelector('.modal-owner-select');
      if (ownerSel) ownerSel.value = newOwner;
    }
    db.collection('families').doc(id).update(update);
    if (newOwner && newOwner !== modalOwner) {
      sendAssignmentEmail(newOwner, family.parentName, family.studentName, newDecision);
      modalOwner = newOwner;
    }
  });

  // Wire inline owner select
  const ownSel = document.querySelector('.modal-owner-select');
  if (ownSel) ownSel.addEventListener('change', function() {
    const newOwner = this.value;
    db.collection('families').doc(id).update({ currentOwner: newOwner, updatedAt: firebase.firestore.Timestamp.now() });
    if (newOwner && newOwner !== modalOwner) {
      sendAssignmentEmail(newOwner, family.parentName, family.studentName, family.decisionStatus);
      modalOwner = newOwner;
    }
  });
}

function buildModalHTML(f) {
  const stage  = getStage(f);
  const flags  = getFlags(f);
  const warmth = f.leadWarmth ? '🌶️'.repeat(f.leadWarmth) : '—';

  const BOOL_FIELDS = [
    { field: 'surveyLinkCopied',         label: 'Survey Link Sent' },
    { field: 'surveyComplete',           label: 'Survey Complete' },
    { field: 'scheduleBuilt',            label: 'Schedule Built' },
    { field: 'scheduleConfirmed',        label: 'Schedule Confirmed' },
    { field: 'locationConfirmationSent', label: 'Location Confirmation Sent' },
    { field: 'invoiceSent',              label: 'Invoice Sent' },
    { field: 'invoicePaid',              label: 'Invoice Paid' },
    { field: 'firstSessionFollowUp',     label: 'First Session Follow-Up Done' }
  ];

  const checklistHtml = BOOL_FIELDS.map(({ field, label }) => `
    <label class="checklist-item">
      <input type="checkbox" class="pipeline-toggle" data-field="${field}" ${f[field] ? 'checked' : ''}>
      <span>${label}</span>
    </label>`).join('');

  const flagsHtml = flags.length
    ? `<div class="modal-flags">${flags.map(fl => `<span class="flag-badge flag-${fl.level}">${fl.label}${fl.days != null ? ` · ${fl.days}d` : ''}</span>`).join('')}</div>`
    : '';

  const surveyHtml = f.surveyComplete ? `
    <div class="modal-section">
      <h4>Survey Results</h4>
      <div class="info-grid">
        <span class="info-label">Scheduling Type</span>
        <span class="info-value"><span class="badge badge-scheduling">${esc(f.schedulingType || '—')}</span></span>
        <span class="info-label">Available Days</span>
        <span class="info-value">${(f.availableDays || []).join(', ') || '—'}</span>
        <span class="info-label">Preferred Times</span>
        <span class="info-value">${(f.preferredTimes || []).join(', ') || '—'}</span>
        <span class="info-label">Hard Constraints</span>
        <span class="info-value">${esc(f.hardConstraints) || 'None noted'}</span>
        <span class="info-label">Schedule Through</span>
        <span class="info-value">${esc(f.scheduleKnownThrough) || 'Open-ended'}</span>
        ${f.surveyNotes ? `<span class="info-label">Notes</span><span class="info-value">${esc(f.surveyNotes)}</span>` : ''}
      </div>
    </div>` : '';

  const firstSessVal = f.firstSessionDate
    ? f.firstSessionDate.toDate().toISOString().split('T')[0]
    : '';

  return `
    <div class="modal-header">
      <div>
        <h2 class="modal-parent">${esc(f.parentName)}</h2>
        <p class="modal-student">Student: <strong>${esc(f.studentName)}</strong></p>
      </div>
      <span class="modal-stage">Stage ${stage} — ${STAGE_NAMES[stage]}</span>
    </div>

    ${flagsHtml}

    <div class="modal-section">
      <h4>Contact &amp; Consult</h4>
      <div class="info-grid">
        <span class="info-label">Parent Name</span>
        <span class="info-value"><input type="text" class="inline-input" id="modal-edit-parent" value="${esc(f.parentName || '')}"></span>
        <span class="info-label">Student Name</span>
        <span class="info-value"><input type="text" class="inline-input" id="modal-edit-student" value="${esc(f.studentName || '')}"></span>
        <span class="info-label">Phone</span>
        <span class="info-value"><input type="text" class="inline-input" id="modal-edit-phone" value="${esc(f.phone || '')}"></span>
        <span class="info-label">Email</span>
        <span class="info-value"><input type="email" class="inline-input" id="modal-edit-email" value="${esc(f.email || '')}"></span>
        ${row('Student',        f.studentName + (f.grade ? ' (' + f.grade + ')' : '') + (f.program ? ' — ' + f.program : ''))}
        ${(f.additionalStudents || []).map((s, i) =>
          row(`Student ${i + 2}`, s.name + (s.grade ? ' (' + s.grade + ')' : '') + (s.program ? ' — ' + s.program : ''))
        ).join('')}
        ${row('Location',       f.location)}
        ${row('Consult Date',   fmtDate(f.consultDate))}
        ${row('Lead Warmth',    warmth)}
        <span class="info-label">Decision</span>
        <span class="info-value">
          <select class="inline-select modal-decision-select" data-fid="${f.id}">
            ${['','Decided to move forward','Want a trial session','Want to see the space',
               'Need a proposal','Need a family meeting','Scheduled',
               'Still thinking','Will revisit later','Never connected',
               'Not moving forward','Gone Rogue'].map(opt =>
              `<option value="${opt}" ${f.decisionStatus === opt ? 'selected' : ''}>${opt || '—'}</option>`
            ).join('')}
          </select>
        </span>
        ${row('Likelihood',     f.likelihoodOfReg + (f.likelihoodReason ? ' — ' + f.likelihoodReason : ''))}
        <span class="info-label">Owner</span>
        <span class="info-value">
          <select class="inline-select modal-owner-select" data-fid="${f.id}">
            ${['','Shaina','Tara','Josh'].map(opt =>
              `<option value="${opt}" ${f.currentOwner === opt ? 'selected' : ''}>${opt || '—'}</option>`
            ).join('')}
          </select>
        </span>
        ${row('Pref. Comm.',    f.preferredComm)}
        ${row('Frequency',      f.sessionFrequency)}
        ${f.schedulingConstraints ? row('Constraints', f.schedulingConstraints) : ''}
        ${f.need  ? row('Need',  f.need)  : ''}
        ${f.notes ? row('Notes', f.notes) : ''}
      </div>
      <button class="btn-sm" style="margin-top:.6rem" onclick="saveContactInfo('${f.id}')">Save contact info</button>
    </div>

    ${surveyHtml}

    <div class="modal-section">
      <h4>Pipeline Checklist</h4>
      <div class="pipeline-checklist">
        ${checklistHtml}
        <div class="checklist-extra">
          <div class="checklist-item-text">
            <span>Invoice amount: $</span>
            <input type="number" class="inline-input" id="modal-invoice-amt" value="${f.invoiceAmount || ''}" placeholder="0.00" step="0.01">
            <button class="btn-sm" onclick="saveInvoiceAmount('${f.id}')">Save</button>
          </div>
          <div class="checklist-item-text">
            <span>First session date:</span>
            <input type="date" class="inline-input" id="modal-first-sess" value="${firstSessVal}">
            <button class="btn-sm" onclick="saveFirstSession('${f.id}')">Save</button>
          </div>
        </div>
      </div>
    </div>

    <div class="modal-section">
      <h4>Status</h4>
      <select class="status-select" onchange="updateFamilyStatus('${f.id}', this.value)">
        <option value="active"     ${(!f.status || f.status === 'active')     ? 'selected' : ''}>Active</option>
        <option value="cold"       ${f.status === 'cold'                      ? 'selected' : ''}>Cold</option>
        <option value="closed"     ${f.status === 'closed'                    ? 'selected' : ''}>Closed</option>
        <option value="gone-rogue" ${f.status === 'gone-rogue'                ? 'selected' : ''}>Gone Rogue</option>
      </select>
    </div>

    <div class="modal-section">
      <h4>📅 Next Action</h4>
      <div class="next-action-row">
        <input type="date" class="inline-input" id="modal-next-action-date"
               value="${f.nextActionDate ? f.nextActionDate.toDate().toISOString().split('T')[0] : ''}">
        <input type="text" class="inline-input next-action-note" id="modal-next-action-note"
               value="${esc(f.nextActionNote || '')}" placeholder="Action note…">
        <button class="btn-sm" onclick="saveNextAction('${f.id}')">Set</button>
        ${f.nextActionDate ? `<button class="btn-sm btn-done-sm" onclick="doneNextAction('${f.id}')">✓ Done</button>` : ''}
      </div>
    </div>

    ${isReadyForSurvey(f) ? `
    <div class="modal-section">
      <button class="btn btn-secondary"
              data-fid="${f.id}" data-parent="${esc(f.parentName)}" data-student="${esc(f.studentName)}"
              onclick="copyModalSurveyLink(this.dataset.fid,this.dataset.parent,this.dataset.student)">
        📋 Copy Survey Link
      </button>
    </div>` : ''}

    ${f.pendingMatch ? `
    <div class="modal-section modal-section-merge">
      <h4>🔗 Merge with Existing Family</h4>
      <p class="field-hint" style="margin-bottom:.75rem;">This survey came in via the generic link. Pick the matching family below to copy the survey answers over — the duplicate will be deleted automatically.</p>
      <div class="merge-row">
        <select id="merge-target-select" class="inline-select" style="flex:1">
          <option value="">— Select family to merge into —</option>
          ${allFamilies
            .filter(other => !other.pendingMatch && other.id !== f.id)
            .sort((a, b) => (a.parentName || '').localeCompare(b.parentName || ''))
            .map(other => `<option value="${other.id}">${esc(other.parentName)} / ${esc(other.studentName)}</option>`)
            .join('')}
        </select>
        <button class="btn btn-primary btn-sm-merge" onclick="mergePendingFamily('${f.id}')">Merge →</button>
      </div>
    </div>` : ''}

    <div class="modal-section modal-section-danger">
      <button class="btn btn-danger" onclick="deleteFamily('${f.id}', '${esc(f.parentName)}')">
        🗑 Remove from pipeline
      </button>
    </div>`;
}

window.deleteFamily = function(id, name) {
  if (!confirm(`Remove ${name} from the pipeline?\n\nThis cannot be undone.`)) return;
  db.collection('families').doc(id).delete()
    .then(() => { document.getElementById('card-modal').hidden = true; })
    .catch(err => { console.error(err); alert('Could not delete — please try again.'); });
};

window.mergePendingFamily = async function(pendingId) {
  const targetId = document.getElementById('merge-target-select')?.value;
  if (!targetId) { alert('Please select a family to merge into.'); return; }

  const pending = allFamilies.find(f => f.id === pendingId);
  const target  = allFamilies.find(f => f.id === targetId);
  if (!pending || !target) return;

  if (!confirm(`Merge survey answers from "${pending.parentName || 'this record'}" into "${target.parentName}"?\n\nThe duplicate will be deleted.`)) return;

  const surveyFields = {
    surveyComplete:       true,
    surveyCompletedAt:    pending.surveyCompletedAt    || firebase.firestore.Timestamp.now(),
    schedulingType:       pending.schedulingType       || '',
    availableDays:        pending.availableDays        || [],
    preferredTimes:       pending.preferredTimes       || [],
    hardConstraints:      pending.hardConstraints      || '',
    scheduleKnownThrough: pending.scheduleKnownThrough || '',
    sessionFrequency:     pending.sessionFrequency     || '',
    surveyNotes:          pending.surveyNotes          || '',
    preferredComm:        pending.preferredComm        || target.preferredComm || '',
    updatedAt:            firebase.firestore.Timestamp.now(),
  };

  try {
    await db.collection('families').doc(targetId).update(surveyFields);
    await db.collection('families').doc(pendingId).delete();
    document.getElementById('card-modal').hidden = true;
    alert(`Done! Survey answers merged into ${target.parentName}.`);
  } catch (err) {
    console.error('Merge error:', err);
    alert('Merge failed — please try again.');
  }
};

// Exposed globals called from inline onclick in modal HTML
window.saveContactInfo = function(id) {
  const parentName  = (document.getElementById('modal-edit-parent')?.value  || '').trim();
  const studentName = (document.getElementById('modal-edit-student')?.value || '').trim();
  const phone       = (document.getElementById('modal-edit-phone')?.value   || '').trim();
  const email       = (document.getElementById('modal-edit-email')?.value   || '').trim();
  if (!parentName)  { alert('Parent name cannot be empty.'); return; }
  if (!studentName) { alert('Student name cannot be empty.'); return; }
  db.collection('families').doc(id).update({ parentName, studentName, phone, email, updatedAt: firebase.firestore.Timestamp.now() })
    .then(() => alert('Contact info saved!'))
    .catch(err => { console.error(err); alert('Save failed — please try again.'); });
};

window.saveInvoiceAmount = function(id) {
  const amt = parseFloat(document.getElementById('modal-invoice-amt').value);
  if (!isNaN(amt)) db.collection('families').doc(id).update({ invoiceAmount: amt, updatedAt: firebase.firestore.Timestamp.now() });
};

window.saveFirstSession = function(id) {
  const val = document.getElementById('modal-first-sess').value;
  if (!val) return;
  const sessionDate = new Date(val + 'T12:00:00');
  const followUpDate = addBusinessDays(sessionDate, 2);
  db.collection('families').doc(id).update({
    firstSessionDate: firebase.firestore.Timestamp.fromDate(sessionDate),
    nextActionDate:   firebase.firestore.Timestamp.fromDate(followUpDate),
    nextActionNote:   'Follow up: check in after first session',
    updatedAt:        firebase.firestore.Timestamp.now()
  });
};

window.saveNextAction = function(id) {
  const dateVal = document.getElementById('modal-next-action-date').value;
  const note    = (document.getElementById('modal-next-action-note').value || '').trim();
  if (!dateVal) return;
  db.collection('families').doc(id).update({
    nextActionDate: firebase.firestore.Timestamp.fromDate(new Date(dateVal + 'T09:00:00')),
    nextActionNote: note,
    updatedAt:      firebase.firestore.Timestamp.now()
  });
};

window.doneNextAction = function(id) {
  db.collection('families').doc(id).update({
    nextActionDate: null,
    nextActionNote: '',
    updatedAt:      firebase.firestore.Timestamp.now()
  });
};

window.updateFamilyStatus = function(id, status) {
  db.collection('families').doc(id).update({ status, updatedAt: firebase.firestore.Timestamp.now() });
};

window.copyModalSurveyLink = function(id, parentName, studentName) {
  const params = new URLSearchParams({ family: parentName, student: studentName, id });
  navigator.clipboard.writeText(`${SURVEY_BASE_URL}?${params}`)
    .then(() => {
      db.collection('families').doc(id).update({
        surveyLinkCopied: true, surveyLinkCopiedAt: firebase.firestore.Timestamp.now(),
        updatedAt: firebase.firestore.Timestamp.now()
      });
      alert('Survey link copied!');
    });
};

// ─── Month Tabs ───────────────────────────────────────────
function updateMonthTabs() {
  const months = [...new Set(allFamilies.map(f => f.monthTab).filter(Boolean))];
  if (!months.includes(currentMonth)) months.push(currentMonth);
  months.sort((a, b) => new Date('1 ' + a) - new Date('1 ' + b));

  const container   = document.getElementById('month-tabs');
  const activeMonth = document.querySelector('.month-tab.active')?.dataset.month || currentMonth;

  container.innerHTML = months.map(m =>
    `<button class="month-tab${m === activeMonth ? ' active' : ''}" data-month="${m}">${m}</button>`
  ).join('');

  container.querySelectorAll('.month-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.month-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderFilteredBoard();
    });
  });
}

function setCurrentMonth() {
  const now = new Date();
  currentMonth = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const el = document.getElementById('header-month');
  if (el) el.textContent = currentMonth;
}

// ─── Helpers ─────────────────────────────────────────────
function v(id)        { return (document.getElementById(id)?.value || '').trim(); }
function intOrNull(id){ const n = parseInt(v(id)); return isNaN(n) ? null : n; }
function radio(name)  { return document.querySelector(`input[name="${name}"]:checked`)?.value || ''; }
function esc(s)       {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtDate(ts)  {
  if (!ts) return '—';
  try { return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return '—'; }
}
function row(label, val) {
  return val ? `<span class="info-label">${label}</span><span class="info-value">${esc(String(val))}</span>` : '';
}

function addBusinessDays(date, n) {
  const d = new Date(date);
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}
