/**
 * ============================================================================
 *  SSHT 2026 — Symposium registration & poster backend
 *  International Symposium on Sustainable Energy Applications
 *  of Advanced Solar and Hydrogen Technologies
 *  National Chung Hsing University · 5 November 2026
 * ============================================================================
 *
 *  WHAT THIS DOES
 *    - Receives submissions from the website (no Google Form, no login needed)
 *    - Writes them straight into this spreadsheet
 *    - Enforces the 110 / 20 caps, and puts overflow on a waitlist
 *    - Sends an automatic confirmation email to the person who submitted
 *
 *  EVERYTHING YOU NEED TO EDIT IS IN THE CONFIG BLOCK BELOW.
 *  See SETUP.md for deployment steps.
 * ============================================================================
 */

/* ------------------------------ CONFIG ------------------------------------ */

const CONFIG = {

  // ---- Caps -------------------------------------------------------------
  REGISTRATION_CAP: 110,
  POSTER_CAP: 20,

  // ---- Deadlines --------------------------------------------------------
  // Leave as '' to keep submissions open indefinitely.
  // When you decide, write the LAST day people may submit, e.g. '2026-10-15'.
  // Submissions close at 23:59:59 Taipei time on that date.
  REGISTRATION_DEADLINE: '',
  POSTER_DEADLINE: '',

  // ---- Event details (used in the confirmation emails) -------------------
  EVENT_NAME: 'International Symposium on Sustainable Energy Applications of Advanced Solar and Hydrogen Technologies',
  EVENT_DATE: 'Thursday, 5 November 2026, 09:00–15:00',
  EVENT_VENUE: 'B1 International Conference Hall, Chemical Material Building, ' +
               'National Chung Hsing University, Taichung, Taiwan',

  // ---- Contact ----------------------------------------------------------
  // Shown in emails as the address people should reply to.
  CONTACT_NAME: 'SSHT 2026 Organising Committee',
  CONTACT_EMAIL: 'CHANGE_ME@nchu.edu.tw',

  // ---- Email ------------------------------------------------------------
  SEND_EMAIL: true,   // set false to stop auto-replies (data is still saved)

  // ---- Abstract -----------------------------------------------------------
  ABSTRACT_WORD_LIMIT: 250
};

/* ------------------------- SHEET DEFINITIONS ------------------------------ */

const REG_SHEET = 'Registrations';
const POSTER_SHEET = 'Posters';

const REG_HEADERS = [
  'Timestamp', 'Status', 'Source', 'Full name (EN)', 'Chinese name', 'Email',
  'Affiliation', 'Department / Lab', 'Position', 'Mobile',
  'Dietary', 'Dietary detail', 'Certificate', 'Photo consent',
  'Data consent', 'Heard from'
];

const POSTER_HEADERS = [
  'Timestamp', 'Status', 'Poster no.', 'Presenting author (EN)', 'Chinese name', 'Email',
  'Affiliation', 'Department / Lab', 'Position', 'Mobile', 'Advisor / PI',
  'Poster title', 'Co-authors', 'Abstract', 'Words', 'Topic', 'Keywords',
  'Award entry', 'A0 confirmed', 'Publish consent'
];

/* ------------------------------ ROUTING ----------------------------------- */

/**
 * GET — the website calls this to show live capacity.
 * Returns: { ok, registration:{count,cap,full}, poster:{count,cap,full}, closed:{...} }
 */
