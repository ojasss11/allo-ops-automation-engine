/**
 * Spreadsheet menu, edit routing, and the clock trigger.
 *
 * Menu actions toast and return. They do not open a dialog.
 * A simple onEdit cannot take the script lock, so Install 30-Min Trigger
 * also installs one authorized onEdit. Duplicate clicks and duplicate
 * trigger deliveries are ignored for a few seconds. The services underneath
 * still refuse a second completion, ack, or email.
 */

const UI_MENU_TITLE = '🚀 Allo Ops Automation';
const UI_POLL_HANDLER = 'runScheduledPoll';
const UI_EDIT_HANDLER = 'onEdit';
const UI_EDIT_DEBOUNCE_SECONDS = 3;
const UI_MENU_DEBOUNCE_SECONDS = 30;

/** Set while this execution is already inside onEdit. */
let uiEditDepth_ = 0;

/**
 * Adds the Allo Ops menu. Safe to run as a simple trigger.
 * @param {Object=} e
 */
function onOpen(e) {
  try {
    SpreadsheetApp.getUi()
      .createMenu(UI_MENU_TITLE)
      .addItem('Run Cycle Job', 'runCycleJobFromMenu')
      .addItem('Refresh Portal', 'refreshPortalFromMenu')
      .addItem('Refresh Manager Queue', 'refreshManagerQueueFromMenu')
      .addItem('Run Escalation Poll', 'runEscalationPollFromMenu')
      .addSeparator()
      .addItem('Install 30-Min Trigger', 'installTimeDrivenTrigger')
      .addToUi();
    return { ok: true };
  } catch (err) {
    console.error('Allo Ops menu failed.', err);
    return { ok: false, reason: err.message || String(err) };
  }
}

/**
 * Routes a user edit to completion, the portal override, or manager ack.
 * Limited (simple) invocations return without touching the lock.
 * @param {Object} e
 * @return {Object}
 */
function onEdit(e) {
  if (uiEditDepth_ > 0) return { ok: true, skipped: true, reason: 'reentered' };
  uiEditDepth_ += 1;
  try {
    if (!e || !e.range || !e.range.getSheet) {
      return { ok: true, skipped: true, reason: 'no event' };
    }
    if (uiIsSimpleTrigger_(e)) {
      return { ok: true, skipped: true, reason: 'simple trigger' };
    }
    return uiRouteEdit_(e);
  } catch (err) {
    console.error('onEdit failed.', err);
    uiToast_('That edit could not be saved.');
    return { ok: false, reason: err.message || String(err) };
  } finally {
    uiEditDepth_ -= 1;
  }
}

/**
 * Clock-trigger entry. Creates current cycles, then sends any due mail.
 * @return {Object}
 */
function runScheduledPoll() {
  try {
    const result = EscalationEngine.runAlertAndEscalationPoll();
    console.log('Scheduled poll finished. ok=' + !!(result && result.ok));
    return result || { ok: false, reason: 'Poll returned nothing.' };
  } catch (err) {
    console.error('Scheduled poll failed.', err);
    return { ok: false, reason: err.message || String(err) };
  }
}

/** Menu: materialize cycles that are due. */
function runCycleJobFromMenu() {
  return uiMenuAction_('cycle', 'Cycle job', function () {
    return TaskEngine.runCycleJob();
  });
}

/** Menu: rebuild the signed-in employee's portal, or the Z1 override. */
function refreshPortalFromMenu() {
  return uiMenuAction_('portal', 'Portal refresh', function () {
    return EmployeeService.refreshEmployeePortal();
  });
}

/** Menu: flush Ack ticks and rewrite the queue keys. */
function refreshManagerQueueFromMenu() {
  return uiMenuAction_('queue', 'Queue refresh', function () {
    return EscalationEngine.refreshManagerQueue();
  });
}

/** Menu: the same job the 30-minute trigger runs. */
function runEscalationPollFromMenu() {
  return uiMenuAction_('poll', 'Escalation poll', function () {
    return runScheduledPoll();
  });
}

