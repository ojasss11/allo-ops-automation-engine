/**
 * Sheet contract accessors for the Allo Ops workbook.
 * Named ranges are read from Manager_Dashboard. An empty, invalid, or
 * missing range falls back to the seed value in docs/SHEET_SCHEMA.md.
 */
const SHEETS = Object.freeze({
  TASK_MASTER: 'Task_Master',
  EXECUTION_LOG: 'Execution_Log',
  EMPLOYEE_PORTAL: 'Employee_Portal',
  MANAGER_DASHBOARD: 'Manager_Dashboard'
});

/** 1-based column indexes. Row 1 is the header on every data table. */
const COLS = Object.freeze({
  TASK_MASTER: Object.freeze({
    TASK_ID: 1,
    TASK_NAME: 2,
    ASSIGNED_TO: 3,
    EMPLOYEE_EMAIL: 4,
    FREQUENCY: 5,
    FREQUENCY_DAYS: 6,
    PROOF_TYPE: 7,
    CYCLE_ANCHOR: 8,
    ACTIVE: 9,
    DUE_BY_TIME: 10,
    WORK_INSTRUCTION: 11
  }),
  EXECUTION_LOG: Object.freeze({
    CYCLE_ID: 1,
    TASK_ID: 2,
    CYCLE_START: 3,
    DUE_DATE: 4,
    STATUS: 5,
    PROOF_VALUE: 6,
    COMPLETED_BY: 7,
    COMPLETED_AT: 8,
    MANAGER_ALERT_SENT_AT: 9,
    MANAGER_ACK: 10,
    LEADERSHIP_ESCALATION: 11
  }),
  EMPLOYEE_PORTAL: Object.freeze({
    CYCLE_ID: 1,
    TASK_NAME: 2,
    DUE_DATE: 3,
    CYCLE_WINDOW: 4,
    STATUS: 5,
    PROOF_REQUIRED: 6,
    WORK_INSTRUCTION: 7,
    ASSIGNED_TO: 8,
    PROOF_VALUE: 9,
    ENTRY_CHECK: 10,
    SYNC_STATUS: 11
  }),
  MANAGER_QUEUE: Object.freeze({
    CYCLE_ID: 1,
    ASSIGNED_TO: 2,
    TASK_NAME: 3,
    DUE_DATE: 4,
    STATUS: 5,
    DAYS_OVERDUE: 6,
    PROOF_VALUE: 7,
    COMPLETED_AT: 8,
    MANAGER_ALERT_SENT_AT: 9,
    ACK: 10,
    ESCALATION_STATE: 11
  })
});

const ROWS = Object.freeze({
  HEADER: 1,
  DATA_START: 2,
  TASK_MASTER_LAST: 500,
  DASHBOARD_SETTINGS: 2,
  DASHBOARD_QUEUE_LABEL: 4,
  DASHBOARD_QUEUE_HEADER: 5,
  DASHBOARD_QUEUE_START: 6,
  DASHBOARD_QUEUE_LAST: 205,
  PORTAL_LAST: 201
});

const CELLS = Object.freeze({
  PORTAL_VIEW_AS: 'Z1',
  DASHBOARD_QUEUE_LABEL: 'A4'
});

const NAMED_RANGES = Object.freeze({
  MANAGER_EMAIL: 'CFG_MANAGER_EMAIL',
  LEADERSHIP_EMAILS: 'CFG_LEADERSHIP_EMAILS',
  TIMEZONE: 'CFG_TIMEZONE',
  ACK_SLA_HOURS: 'CFG_ACK_SLA_HOURS',
  RESOLVE_WORKING_DAYS: 'CFG_RESOLVE_WORKING_DAYS',
  POLL_MINUTES: 'CFG_POLL_MINUTES',
  WEEKDAYS: 'CFG_WEEKDAYS',
  DEFAULT_DUE_TIME: 'CFG_DEFAULT_DUE_TIME',
  GO_LIVE: 'CFG_GO_LIVE',
  DAILY_TOKEN: 'CFG_DAILY_TOKEN',
  TICKET_REGEX: 'CFG_TICKET_REGEX',
  PORTAL_VIEW_AS: 'PORTAL_VIEW_AS'
});

