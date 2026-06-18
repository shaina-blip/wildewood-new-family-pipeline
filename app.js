'use strict';

// ─── State ──────────────────────────────────────────────
let db;
let allFamilies = [];
let unsubscribeFamilies = null;
let lastSavedFamilyId = null;
let currentMonth = '';

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

  setCurrentMonth();
  initConsultForm();
  setupTabNav();
  setupModal();
  setupSidebar();

  if (sessionStorage.getItem('weo_auth') === 'true') {
    unlockApp();
  } else {
    setupPinGate();
  }
});

// ─── PIN Auth ────────────────────────────────────────────
function setupPinGate() {
  const input  = document.getElementById('pin-input');
  const btn    = document.getElementById('pin-submit');
  btn.addEventListener('click', handlePinSubmit);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') handlePinSubmit(); });
  setTimeout(() => input.focus(), 100);
}

async function handlePinSubmit() {
  const input = document.getElementById('pin-input');
  const error = document.getElementById('pin-error');
  const btn   = document.getElementById('pin-submit');
  const pin   = input.value.trim();
  if (!pin) return;

  btn.disabled  = true;
  btn.textContent = 'Checking…';
  error.hidden  = true;

  try {
    const doc = await db.collection('config').doc('auth').get();
    if (!doc.exists) {
      showPinError('PIN not set up yet — see README.');
      return;
    }
    const hash = await sha256(pin);
    if (hash === doc.data().pinHash) {
      sessionStorage.setItem('weo_auth', 'true');
      unlockApp();
    } else {
      showPinError('Incorrect PIN — try again.');
      input.value = '';
      input.focus();
    }
  } catch (err) {
    showPinError('Connection error. Check Firebase config.');
    console.error(err);
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Unlock';
  }
}

function showPinError(msg) {
  const el = document.getElementById('pin-error');
  el.textContent = msg;
  el.hidden = false;
}

function unlockApp() {
  document.getElementById('pin-gate').hidden   = true;
  document.getElementById('main-app').hidden   = false;
  initPipelineBoard();
}

async function sha256(msg) {
  const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
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

  // Form submit
  document.getElementById('consult-form').addEventListener('submit', handleFormSubmit);

  // Copy survey link
  document.getElementById('copy-survey-btn').addEventListener('click', copySurveyLink);
}

async function handleFormSubmit(e) {
  e.preventDefault();

  const btn = document.getElementById('save-btn');
  btn.disabled    = true;
  btn.textContent = 'Saving…';

  const now      = firebase.firestore.Timestamp.now();
  const programs = Array.from(document.querySelectorAll('input[name="programs"]:checked')).map(cb => cb.value);

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
    preferredContact:      radio('preferredContact') || 'survey',

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
    firstSessionDate:          null,
    firstSessionFollowUp:      false,

    // Metadata
    consultDate: now,
    createdAt:   now,
    updatedAt:   now,
    monthTab:    currentMonth,
    status:      'active'
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

  renderBoard(filtered);
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

  if (f.surveyLinkCopied && !f.surveyComplete && f.preferredContact !== 'call-scheduled' && days(f.surveyLinkCopiedAt) >= 2)
    flags.push({ label: 'Survey not returned', days: Math.floor(days(f.surveyLinkCopiedAt)), level: 'warning' });

  if (f.invoiceSent && !f.invoicePaid && days(f.invoiceSentAt) >= 7)
    flags.push({ label: 'Invoice overdue', days: Math.floor(days(f.invoiceSentAt)), level: 'error' });

  if (f.firstSessionDate && !f.firstSessionFollowUp && days(f.firstSessionDate) >= 0)
    flags.push({ label: 'Follow-up needed', days: Math.floor(days(f.firstSessionDate)), level: 'error' });

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
  const flags      = getFlags(f);
  const warmth     = f.leadWarmth ? '🌶️'.repeat(f.leadWarmth) : '';
  const initials   = f.currentOwner ? f.currentOwner.slice(0, 2).toUpperCase() : '';
  const progClass  = f.program ? `badge-program-${f.program.toLowerCase()}` : '';
  const callBooked = f.preferredContact === 'call-scheduled' && getStage(f) === 3;

  const statusBadge = getCardStatusBadge(f);
  const cardClass   = getCardClass(f);

  return `<div class="family-card ${cardClass}" data-id="${f.id}">
    <div class="card-top">
      <div class="card-names">
        <span class="card-parent">${esc(f.parentName)}</span>
        <span class="card-student">${esc(f.studentName)}</span>
      </div>
      <div class="card-indicators">
        ${flags.length ? '<span class="flag-bell">🔔</span>' : ''}
        ${initials ? `<span class="owner-circle">${initials}</span>` : ''}
      </div>
    </div>
    <div class="card-badges">
      ${f.program   ? `<span class="badge ${progClass}">${esc(f.program)}</span>` : ''}
      ${f.location  ? `<span class="badge badge-location">${esc(f.location)}</span>` : ''}
      ${callBooked  ? '<span class="badge badge-call-booked">Call Booked</span>' : ''}
      ${statusBadge}
    </div>
    ${warmth ? `<div class="card-warmth">${warmth}</div>` : ''}
  </div>`;
}