/**
 * Installs one clock trigger at CFG_POLL_MINUTES (30 by default) and one
 * installable onEdit so portal and ack edits can take the script lock.
 * Running it again replaces those triggers instead of adding another.
 * @return {{ok: boolean, minutes?: number, reason?: string, skipped?: boolean}}
 */
function installTimeDrivenTrigger() {
  try {
    if (uiDebounced_('menu:install', UI_MENU_DEBOUNCE_SECONDS)) {
      uiToast_('Install is already running.');
      return { ok: true, skipped: true, reason: 'debounced' };
    }
    const minutes = uiPollMinutes_();
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) throw new Error('No active spreadsheet.');
    uiReplaceTrigger_(UI_POLL_HANDLER, function () {
      const builder = ScriptApp.newTrigger(UI_POLL_HANDLER).timeBased();
      if (minutes >= 60) builder.everyHours(Math.round(minutes / 60));
      else builder.everyMinutes(minutes);
      return builder.create();
    });
    uiReplaceTrigger_(UI_EDIT_HANDLER, function () {
      return ScriptApp.newTrigger(UI_EDIT_HANDLER).forSpreadsheet(spreadsheet).onEdit().create();
    });
    const every = minutes >= 60 ? 'every ' + Math.round(minutes / 60) + ' hour(s)' : 'every ' + minutes + ' minutes';
    uiToast_('Installed a poll ' + every + '. Portal and queue edits will sync.');
    return { ok: true, minutes: minutes };
  } catch (err) {
    console.error('Trigger install failed.', err);
    uiToast_('Could not install the trigger.');
    return { ok: false, reason: err.message || String(err) };
  }
}

function uiRouteEdit_(e) {
  const range = e.range;
  const sheet = range.getSheet();
  const name = sheet.getName();
  const viewAs = uiCellAddress_(Config.CELLS.PORTAL_VIEW_AS);

  if (name === Config.SHEETS.EMPLOYEE_PORTAL && viewAs && uiCovers_(range, viewAs.row, viewAs.column)) {
    return uiGuarded_('portal-view:' + uiNorm_(sheet.getRange(viewAs.row, viewAs.column).getValue()), function () {
      const result = EmployeeService.refreshEmployeePortal();
      uiToast_(uiPortalSummary_(result));
      return result;
    });
  }

  if (name === Config.SHEETS.EMPLOYEE_PORTAL && uiCoversColumn_(range, Config.COLS.EMPLOYEE_PORTAL.PROOF_VALUE)) {
    return uiCompletePortalRows_(sheet, range);
  }

  if (name === Config.SHEETS.MANAGER_DASHBOARD && uiCoversColumn_(range, Config.COLS.MANAGER_QUEUE.ACK)) {
    return uiAckRows_(sheet, range, uiEditorEmail_(e));
  }

  return { ok: true, skipped: true, reason: 'ignored' };
}

function uiCompletePortalRows_(sheet, range) {
  const rows = uiRowsIn_(range, Config.ROWS.DATA_START, Config.ROWS.PORTAL_LAST);
  const saved = [];
  const failed = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!uiProofReady_(sheet, row)) continue;
    const proof = uiNorm_(sheet.getRange(row, Config.COLS.EMPLOYEE_PORTAL.PROOF_VALUE).getValue());
    const result = uiGuarded_('portal-proof:' + row + ':' + proof, function () {
      return EmployeeService.handlePortalCompletion(row);
    });
    if (result && result.skipped) continue;
    if (result && result.ok) saved.push(result.cycleId || String(row));
    else failed.push(result && result.reason ? result.reason : 'Row ' + row);
  }
  if (saved.length === 1 && !failed.length) uiToast_('Saved ' + saved[0] + '.');
  else if (saved.length && !failed.length) uiToast_('Saved ' + saved.length + ' completions.');
  else if (failed.length) uiToast_(failed[0]);
  return { ok: failed.length === 0, saved: saved, failed: failed };
}