function doGet(e) {
  try {
    return json({
      ok: true,
      registration: {
        count: countConfirmed(REG_SHEET),
        cap: CONFIG.REGISTRATION_CAP,
        full: countConfirmed(REG_SHEET) >= CONFIG.REGISTRATION_CAP
      },
      poster: {
        count: countConfirmed(POSTER_SHEET),
        cap: CONFIG.POSTER_CAP,
        full: countConfirmed(POSTER_SHEET) >= CONFIG.POSTER_CAP
      },
      closed: {
        registration: isPastDeadline(CONFIG.REGISTRATION_DEADLINE),
        poster: isPastDeadline(CONFIG.POSTER_DEADLINE)
      }
    });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/**
 * POST — the website submits forms here.
 * Body: JSON, sent as text/plain to avoid a CORS preflight.
 *   { action: 'register' | 'poster', ...fields }
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    // Serialise submissions so two people can't take the same last seat.
    lock.waitLock(25000);

    if (!e || !e.postData || !e.postData.contents) {
      return json({ ok: false, error: 'Empty request.' });
    }

    const data = JSON.parse(e.postData.contents);
    const action = String(data.action || '').toLowerCase();

    if (action === 'register') return json(handleRegister(data));
    if (action === 'poster')   return json(handlePoster(data));

    return json({ ok: false, error: 'Unknown action.' });

  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

/* --------------------------- REGISTRATION --------------------------------- */

function handleRegister(d) {

  if (isPastDeadline(CONFIG.REGISTRATION_DEADLINE)) {
    return { ok: false, error: 'Registration has closed.' };
  }

  const missing = requireFields(d, [
    'fullName', 'email', 'affiliation', 'department',
    'position', 'mobile', 'dietary', 'certificate'
  ]);
  if (missing) return { ok: false, error: 'Missing required field: ' + missing };

  if (!isEmail(d.email))    return { ok: false, error: 'That email address does not look valid.' };
  if (!d.photoConsent)      return { ok: false, error: 'Photography consent is required.' };
  if (!d.dataConsent)       return { ok: false, error: 'Personal data consent is required.' };

  const email = String(d.email).trim().toLowerCase();

  // Already registered? Don't create a second row.
  const existing = findRowByEmail(REG_SHEET, email);
  if (existing) {
    return {
      ok: true,
      duplicate: true,
      status: existing.status,
      message: 'You are already registered with this email address.'
    };
  }

  const status = countConfirmed(REG_SHEET) >= CONFIG.REGISTRATION_CAP ? 'Waitlist' : 'Confirmed';

  sheet(REG_SHEET, REG_HEADERS).appendRow([
    new Date(), status, 'Registration form',
    clean(d.fullName), clean(d.chineseName), email,
    clean(d.affiliation), clean(d.department), clean(d.position), clean(d.mobile),
    clean(d.dietary), clean(d.dietaryDetail), clean(d.certificate),
    d.photoConsent ? 'Yes' : 'No', d.dataConsent ? 'Yes' : 'No',
    clean(d.heardFrom)
  ]);

  if (CONFIG.SEND_EMAIL) {
    sendSafely(email, clean(d.fullName), status, null);
  }

  return {
    ok: true,
    status: status,
    registration: capState(REG_SHEET, CONFIG.REGISTRATION_CAP)
  };
}

/* ------------------------------ POSTER ------------------------------------ */

function handlePoster(d) {

  if (isPastDeadline(CONFIG.POSTER_DEADLINE)) {
    return { ok: false, error: 'Poster submission has closed.' };
  }

  const missing = requireFields(d, [
    'fullName', 'email', 'affiliation', 'department', 'position', 'mobile',
    'advisor', 'title', 'abstract', 'topic', 'keywords',
    'dietary', 'certificate'
  ]);
  if (missing) return { ok: false, error: 'Missing required field: ' + missing };

  if (!isEmail(d.email))   return { ok: false, error: 'That email address does not look valid.' };
  if (!d.sizeConfirmed)    return { ok: false, error: 'Please confirm the A0 portrait poster size.' };
  if (!d.publishConsent)   return { ok: false, error: 'Consent to publish the abstract is required.' };
  if (!d.photoConsent)     return { ok: false, error: 'Photography consent is required.' };
  if (!d.dataConsent)      return { ok: false, error: 'Personal data consent is required.' };

  const words = wordCount(d.abstract);
  if (words > CONFIG.ABSTRACT_WORD_LIMIT) {
    return { ok: false, error: 'Abstract is ' + words + ' words; the limit is ' +
                              CONFIG.ABSTRACT_WORD_LIMIT + '.' };
  }

  const email = String(d.email).trim().toLowerCase();

  // One poster per presenting author.
  if (findRowByEmail(POSTER_SHEET, email)) {
    return { ok: false, error: 'A poster has already been submitted with this email address. ' +
                              'Please contact us if you need to change it.' };
  }

  const posterStatus = countConfirmed(POSTER_SHEET) >= CONFIG.POSTER_CAP ? 'Waitlist' : 'Confirmed';
  const posterNo = posterStatus === 'Confirmed' ? countConfirmed(POSTER_SHEET) + 1 : '';

  sheet(POSTER_SHEET, POSTER_HEADERS).appendRow([
    new Date(), posterStatus, posterNo,
    clean(d.fullName), clean(d.chineseName), email,
    clean(d.affiliation), clean(d.department), clean(d.position), clean(d.mobile),
    clean(d.advisor), clean(d.title), clean(d.coAuthors), clean(d.abstract), words,
    clean(d.topic), clean(d.keywords),
    d.awardEntry ? 'Yes' : 'No',
    'Yes', 'Yes'
  ]);

  // Auto-register the presenting author, unless they already registered.
  let regStatus;
  const existingReg = findRowByEmail(REG_SHEET, email);

  if (existingReg) {
    regStatus = existingReg.status;
  } else {
    regStatus = countConfirmed(REG_SHEET) >= CONFIG.REGISTRATION_CAP ? 'Waitlist' : 'Confirmed';
    sheet(REG_SHEET, REG_HEADERS).appendRow([
      new Date(), regStatus, 'Poster form',
      clean(d.fullName), clean(d.chineseName), email,
      clean(d.affiliation), clean(d.department), clean(d.position), clean(d.mobile),
      clean(d.dietary), clean(d.dietaryDetail), clean(d.certificate),
      'Yes', 'Yes', ''
    ]);
  }

  if (CONFIG.SEND_EMAIL) {
    sendSafely(email, clean(d.fullName), regStatus, {
      status: posterStatus,
      title: clean(d.title),
      topic: clean(d.topic),
      number: posterNo
    });
  }

  return {
    ok: true,
    status: posterStatus,
    registrationStatus: regStatus,
    poster: capState(POSTER_SHEET, CONFIG.POSTER_CAP),
    registration: capState(REG_SHEET, CONFIG.REGISTRATION_CAP)
  };
}

/* ------------------------------ EMAIL ------------------------------------- */

/** Never let a mail failure lose someone's submission. */
function sendSafely(email, name, regStatus, poster) {
  try {
    sendConfirmation(email, name, regStatus, poster);
  } catch (err) {
    console.error('Email failed for ' + email + ': ' + err);
  }
}

function sendConfirmation(email, name, regStatus, poster) {

  const waitlisted = regStatus === 'Waitlist';
  const subject = poster
    ? (poster.status === 'Waitlist'
        ? 'Poster received (waitlist) — SSHT 2026'
        : 'Poster accepted — SSHT 2026')
    : (waitlisted
        ? 'Registration received (waitlist) — SSHT 2026'
        : 'Registration confirmed — SSHT 2026');

  let body = '';
  body += '<div style="font-family:Georgia,serif;font-size:15px;line-height:1.6;color:#14302a;max-width:620px">';
  body += '<p>Dear ' + escapeHtml(name) + ',</p>';

  if (poster) {
    if (poster.status === 'Confirmed') {
      body += '<p>Thank you — your poster has been accepted for the symposium below.</p>';
      body += '<p><b>Poster number:</b> ' + poster.number + '<br>';
    } else {
      body += '<p>Thank you — your poster has been received. The poster session has reached ' +
              'its limit of ' + CONFIG.POSTER_CAP + ', so you are currently on the <b>waitlist</b>. ' +
              'We will contact you if a place opens up.</p>';
      body += '<p>';
    }
    body += '<b>Title:</b> ' + escapeHtml(poster.title) + '<br>';
    body += '<b>Topic:</b> ' + escapeHtml(poster.topic) + '</p>';
    body += '<p>Please bring your poster printed at <b>A0 portrait</b> (841 × 1189 mm). ' +
            'Boards and mounting materials will be provided on the day.</p>';

    if (waitlisted) {
      body += '<p>Note: general attendance has also reached its limit of ' +
              CONFIG.REGISTRATION_CAP + ', so your attendance is on the waitlist as well.</p>';
    } else {
      body += '<p>You have also been registered to attend — there is no need to fill in the ' +
              'registration form separately.</p>';
    }

  } else if (waitlisted) {
    body += '<p>Thank you for registering. We have reached our limit of ' +
            CONFIG.REGISTRATION_CAP + ' attendees, so you are currently on the <b>waitlist</b>. ' +
            'We will email you as soon as a place opens up.</p>';
  } else {
    body += '<p>Thank you — your place at the symposium is confirmed.</p>';
  }

  body += '<table style="margin:22px 0;border-collapse:collapse">';
  body += row('Event', CONFIG.EVENT_NAME);
  body += row('Date', CONFIG.EVENT_DATE);
  body += row('Venue', CONFIG.EVENT_VENUE);
  body += '</table>';

  body += '<p>If you need to cancel or change any details, simply reply to this email.</p>';
  body += '<p>We look forward to seeing you in Taichung.</p>';
  body += '<p style="margin-top:24px">— ' + escapeHtml(CONFIG.CONTACT_NAME) + '<br>';
  body += '<span style="color:#5b6b64">' + escapeHtml(CONFIG.CONTACT_EMAIL) + '</span></p>';
  body += '</div>';

  MailApp.sendEmail({
    to: email,
    subject: subject,
    htmlBody: body,
    name: CONFIG.CONTACT_NAME,
    replyTo: CONFIG.CONTACT_EMAIL
  });
}

function row(label, value) {
  return '<tr>' +
    '<td style="padding:5px 16px 5px 0;color:#5b6b64;vertical-align:top;white-space:nowrap">' +
      escapeHtml(label) + '</td>' +
    '<td style="padding:5px 0">' + escapeHtml(value) + '</td></tr>';
}

/* ------------------------------ HELPERS ----------------------------------- */

function sheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#14302a')
      .setFontColor('#f0ece1');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Count rows whose Status column reads 'Confirmed'. */
function countConfirmed(name) {
  const sh = sheet(name, name === REG_SHEET ? REG_HEADERS : POSTER_HEADERS);
  const last = sh.getLastRow();
  if (last < 2) return 0;
  return sh.getRange(2, 2, last - 1, 1)   // column B = Status
           .getValues()
           .filter(function (r) { return String(r[0]).trim() === 'Confirmed'; })
           .length;
}

function capState(name, cap) {
  const count = countConfirmed(name);
  return { count: count, cap: cap, full: count >= cap };
}

/** Find a row by email. Email is column F in both sheets. */
function findRowByEmail(name, email) {
  const sh = sheet(name, name === REG_SHEET ? REG_HEADERS : POSTER_HEADERS);
  const last = sh.getLastRow();
  if (last < 2) return null;

  const values = sh.getRange(2, 1, last - 1, 6).getValues();  // A..F
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][5]).trim().toLowerCase() === email) {
      return { row: i + 2, status: String(values[i][1]).trim() };
    }
  }
  return null;
}