function getCardClass(f) {
  if (f.status === 'gone-rogue' || f.decisionStatus === 'Gone Rogue')      return 'card-status-gone-rogue';
  if (f.status === 'closed'     || f.decisionStatus === 'Not moving forward') return 'card-status-closed';
  if (f.status === 'cold')                                                  return 'card-status-cold';
  if (f.decisionStatus === 'Still thinking')                                return 'card-status-thinking';
  return '';
}

function getCardStatusBadge(f) {
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
        ${flags.map(fl => `<span class="flag-tag flag-${fl.level}">${fl.label} · ${fl.days}d</span>`).join('')}
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

  // Wire toggles
  document.querySelectorAll('.pipeline-toggle').forEach(cb => {
    cb.addEventListener('change', e => {
      const field = e.target.dataset.field;
      const val   = e.target.checked;
      const update = { [field]: val, updatedAt: firebase.firestore.Timestamp.now() };
      if (field === 'invoiceSent' && val) update.invoiceSentAt = firebase.firestore.Timestamp.now();
      db.collection('families').doc(id).update(update);
    });
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
    ? `<div class="modal-flags">${flags.map(fl => `<span class="flag-badge flag-${fl.level}">${fl.label} · ${fl.days}d</span>`).join('')}</div>`
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
        ${row('Phone',          f.phone)}
        ${row('Email',          f.email)}
        ${row('Program',        f.program)}
        ${row('Location',       f.location)}
        ${row('Consult Date',   fmtDate(f.consultDate))}
        ${row('Lead Warmth',    warmth)}
        ${row('Decision',       f.decisionStatus)}
        ${row('Likelihood',     f.likelihoodOfReg + (f.likelihoodReason ? ' — ' + f.likelihoodReason : ''))}
        ${row('Owner',          f.currentOwner)}
        ${row('Pref. Comm.',    f.preferredComm)}
        ${row('Frequency',      f.sessionFrequency)}
        ${f.schedulingConstraints ? row('Constraints', f.schedulingConstraints) : ''}
        ${f.need  ? row('Need',  f.need)  : ''}
        ${f.notes ? row('Notes', f.notes) : ''}
      </div>
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
      <button class="btn btn-secondary"
              data-fid="${f.id}" data-parent="${esc(f.parentName)}" data-student="${esc(f.studentName)}"
              onclick="copyModalSurveyLink(this.dataset.fid,this.dataset.parent,this.dataset.student)">
        📋 Copy Survey Link
      </button>
    </div>`;
}

// Exposed globals called from inline onclick in modal HTML
window.saveInvoiceAmount = function(id) {
  const amt = parseFloat(document.getElementById('modal-invoice-amt').value);
  if (!isNaN(amt)) db.collection('families').doc(id).update({ invoiceAmount: amt, updatedAt: firebase.firestore.Timestamp.now() });
};

window.saveFirstSession = function(id) {
  const val = document.getElementById('modal-first-sess').value;
  if (val) db.collection('families').doc(id).update({
    firstSessionDate: firebase.firestore.Timestamp.fromDate(new Date(val + 'T12:00:00')),
    updatedAt: firebase.firestore.Timestamp.now()
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