function uiAckRows_(sheet, range, email) {
  const rows = uiRowsIn_(range, Config.ROWS.DASHBOARD_QUEUE_START, Config.ROWS.DASHBOARD_QUEUE_LAST);
  const acted = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cycleId = uiText_(sheet.getRange(row, Config.COLS.MANAGER_QUEUE.CYCLE_ID).getValue());
    if (!cycleId) continue;
    const checked = uiIsChecked_(sheet.getRange(row, Config.COLS.MANAGER_QUEUE.ACK).getValue());
    const result = uiGuarded_('ack:' + cycleId + ':' + (checked ? '1' : '0'), function () {
      if (checked) return EscalationEngine.handleManagerAck(cycleId, email);
      return EscalationEngine.refreshManagerQueue();
    });
    if (result && result.skipped) continue;
    acted.push({ cycleId: cycleId, checked: checked, result: result });
    if (checked && result && result.created) uiToast_('Acknowledged ' + cycleId + '.');
    else if (checked && result && result.ok) uiToast_('Already acknowledged.');
    else if (checked) uiToast_(result && result.reason ? result.reason : 'Acknowledgement failed.');
    else if (uiIsChecked_(sheet.getRange(row, Config.COLS.MANAGER_QUEUE.ACK).getValue())) {
      uiToast_('Acknowledgement stays on ' + cycleId + '.');
    }
  }
  return { ok: true, acted: acted };
}

function uiProofReady_(sheet, row) {
  const proof = uiText_(sheet.getRange(row, Config.COLS.EMPLOYEE_PORTAL.PROOF_VALUE).getValue());
  if (!proof) return false;
  const required = uiText_(sheet.getRange(row, Config.COLS.EMPLOYEE_PORTAL.PROOF_REQUIRED).getValue());
  if (!required || required === Config.PROOF.DAILY_CONFIRMATION) {
    if (proof === uiDailyToken_()) return true;
  }
  if (!required || required === Config.PROOF.TICKET_ID) {
    const pattern = uiTicketPattern_();
    if (pattern && pattern.test(proof)) return true;
  }
  return false;
}

function uiMenuAction_(key, label, fn) {
  try {
    if (uiDebounced_('menu:' + key, UI_MENU_DEBOUNCE_SECONDS)) {
      uiToast_(label + ' is already running.');
      return { ok: true, skipped: true, reason: 'debounced' };
    }
    uiToast_(label + '…');
    const result = fn();
    uiToast_(uiMenuSummary_(key, result));
    return result;
  } catch (err) {
    console.error(label + ' failed.', err);
    uiToast_(label + ' failed.');
    return { ok: false, reason: err.message || String(err) };
  }
}

function uiMenuSummary_(key, result) {
  if (!result || result.ok === false) {
    const reason = uiFirstReason_(result);
    return reason || 'Finished with errors.';
  }
  if (key === 'cycle') {
    const count = result.created ? result.created.length : 0;
    return 'Cycle job created ' + count + ' cycle(s).';
  }
  if (key === 'portal') return uiPortalSummary_(result);
  if (key === 'queue') {
    const count = result.rows ? result.rows.length : 0;
    return 'Queue is showing ' + count + ' cycle(s).';
  }
  if (key === 'poll') {
    const alerts = result.alerts && result.alerts.sent ? result.alerts.sent.length : 0;
    const escalations = result.escalations && result.escalations.sent ? result.escalations.sent.length : 0;
    return 'Poll sent ' + alerts + ' manager email(s) and ' + escalations + ' leadership email(s).';
  }
  return 'Done.';
}

function uiPortalSummary_(result) {
  if (!result || result.ok === false) return uiFirstReason_(result) || 'Portal refresh failed.';
  const count = result.rows ? result.rows.length : 0;
  const who = result.email ? ' for ' + result.email : '';
  return 'Portal is showing ' + count + ' open cycle(s)' + who + '.';
}

function uiFirstReason_(result) {
  if (!result) return '';
  if (result.reason) return String(result.reason);
  if (result.errors && result.errors.length && result.errors[0].message) return String(result.errors[0].message);
  return '';
}

function uiGuarded_(key, fn) {
  if (uiDebounced_(key, UI_EDIT_DEBOUNCE_SECONDS)) {
    return { ok: true, skipped: true, reason: 'debounced' };
  }
  return fn();
}