function requireFields(d, fields) {
  for (let i = 0; i < fields.length; i++) {
    const v = d[fields[i]];
    if (v === undefined || v === null || String(v).trim() === '') return fields[i];
  }
  return null;
}

function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
}

function wordCount(text) {
  const t = String(text || '').trim();
  return t ? t.split(/\s+/).length : 0;
}

function isPastDeadline(deadline) {
  if (!deadline) return false;
  const end = new Date(deadline + 'T23:59:59+08:00');
  return new Date() > end;
}

function clean(v) {
  return v === undefined || v === null ? '' : String(v).trim();
}

function escapeHtml(v) {
  return String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------------------------- ADMIN TOOLS --------------------------------- */

/**
 * Run this once from the editor to create both sheets with their headers,
 * and to trigger the permission prompt before anyone uses the form.
 */
function setup() {
  sheet(REG_SHEET, REG_HEADERS);
  sheet(POSTER_SHEET, POSTER_HEADERS);
  MailApp.getRemainingDailyQuota();   // forces the Gmail permission prompt
  SpreadsheetApp.getUi().alert(
    'Setup complete.\n\n' +
    'Sheets ready: "' + REG_SHEET + '" and "' + POSTER_SHEET + '".\n' +
    'Now deploy: Deploy → New deployment → Web app.'
  );
}

/**
 * Promote the longest-waiting person off the waitlist, on either sheet.
 * Use this from the Extensions → Apps Script editor when someone cancels.
 */
function promoteFromWaitlist() {
  const ui = SpreadsheetApp.getUi();
  const which = ui.prompt('Promote from waitlist',
    'Type "reg" for attendees or "poster" for posters:', ui.ButtonSet.OK_CANCEL);
  if (which.getSelectedButton() !== ui.Button.OK) return;

  const answer = which.getResponseText().trim().toLowerCase();
  const name = answer === 'poster' ? POSTER_SHEET : REG_SHEET;
  const cap = answer === 'poster' ? CONFIG.POSTER_CAP : CONFIG.REGISTRATION_CAP;

  if (countConfirmed(name) >= cap) {
    ui.alert('Still full — free a place first by changing someone\'s Status to "Cancelled".');
    return;
  }

  const sh = sheet(name, name === REG_SHEET ? REG_HEADERS : POSTER_HEADERS);
  const last = sh.getLastRow();
  const statuses = sh.getRange(2, 2, last - 1, 1).getValues();

  for (let i = 0; i < statuses.length; i++) {
    if (String(statuses[i][0]).trim() === 'Waitlist') {
      sh.getRange(i + 2, 2).setValue('Confirmed');
      const email = sh.getRange(i + 2, 6).getValue();
      const person = sh.getRange(i + 2, 4).getValue();
      ui.alert('Promoted: ' + person + ' (' + email + ')\n\nRemember to email them.');
      return;
    }
  }
  ui.alert('Nobody on the waitlist.');
}

/** Adds an admin menu to the spreadsheet. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('SSHT 2026')
    .addItem('Run setup', 'setup')
    .addItem('Promote from waitlist', 'promoteFromWaitlist')
    .addToUi();
}