const HEADERS = Object.freeze({
  TASK_MASTER: Object.freeze([
    'Task_ID',
    'Task_Name',
    'Assigned_To',
    'Employee_Email',
    'Frequency',
    'Frequency_Days',
    'Proof_Type',
    'Cycle_Anchor',
    'Active',
    'Due_By_Time',
    'Work_Instruction'
  ]),
  EXECUTION_LOG: Object.freeze([
    'Cycle_ID',
    'Task_ID',
    'Cycle_Start',
    'Due_Date',
    'Status',
    'Proof_Value',
    'Completed_By',
    'Completed_At',
    'Manager_Alert_Sent_At',
    'Manager_Ack',
    'Leadership_Escalation'
  ]),
  EMPLOYEE_PORTAL: Object.freeze([
    'Cycle_ID',
    'Task_Name',
    'Due_Date',
    'Cycle_Window',
    'Status',
    'Proof_Required',
    'Work_Instruction',
    'Assigned_To',
    'Proof_Value',
    'Entry_Check',
    'Sync_Status'
  ]),
  MANAGER_QUEUE: Object.freeze([
    'Cycle_ID',
    'Assigned_To',
    'Task_Name',
    'Due_Date',
    'Status',
    'Days_Overdue',
    'Proof_Value',
    'Completed_At',
    'Manager_Alert_Sent_At',
    'Ack',
    'Escalation_State'
  ])
});

const FREQUENCY = Object.freeze({
  DAILY: 'Daily',
  EVERY_7: 'Every 7 days',
  EVERY_15: 'Every 15 days',
  EVERY_30: 'Every 30 days'
});

const FREQUENCY_DAYS = Object.freeze({
  Daily: 1,
  'Every 7 days': 7,
  'Every 15 days': 15,
  'Every 30 days': 30
});

const PROOF = Object.freeze({
  TICKET_ID: 'Ticket ID',
  DAILY_CONFIRMATION: 'Daily Confirmation'
});

const ACTIVE = Object.freeze({
  YES: 'Yes',
  NO: 'No'
});

const STATUS = Object.freeze({
  PENDING: 'Pending',
  DUE_TODAY: 'Due Today',
  OVERDUE: 'Overdue',
  SCHEDULED: 'Scheduled',
  COMPLETED: 'Completed'
});

const SYNC_STATUS = Object.freeze({
  SYNCED: 'Synced',
  LOCKED: 'Locked',
  ERROR_PREFIX: 'Error'
});

const ESCALATION = Object.freeze({
  MGR_ACK_MISSED: 'MGR_ACK_MISSED',
  UNRESOLVED_SLA: 'UNRESOLVED_SLA'
});

/** Ack SLA counts time only inside this window. Minutes outside it add zero. */
const WORKING_WINDOW = Object.freeze({
  START_HOUR: 9,
  START_MINUTE: 0,
  END_HOUR: 18,
  END_MINUTE: 0
});