function uiDebounced_(key, seconds) {
  try {
    if (typeof CacheService === 'undefined' || !CacheService.getScriptCache) return false;
    const cache = CacheService.getScriptCache();
    const token = 'alloOps:' + key;
    if (cache.get(token)) return true;
    cache.put(token, '1', seconds);
    return false;
  } catch (err) {
    console.warn('Edit debounce is unavailable.', err);
    return false;
  }
}

function uiReplaceTrigger_(handler, create) {
  const existing = ScriptApp.getProjectTriggers().slice();
  for (let i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction && existing[i].getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(existing[i]);
    }
  }
  return create();
}

function uiPollMinutes_() {
  try {
    const minutes = Config.getPollMinutes();
    if (minutes === 15 || minutes === 30 || minutes === 60) return minutes;
  } catch (err) {
    console.warn('Alert_Poll_Minutes is unavailable. Using 30.', err);
  }
  return 30;
}

function uiRowsIn_(range, minRow, maxRow) {
  const start = Math.max(range.getRow(), minRow);
  const end = Math.min(range.getRow() + range.getNumRows() - 1, maxRow);
  const rows = [];
  for (let row = start; row <= end; row++) rows.push(row);
  return rows;
}

function uiCovers_(range, row, column) {
  const rowStart = range.getRow();
  const colStart = range.getColumn();
  return row >= rowStart &&
    row < rowStart + range.getNumRows() &&
    column >= colStart &&
    column < colStart + range.getNumColumns();
}

function uiCoversColumn_(range, column) {
  const start = range.getColumn();
  return column >= start && column < start + range.getNumColumns();
}

function uiCellAddress_(a1) {
  const match = /^([A-Z]+)(\d+)$/.exec(String(a1 || '').trim().toUpperCase());
  if (!match) return null;
  let column = 0;
  const letters = match[1];
  for (let i = 0; i < letters.length; i++) column = column * 26 + (letters.charCodeAt(i) - 64);
  return { row: Number(match[2]), column: column };
}

function uiEditorEmail_(e) {
  try {
    if (e && e.user && e.user.getEmail) return uiText_(e.user.getEmail());
  } catch (err) {
    return '';
  }
  return '';
}

function uiIsSimpleTrigger_(e) {
  try {
    return !!(e && e.authMode && typeof ScriptApp !== 'undefined' && e.authMode === ScriptApp.AuthMode.LIMITED);
  } catch (err) {
    return false;
  }
}

function uiIsChecked_(value) {
  return value === true || String(value).toUpperCase() === 'TRUE';
}

function uiDailyToken_() {
  try {
    return Config.getDailyToken();
  } catch (err) {
    return Config.DEFAULTS.dailyToken;
  }
}

function uiTicketPattern_() {
  try {
    return new RegExp(Config.getTicketPattern());
  } catch (err) {
    try {
      return new RegExp(Config.DEFAULTS.ticketPattern);
    } catch (inner) {
      return null;
    }
  }
}

function uiToast_(message) {
  const text = String(message || '').slice(0, 200);
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (spreadsheet && spreadsheet.toast) spreadsheet.toast(text, 'Allo Ops', 5);
    else console.log(text);
  } catch (err) {
    console.log(text);
  }
}

function uiNorm_(value) {
  if (uiIsChecked_(value)) return 'TRUE';
  if (value === false || String(value).toUpperCase() === 'FALSE') return 'FALSE';
  return uiText_(value).slice(0, 80);
}

function uiText_(value) {
  return value == null ? '' : String(value).trim();
}

const UIHandler = Object.freeze({
  onOpen: onOpen,
  onEdit: onEdit,
  runScheduledPoll: runScheduledPoll,
  runCycleJobFromMenu: runCycleJobFromMenu,
  refreshPortalFromMenu: refreshPortalFromMenu,
  refreshManagerQueueFromMenu: refreshManagerQueueFromMenu,
  runEscalationPollFromMenu: runEscalationPollFromMenu,
  installTimeDrivenTrigger: installTimeDrivenTrigger
});