const WEEKDAY_TOKENS = Object.freeze(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

const DEFAULTS = Object.freeze({
  managerEmail: 'manager@example.com',
  leadershipEmails: Object.freeze([
    'leadership.one@example.com',
    'leadership.two@example.com'
  ]),
  timezone: 'Asia/Kolkata',
  ackSlaHours: 4,
  resolveWorkingDays: 1,
  pollMinutes: 30,
  weekdays: Object.freeze(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']),
  defaultDueTime: '18:00',
  goLiveDate: '2026-10-27',
  dailyToken: 'Posted',
  ticketPattern: '^[A-Za-z0-9][A-Za-z0-9_-]{2,30}$',
  portalViewAs: ''
});

const LOCK_WAIT_MS = 30000;
const TASK_ID_PATTERN = /^T-\d{3,}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Depth for the execution-scoped lock. LockService itself is not reentrant. */
let lockDepth_ = 0;
let settingsCache_ = null;

/**
 * Runs fn while this execution holds the script lock.
 * Nested calls reuse the lock already held in this execution.
 * A second execution waits up to LOCK_WAIT_MS and then throws.
 * @param {function(): *} fn
 * @param {number=} waitMs
 * @return {*}
 */
function withScriptLock(fn, waitMs) {
  if (typeof fn !== 'function') {
    throw new TypeError('withScriptLock requires a function.');
  }
  if (lockDepth_ > 0) {
    lockDepth_ += 1;
    try {
      return fn();
    } finally {
      lockDepth_ -= 1;
    }
  }

  let lock;
  try {
    lock = LockService.getScriptLock();
  } catch (err) {
    throw new Error('Script lock is unavailable. ' + err.message);
  }

  const wait = waitMs == null ? LOCK_WAIT_MS : waitMs;
  let acquired = false;
  try {
    acquired = lock.tryLock(wait);
  } catch (err) {
    throw new Error('Script lock request failed. ' + err.message);
  }
  if (!acquired) {
    throw new Error('Timed out waiting for the script lock after ' + wait + 'ms.');
  }

  lockDepth_ = 1;
  try {
    return fn();
  } finally {
    lockDepth_ = 0;
    try {
      lock.releaseLock();
    } catch (releaseErr) {
      console.error('Failed to release the script lock.', releaseErr);
    }
  }
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string[]} headers
 */
function assertHeaders(sheet, headers) {
  if (!sheet) {
    throw new Error('assertHeaders requires a sheet.');
  }
  let actual;
  try {
    actual = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  } catch (err) {
    throw new Error('Could not read headers on ' + sheet.getName() + '. ' + err.message);
  }
  const mismatches = [];
  for (let i = 0; i < headers.length; i++) {
    const found = actual[i] == null ? '' : String(actual[i]).trim();
    if (found !== headers[i]) {
      mismatches.push(columnLetter_(i + 1) + ': expected ' + headers[i] + ', found "' + found + '"');
    }
  }
  if (mismatches.length) {
    throw new Error(sheet.getName() + ' headers do not match the contract. ' + mismatches.join('; '));
  }
}

/**
 * @param {string} name
 * @return {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getSheet(name) {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(name);
  if (!sheet) {
    throw new Error('Missing sheet "' + name + '".');
  }
  return sheet;
}

function clearCache() {
  settingsCache_ = null;
}

function getSettings() {
  if (!settingsCache_) {
    settingsCache_ = loadSettings_();
  }
  return settingsCache_;
}

function getManagerEmail() {
  return getSettings().managerEmail;
}

function getLeadershipEmails() {
  return getSettings().leadershipEmails.slice();
}

function getTimezone() {
  return getSettings().timezone;
}

function getAckSlaHours() {
  return getSettings().ackSlaHours;
}

function getResolveWorkingDays() {
  return getSettings().resolveWorkingDays;
}

function getPollMinutes() {
  return getSettings().pollMinutes;
}

/** @return {string[]} Weekday tokens, Monday-first, from CFG_WEEKDAYS. */
function getWeekdays() {
  return getSettings().weekdays.slice();
}

/** @return {{hours: number, minutes: number, text: string}} */
function getDefaultDueTime() {
  const time = getSettings().defaultDueTime;
  return { hours: time.hours, minutes: time.minutes, text: time.text };
}

/** @return {string} First due-date cutoff for new cycles, yyyy-MM-dd. */
function getGoLiveDate() {
  return getSettings().goLiveDate;
}

function getDailyToken() {
  return getSettings().dailyToken;
}

function getTicketPattern() {
  return getSettings().ticketPattern;
}

/** Blank means the portal uses the signed-in Google account. */
function getPortalViewAs() {
  return getSettings().portalViewAs;
}

function loadSettings_() {
  const managerEmail = resolveString_(
    NAMED_RANGES.MANAGER_EMAIL,
    DEFAULTS.managerEmail,
    function (value) {
      const email = String(value).trim();
      return EMAIL_PATTERN.test(email) ? email : null;
    }
  );
  const leadershipEmails = resolveLeadership_();
  const timezone = resolveString_(
    NAMED_RANGES.TIMEZONE,
    DEFAULTS.timezone,
    function (value) {
      const zone = String(value).trim();
      if (!zone) return null;
      try {
        Utilities.formatDate(new Date(), zone, 'yyyy-MM-dd');
        return zone;
      } catch (err) {
        return null;
      }
    }
  );
  const ackSlaHours = resolveNumber_(
    NAMED_RANGES.ACK_SLA_HOURS,
    DEFAULTS.ackSlaHours,
    1,
    8
  );
  const resolveWorkingDays = resolveNumber_(
    NAMED_RANGES.RESOLVE_WORKING_DAYS,
    DEFAULTS.resolveWorkingDays,
    1,
    5
  );
  const pollMinutes = resolvePollMinutes_();
  const weekdays = resolveWeekdays_();
  const defaultDueTime = resolveDueTime_();
  const goLiveDate = resolveGoLive_(timezone.value);
  const dailyToken = resolveString_(
    NAMED_RANGES.DAILY_TOKEN,
    DEFAULTS.dailyToken,
    function (value) {
      const token = String(value).trim();
      return token.length >= 2 ? token : null;
    }
  );
  const ticketPattern = resolveString_(
    NAMED_RANGES.TICKET_REGEX,
    DEFAULTS.ticketPattern,
    function (value) {
      const pattern = String(value).trim();
      if (!pattern.startsWith('^') || !pattern.endsWith('$')) return null;
      try {
        RegExp(pattern);
        return pattern;
      } catch (err) {
        return null;
      }
    }
  );
  const portalViewAs = resolvePortalViewAs_();

  return {
    managerEmail: managerEmail.value,
    leadershipEmails: leadershipEmails.value,
    timezone: timezone.value,
    ackSlaHours: ackSlaHours.value,
    resolveWorkingDays: resolveWorkingDays.value,
    pollMinutes: pollMinutes.value,
    weekdays: weekdays.value,
    weekdayNumbers: weekdays.value.map(function (token) {
      return WEEKDAY_TOKENS.indexOf(token) + 1;
    }),
    defaultDueTime: defaultDueTime.value,
    goLiveDate: goLiveDate.value,
    dailyToken: dailyToken.value,
    ticketPattern: ticketPattern.value,
    portalViewAs: portalViewAs.value,
    sources: {
      managerEmail: managerEmail.source,
      leadershipEmails: leadershipEmails.source,
      timezone: timezone.source,
      ackSlaHours: ackSlaHours.source,
      resolveWorkingDays: resolveWorkingDays.source,
      pollMinutes: pollMinutes.source,
      weekdays: weekdays.source,
      defaultDueTime: defaultDueTime.source,
      goLiveDate: goLiveDate.source,
      dailyToken: dailyToken.source,
      ticketPattern: ticketPattern.source,
      portalViewAs: portalViewAs.source
    }
  };
}

function resolveLeadership_() {
  const read = readNamed_(NAMED_RANGES.LEADERSHIP_EMAILS);
  if (!read.ok) {
    warnFallback_(NAMED_RANGES.LEADERSHIP_EMAILS, read.reason);
    return { value: DEFAULTS.leadershipEmails.slice(), source: 'default' };
  }
  const emails = String(read.value)
    .split(',')
    .map(function (part) { return part.trim(); })
    .filter(function (part) { return EMAIL_PATTERN.test(part); });
  if (!emails.length) {
    warnFallback_(NAMED_RANGES.LEADERSHIP_EMAILS, 'no valid email');
    return { value: DEFAULTS.leadershipEmails.slice(), source: 'default' };
  }
  return { value: emails, source: 'named' };
}

function resolvePollMinutes_() {
  const read = readNamed_(NAMED_RANGES.POLL_MINUTES);
  if (!read.ok) {
    warnFallback_(NAMED_RANGES.POLL_MINUTES, read.reason);
    return { value: DEFAULTS.pollMinutes, source: 'default' };
  }
  const minutes = asInt_(read.value);
  if (minutes !== 15 && minutes !== 30 && minutes !== 60) {
    warnFallback_(NAMED_RANGES.POLL_MINUTES, 'invalid');
    return { value: DEFAULTS.pollMinutes, source: 'default' };
  }
  return { value: minutes, source: 'named' };
}

function resolveWeekdays_() {
  const read = readNamed_(NAMED_RANGES.WEEKDAYS);
  if (!read.ok) {
    warnFallback_(NAMED_RANGES.WEEKDAYS, read.reason);
    return { value: DEFAULTS.weekdays.slice(), source: 'default' };
  }
  const tokens = String(read.value)
    .split(',')
    .map(function (part) { return canonicalizeWeekday_(part.trim()); });
  if (!tokens.length || tokens.some(function (token) { return !token; })) {
    warnFallback_(NAMED_RANGES.WEEKDAYS, 'invalid');
    return { value: DEFAULTS.weekdays.slice(), source: 'default' };
  }
  return { value: tokens, source: 'named' };
}

function resolveDueTime_() {
  const read = readNamed_(NAMED_RANGES.DEFAULT_DUE_TIME);
  if (!read.ok) {
    warnFallback_(NAMED_RANGES.DEFAULT_DUE_TIME, read.reason);
    return { value: parseTime_(DEFAULTS.defaultDueTime), source: 'default' };
  }
  const time = parseTime_(read.value);
  if (!time) {
    warnFallback_(NAMED_RANGES.DEFAULT_DUE_TIME, 'invalid');
    return { value: parseTime_(DEFAULTS.defaultDueTime), source: 'default' };
  }
  return { value: time, source: 'named' };
}

function resolveGoLive_(timezone) {
  const read = readNamed_(NAMED_RANGES.GO_LIVE);
  if (!read.ok) {
    warnFallback_(NAMED_RANGES.GO_LIVE, read.reason);
    return { value: DEFAULTS.goLiveDate, source: 'default' };
  }
  const iso = isoFromCell_(read.value, timezone);
  if (!iso) {
    warnFallback_(NAMED_RANGES.GO_LIVE, 'invalid');
    return { value: DEFAULTS.goLiveDate, source: 'default' };
  }
  return { value: iso, source: 'named' };
}

function resolvePortalViewAs_() {
  const read = readNamed_(NAMED_RANGES.PORTAL_VIEW_AS);
  if (!read.ok) {
    if (read.reason !== 'empty') {
      warnFallback_(NAMED_RANGES.PORTAL_VIEW_AS, read.reason);
    }
    return { value: '', source: read.reason === 'empty' ? 'named' : 'default' };
  }
  const email = String(read.value).trim();
  if (!email) return { value: '', source: 'named' };
  if (!EMAIL_PATTERN.test(email)) {
    warnFallback_(NAMED_RANGES.PORTAL_VIEW_AS, 'invalid email');
    return { value: '', source: 'default' };
  }
  return { value: email, source: 'named' };
}

function resolveString_(name, fallback, normalize) {
  const read = readNamed_(name);
  if (!read.ok) {
    warnFallback_(name, read.reason);
    return { value: fallback, source: 'default' };
  }
  const normalized = normalize(read.value);
  if (normalized == null || normalized === '') {
    warnFallback_(name, 'invalid');
    return { value: fallback, source: 'default' };
  }
  return { value: normalized, source: 'named' };
}

function resolveNumber_(name, fallback, min, max) {
  const read = readNamed_(name);
  if (!read.ok) {
    warnFallback_(name, read.reason);
    return { value: fallback, source: 'default' };
  }
  const number = asInt_(read.value);
  if (number == null || number < min || number > max) {
    warnFallback_(name, 'invalid');
    return { value: fallback, source: 'default' };
  }
  return { value: number, source: 'named' };
}

function readNamed_(name) {
  try {
    const range = getSpreadsheet_().getRangeByName(name);
    if (!range) return { ok: false, reason: 'missing range' };
    const value = range.getValue();
    if (value == null || (typeof value === 'string' && value.trim() === '')) {
      return { ok: false, reason: 'empty' };
    }
    return { ok: true, value: value };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

function getSpreadsheet_() {
  if (typeof SpreadsheetApp === 'undefined' || !SpreadsheetApp.getActiveSpreadsheet) {
    throw new Error('SpreadsheetApp is unavailable.');
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No active spreadsheet.');
  return ss;
}

function warnFallback_(name, reason) {
  console.warn('Config: ' + name + ' unavailable (' + reason + '). Using the contract default.');
}

function asInt_(value) {
  if (typeof value === 'number' && isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return parseInt(value.trim(), 10);
  return null;
}

function canonicalizeWeekday_(token) {
  for (let i = 0; i < WEEKDAY_TOKENS.length; i++) {
    if (WEEKDAY_TOKENS[i].toLowerCase() === token.toLowerCase()) return WEEKDAY_TOKENS[i];
  }
  return null;
}

/**
 * @param {*} value
 * @return {{hours: number, minutes: number, text: string}|null}
 */
function parseTime_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return timeParts_(value.getHours(), value.getMinutes());
  }
  if (typeof value === 'number' && isFinite(value) && value >= 0 && value < 1) {
    const total = Math.round(value * 24 * 60);
    return timeParts_(Math.floor(total / 60), total % 60);
  }
  if (typeof value === 'string') {
    const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
    if (!match) return null;
    return timeParts_(Number(match[1]), Number(match[2]));
  }
  return null;
}

function timeParts_(hours, minutes) {
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return {
    hours: hours,
    minutes: minutes,
    text: pad2_(hours) + ':' + pad2_(minutes)
  };
}

/**
 * @param {*} value
 * @param {string} timezone
 * @return {string|null}
 */
function isoFromCell_(value, timezone) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    try {
      return Utilities.formatDate(value, timezone, 'yyyy-MM-dd');
    } catch (err) {
      return null;
    }
  }
  if (typeof value === 'string') {
    const match = ISO_DATE_PATTERN.exec(value.trim());
    if (!match) return null;
    return validIso_(match[1], match[2], match[3]);
  }
  return null;
}

function validIso_(yearText, monthText, dayText) {
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return yearText + '-' + pad2_(month) + '-' + pad2_(day);
}

function pad2_(number) {
  return number < 10 ? '0' + number : String(number);
}

function columnLetter_(index) {
  let n = index;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

const Config = Object.freeze({
  SHEETS: SHEETS,
  COLS: COLS,
  ROWS: ROWS,
  CELLS: CELLS,
  NAMED_RANGES: NAMED_RANGES,
  HEADERS: HEADERS,
  FREQUENCY: FREQUENCY,
  FREQUENCY_DAYS: FREQUENCY_DAYS,
  PROOF: PROOF,
  ACTIVE: ACTIVE,
  STATUS: STATUS,
  SYNC_STATUS: SYNC_STATUS,
  ESCALATION: ESCALATION,
  WORKING_WINDOW: WORKING_WINDOW,
  WEEKDAY_TOKENS: WEEKDAY_TOKENS,
  DEFAULTS: DEFAULTS,
  LOCK_WAIT_MS: LOCK_WAIT_MS,
  TASK_ID_PATTERN: TASK_ID_PATTERN,
  withScriptLock: withScriptLock,
  assertHeaders: assertHeaders,
  getSheet: getSheet,
  clearCache: clearCache,
  getSettings: getSettings,
  getManagerEmail: getManagerEmail,
  getLeadershipEmails: getLeadershipEmails,
  getTimezone: getTimezone,
  getAckSlaHours: getAckSlaHours,
  getResolveWorkingDays: getResolveWorkingDays,
  getPollMinutes: getPollMinutes,
  getWeekdays: getWeekdays,
  getDefaultDueTime: getDefaultDueTime,
  getGoLiveDate: getGoLiveDate,
  getDailyToken: getDailyToken,
  getTicketPattern: getTicketPattern,
  getPortalViewAs: getPortalViewAs
});
