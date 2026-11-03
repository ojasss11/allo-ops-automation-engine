/**
 * Employee portal refresh and one-time completion.
 *
 * Column I is the only completion input. Refresh rewrites Cycle_ID for the
 * signed-in employee, or for PORTAL_VIEW_AS when that override is set.
 * Completion copies that proof into Execution_Log once, then asks TaskEngine
 * for the successor cycle. Formula columns B–H and J are never written.
 */

/**
 * Shows this employee's open cycles and sets column I validation.
 * Holds the script lock. Does not append Execution_Log rows.
 * @return {PortalRefreshResult}
 */
function refreshEmployeePortal() {
  try {
    return Config.withScriptLock(function () {
      return refreshEmployeePortalUnlocked_();
    });
  } catch (err) {
    console.error('Employee portal refresh failed.', err);
    return portalFailure_(err);
  }
}

/**
 * Validates portal column I on this row, closes the log cycle once, and spawns the successor.
 * A second call does not change the log. Holds the script lock.
 * @param {number} row 1-based Employee_Portal row.
 * @return {PortalCompletionResult}
 */
function handlePortalCompletion(row) {
  try {
    return Config.withScriptLock(function () {
      return handlePortalCompletionUnlocked_(row);
    });
  } catch (err) {
    console.error('Portal completion failed.', err);
    return completionFailure_(row, err);
  }
}

/**
 * Sets or clears column I validation for one portal row.
 * Daily Confirmation gets a Posted dropdown. Ticket ID gets the ticket pattern.
 * @param {number} row
 * @return {{ok: boolean, row: number, proofType: string, cleared: boolean, reason: string}}
 */
function applyProofValidation(row) {
  try {
    return Config.withScriptLock(function () {
      Config.clearCache();
      return applyProofValidationUnlocked_(row);
    });
  } catch (err) {
    console.error('Proof validation failed on row ' + row + '.', err);
    return {
      ok: false,
      row: row,
      proofType: '',
      cleared: false,
      reason: err.message || String(err)
    };
  }
}

function refreshEmployeePortalUnlocked_() {
  Config.clearCache();
  const settings = Config.getSettings();
  const viewer = resolveViewer_();
  if (!viewer.email) {
    return {
      ok: false,
      email: '',
      source: viewer.source,
      rows: [],
      errors: [{
        message: 'No signed-in account. Set PORTAL_VIEW_AS, or run refresh from an installable trigger.'
      }]
    };
  }

  const portal = Config.getSheet(Config.SHEETS.EMPLOYEE_PORTAL);
  const logSheet = Config.getSheet(Config.SHEETS.EXECUTION_LOG);
  const taskSheet = Config.getSheet(Config.SHEETS.TASK_MASTER);
  Config.assertHeaders(portal, Config.HEADERS.EMPLOYEE_PORTAL);
  Config.assertHeaders(logSheet, Config.HEADERS.EXECUTION_LOG);
  Config.assertHeaders(taskSheet, Config.HEADERS.TASK_MASTER);
  ensurePortalRows_(portal);

  const tasks = loadTaskIndex_(taskSheet);
  const today = todayToken_(settings.timezone);
  const open = listOpenCycles_(logSheet, tasks.byId, today, settings.timezone)
    .filter(function (cycle) {
      return emailsEqual_(cycle.employeeEmail, viewer.email);
    });
  open.sort(compareOpenCycles_);

  const height = portalHeight_();
  const kept = open.slice(0, height);
  const errors = tasks.errors.slice();
  if (open.length > height) {
    errors.push({
      message: 'Portal shows ' + height + ' of ' + open.length + ' open cycles.'
    });
  }

  const previous = readPortalBody_(portal, height);
  const cycleColumn = blankColumn_(height);
  const proofColumn = blankColumn_(height);
  const syncColumn = blankColumn_(height);
  const rows = [];

  for (let i = 0; i < kept.length; i++) {
    const cycle = kept[i];
    const prior = previous.byCycleId[cycle.cycleId] || { proof: '', sync: '' };
    cycleColumn[i][0] = cycle.cycleId;
    proofColumn[i][0] = prior.proof;
    syncColumn[i][0] = preservableSync_(prior.sync) ? prior.sync : '';
    rows.push({
      row: Config.ROWS.DATA_START + i,
      cycleId: cycle.cycleId,
      taskId: cycle.taskId,
      status: cycle.status,
      proofType: cycle.proofType,
      dueDate: TaskEngine.formatIsoDate(cycle.due)
    });
  }

  const portalCols = Config.COLS.EMPLOYEE_PORTAL;
  portal.getRange(Config.ROWS.DATA_START, portalCols.CYCLE_ID, height, 1).setValues(cycleColumn);
  portal.getRange(Config.ROWS.DATA_START, portalCols.PROOF_VALUE, height, 1).setNumberFormat('@');
  portal.getRange(Config.ROWS.DATA_START, portalCols.PROOF_VALUE, height, 1).setValues(proofColumn);
  portal.getRange(Config.ROWS.DATA_START, portalCols.SYNC_STATUS, height, 1).setNumberFormat('@');
  portal.getRange(Config.ROWS.DATA_START, portalCols.SYNC_STATUS, height, 1).setValues(syncColumn);
  portal.getRange(Config.ROWS.DATA_START, portalCols.PROOF_VALUE, height, 1).clearDataValidations();

  for (let i = 0; i < rows.length; i++) {
    const rule = proofValidationRule_(rows[i].row, rows[i].proofType, settings);
    const cell = portal.getRange(rows[i].row, portalCols.PROOF_VALUE);
    if (!rule) {
      cell.setDataValidation(null);
      errors.push({
        cycleId: rows[i].cycleId,
        message: 'Unsupported proof type "' + rows[i].proofType + '".'
      });
    } else {
      cell.setDataValidation(rule);
    }
  }

  flushSpreadsheet_();
  console.log(
    'Portal refresh for ' + viewer.email + ' wrote ' + rows.length + ' open cycle(s).'
  );
  return {
    ok: errors.length === 0,
    email: viewer.email,
    source: viewer.source,
    rows: rows,
    errors: errors
  };
}

function handlePortalCompletionUnlocked_(row) {
  const rowCheck = checkPortalRow_(row);
  if (!rowCheck.ok) return rowCheck.result;

  Config.clearCache();
  const settings = Config.getSettings();
  const viewer = resolveViewer_();
  if (!viewer.email) {
    return finishCompletion_(null, row, false, '', {
      ok: false,
      syncStatus: errorStatus_('No signed-in account'),
      reason: 'No signed-in account. Set PORTAL_VIEW_AS, or run completion from an installable trigger.'
    });
  }

  const portal = Config.getSheet(Config.SHEETS.EMPLOYEE_PORTAL);
  const logSheet = Config.getSheet(Config.SHEETS.EXECUTION_LOG);
  const taskSheet = Config.getSheet(Config.SHEETS.TASK_MASTER);
  Config.assertHeaders(portal, Config.HEADERS.EMPLOYEE_PORTAL);
  Config.assertHeaders(logSheet, Config.HEADERS.EXECUTION_LOG);
  Config.assertHeaders(taskSheet, Config.HEADERS.TASK_MASTER);

  const portalCols = Config.COLS.EMPLOYEE_PORTAL;
  const cycleId = cellText_(portal.getRange(row, portalCols.CYCLE_ID).getValue());
  if (!cycleId) {
    return finishCompletion_(portal, row, true, '', {
      ok: false,
      syncStatus: errorStatus_('Missing cycle'),
      reason: 'Row ' + row + ' has no Cycle_ID.'
    });
  }

  const tasks = loadTaskIndex_(taskSheet);
  const logHit = findLogRow_(logSheet, cycleId);
  if (!logHit) {
    return finishCompletion_(portal, row, true, cycleId, {
      ok: false,
      syncStatus: errorStatus_('Unknown cycle'),
      reason: 'Cycle ' + cycleId + ' is not in Execution_Log.'
    });
  }

  const task = tasks.byId[logHit.taskId];
  if (!task) {
    return finishCompletion_(portal, row, true, cycleId, {
      ok: false,
      syncStatus: errorStatus_('Unknown task'),
      reason: 'Task ' + logHit.taskId + ' is not on Task_Master.'
    });
  }
  if (!emailsEqual_(task.employeeEmail, viewer.email)) {
    return finishCompletion_(portal, row, true, cycleId, {
      ok: false,
      syncStatus: errorStatus_('Not your task'),
      reason: 'Cycle ' + cycleId + ' is not assigned to ' + viewer.email + '.'
    });
  }

  const already = hasValue_(logSheet.getRange(logHit.rowNumber, Config.COLS.EXECUTION_LOG.COMPLETED_AT).getValue());
  let wrote = false;
  if (!already) {
    const proofCell = portal.getRange(row, portalCols.PROOF_VALUE).getValue();
    const check = checkProof_(task.proofType, proofCell, settings);
    if (!check.valid) {
      return finishCompletion_(portal, row, true, cycleId, {
        ok: false,
        syncStatus: errorStatus_(check.message),
        reason: check.message
      });
    }
    const editor = signedInEmail_();
    const completedBy = editor || task.employeeEmail;
    if (!completedBy) {
      return finishCompletion_(portal, row, true, cycleId, {
        ok: false,
        syncStatus: errorStatus_('Missing employee email'),
        reason: 'Completed_By needs a signed-in account or Employee_Email.'
      });
    }
    const stillOpen = !hasValue_(
      logSheet.getRange(logHit.rowNumber, Config.COLS.EXECUTION_LOG.COMPLETED_AT).getValue()
    );
    if (stillOpen) {
      writeCompletion_(logSheet, logHit.rowNumber, check.proof, completedBy);
      wrote = true;
    }
  }

  let spawn;
  try {
    spawn = TaskEngine.spawnSuccessorCycle(task.taskId, cycleId);
  } catch (err) {
    console.error('Successor spawn failed for ' + cycleId + '.', err);
    return finishCompletion_(portal, row, true, cycleId, {
      ok: false,
      syncStatus: errorStatus_(err.message || 'Successor was not created'),
      reason: err.message || String(err),
      spawned: false
    });
  }

  if (!spawn || spawn.ok === false) {
    const reason = spawn && spawn.reason ? spawn.reason : 'Successor was not created.';
    return finishCompletion_(portal, row, true, cycleId, {
      ok: false,
      syncStatus: errorStatus_(reason),
      reason: reason,
      spawned: false,
      successorCycleId: spawn && spawn.cycleId ? spawn.cycleId : ''
    });
  }

  const syncStatus = wrote ? Config.SYNC_STATUS.SYNCED : Config.SYNC_STATUS.LOCKED;
  flushSpreadsheet_();
  return finishCompletion_(portal, row, true, cycleId, {
    ok: true,
    syncStatus: syncStatus,
    reason: wrote ? '' : 'Cycle was already completed.',
    spawned: !!spawn.created,
    successorCycleId: spawn.cycleId || ''
  });
}

function applyProofValidationUnlocked_(row) {
  const rowCheck = checkPortalRow_(row);
  if (!rowCheck.ok) {
    return { ok: false, row: row, proofType: '', cleared: false, reason: rowCheck.result.reason };
  }
  const portal = Config.getSheet(Config.SHEETS.EMPLOYEE_PORTAL);
  const cell = portal.getRange(row, Config.COLS.EMPLOYEE_PORTAL.PROOF_VALUE);
  const cycleId = cellText_(portal.getRange(row, Config.COLS.EMPLOYEE_PORTAL.CYCLE_ID).getValue());
  if (!cycleId) {
    cell.setDataValidation(null);
    return { ok: true, row: row, proofType: '', cleared: true, reason: '' };
  }

  const task = taskForCycle_(cycleId);
  if (!task) {
    cell.setDataValidation(null);
    return {
      ok: false,
      row: row,
      proofType: '',
      cleared: true,
      reason: 'Cycle ' + cycleId + ' has no task.'
    };
  }

  const settings = Config.getSettings();
  const rule = proofValidationRule_(row, task.proofType, settings);
  if (!rule) {
    cell.setDataValidation(null);
    return {
      ok: false,
      row: row,
      proofType: task.proofType,
      cleared: true,
      reason: 'Unsupported proof type "' + task.proofType + '".'
    };
  }
  cell.setDataValidation(rule);
  return { ok: true, row: row, proofType: task.proofType, cleared: false, reason: '' };
}

function proofValidationRule_(row, proofType, settings) {
  const builder = SpreadsheetApp.newDataValidation();
  if (proofType === Config.PROOF.DAILY_CONFIRMATION) {
    return builder
      .requireValueInList([settings.dailyToken], true)
      .setAllowInvalid(false)
      .setHelpText('Choose ' + settings.dailyToken + ' after you post the update.')
      .build();
  }
  if (proofType === Config.PROOF.TICKET_ID) {
    const formula = '=OR(I' + row + '="",REGEXMATCH(TO_TEXT(I' + row + '),CFG_TICKET_REGEX))';
    return builder
      .requireFormulaSatisfied(formula)
      .setAllowInvalid(false)
      .setHelpText('Enter the portal Ticket ID.')
      .build();
  }
  return null;
}

function writeCompletion_(logSheet, logRow, proof, completedBy) {
  const cols = Config.COLS.EXECUTION_LOG;
  const completedAt = new Date();
  logSheet.getRange(logRow, cols.PROOF_VALUE).setNumberFormat('@');
  logSheet.getRange(logRow, cols.COMPLETED_BY).setNumberFormat('@');
  logSheet.getRange(logRow, cols.PROOF_VALUE, 1, 3).setValues([[proof, completedBy, completedAt]]);
  logSheet.getRange(logRow, cols.COMPLETED_AT).setNumberFormat('yyyy-mm-dd hh:mm:ss');
}

function finishCompletion_(portal, row, writeStatus, cycleId, fields) {
  if (writeStatus && portal) {
    portal.getRange(row, Config.COLS.EMPLOYEE_PORTAL.SYNC_STATUS).setNumberFormat('@');
    portal.getRange(row, Config.COLS.EMPLOYEE_PORTAL.SYNC_STATUS).setValue(fields.syncStatus);
  }
  return {
    ok: fields.ok,
    row: row,
    cycleId: cycleId || '',
    syncStatus: fields.syncStatus || '',
    reason: fields.reason || '',
    spawned: !!fields.spawned,
    successorCycleId: fields.successorCycleId || ''
  };
}

function checkProof_(proofType, raw, settings) {
  const text = raw == null ? '' : String(raw);
  if (text.trim() === '') return { valid: false, proof: '', message: 'Missing' };
  if (proofType === Config.PROOF.DAILY_CONFIRMATION) {
    if (text === settings.dailyToken) return { valid: true, proof: text, message: 'Valid' };
    return { valid: false, proof: text, message: 'Select ' + settings.dailyToken };
  }
  if (proofType === Config.PROOF.TICKET_ID) {
    let pattern;
    try {
      pattern = new RegExp(settings.ticketPattern);
    } catch (err) {
      return { valid: false, proof: text, message: 'Ticket pattern is invalid' };
    }
    if (pattern.test(text)) return { valid: true, proof: text, message: 'Valid' };
    return { valid: false, proof: text, message: 'Invalid Ticket ID' };
  }
  return { valid: false, proof: text, message: 'Unknown proof type' };
}

function listOpenCycles_(logSheet, tasksById, today, timezone) {
  const cols = Config.COLS.EXECUTION_LOG;
  const maxRow = logSheet.getMaxRows();
  const cycles = [];
  if (maxRow < Config.ROWS.DATA_START) return cycles;
  const values = logSheet.getRange(Config.ROWS.DATA_START, 1, maxRow - 1, 11).getValues();
  const seen = {};
  for (let i = 0; i < values.length; i++) {
    const cycleId = cellText_(values[i][cols.CYCLE_ID - 1]);
    if (!cycleId || seen[cycleId]) continue;
    seen[cycleId] = true;
    const taskId = cellText_(values[i][cols.TASK_ID - 1]);
    const task = tasksById[taskId];
    if (!task) continue;
    const start = calendarDateFromCell_(values[i][cols.CYCLE_START - 1], timezone);
    const due = calendarDateFromCell_(values[i][cols.DUE_DATE - 1], timezone);
    if (!start || !due) continue;
    const completedAt = hasValue_(values[i][cols.COMPLETED_AT - 1]) ? values[i][cols.COMPLETED_AT - 1] : null;
    const status = TaskEngine.deriveStatus(start, due, completedAt, today);
    if (!isOpenStatus_(status)) continue;
    cycles.push({
      cycleId: cycleId,
      taskId: taskId,
      employeeEmail: task.employeeEmail,
      proofType: task.proofType,
      start: start,
      due: due,
      status: status
    });
  }
  return cycles;
}

function findLogRow_(logSheet, cycleId) {
  const cols = Config.COLS.EXECUTION_LOG;
  const maxRow = logSheet.getMaxRows();
  if (maxRow < Config.ROWS.DATA_START) return null;
  const values = logSheet.getRange(Config.ROWS.DATA_START, cols.CYCLE_ID, maxRow - 1, 2).getValues();
  for (let i = 0; i < values.length; i++) {
    if (cellText_(values[i][0]) === cycleId) {
      return { rowNumber: i + Config.ROWS.DATA_START, taskId: cellText_(values[i][1]) };
    }
  }
  return null;
}

function taskForCycle_(cycleId) {
  const logSheet = Config.getSheet(Config.SHEETS.EXECUTION_LOG);
  const hit = findLogRow_(logSheet, cycleId);
  if (!hit) return null;
  const tasks = loadTaskIndex_(Config.getSheet(Config.SHEETS.TASK_MASTER));
  return tasks.byId[hit.taskId] || null;
}

function loadTaskIndex_(taskSheet) {
  const cols = Config.COLS.TASK_MASTER;
  const byId = {};
  const errors = [];
  const lastRow = Math.min(taskSheet.getMaxRows(), Config.ROWS.TASK_MASTER_LAST);
  if (lastRow < Config.ROWS.DATA_START) return { byId: byId, errors: errors };
  const values = taskSheet.getRange(Config.ROWS.DATA_START, 1, lastRow - 1, 11).getValues();
  for (let i = 0; i < values.length; i++) {
    const taskId = cellText_(values[i][cols.TASK_ID - 1]);
    if (!taskId) break;
    if (!Config.TASK_ID_PATTERN.test(taskId)) {
      errors.push({ taskId: taskId, message: 'Task_ID does not match T-###.' });
      continue;
    }
    if (byId[taskId]) continue;
    byId[taskId] = {
      taskId: taskId,
      employeeEmail: cellText_(values[i][cols.EMPLOYEE_EMAIL - 1]),
      proofType: cellText_(values[i][cols.PROOF_TYPE - 1])
    };
  }
  return { byId: byId, errors: errors };
}

function readPortalBody_(portal, height) {
  const cols = Config.COLS.EMPLOYEE_PORTAL;
  const values = portal.getRange(Config.ROWS.DATA_START, 1, height, 11).getValues();
  const byCycleId = {};
  for (let i = 0; i < values.length; i++) {
    const cycleId = cellText_(values[i][cols.CYCLE_ID - 1]);
    if (!cycleId || byCycleId[cycleId]) continue;
    byCycleId[cycleId] = {
      proof: values[i][cols.PROOF_VALUE - 1] == null ? '' : values[i][cols.PROOF_VALUE - 1],
      sync: cellText_(values[i][cols.SYNC_STATUS - 1])
    };
  }
  return { byCycleId: byCycleId };
}

function resolveViewer_() {
  const override = Config.getPortalViewAs();
  if (override) return { email: String(override).trim(), source: 'PORTAL_VIEW_AS' };
  const signedIn = signedInEmail_();
  if (signedIn) return { email: signedIn, source: 'active-user' };
  return { email: '', source: 'none' };
}

function signedInEmail_() {
  try {
    if (typeof Session === 'undefined' || !Session.getActiveUser) return '';
    const user = Session.getActiveUser();
    if (!user || !user.getEmail) return '';
    return String(user.getEmail() || '').trim();
  } catch (err) {
    console.warn('Signed-in account is unavailable.', err);
    return '';
  }
}

function compareOpenCycles_(left, right) {
  const rank = statusRank_(left.status) - statusRank_(right.status);
  if (rank !== 0) return rank;
  const due = left.due.getTime() - right.due.getTime();
  if (due !== 0) return due;
  if (left.cycleId < right.cycleId) return -1;
  if (left.cycleId > right.cycleId) return 1;
  return 0;
}

function statusRank_(status) {
  if (status === Config.STATUS.OVERDUE) return 0;
  if (status === Config.STATUS.DUE_TODAY) return 1;
  if (status === Config.STATUS.PENDING) return 2;
  return 3;
}

function isOpenStatus_(status) {
  return status === Config.STATUS.PENDING ||
    status === Config.STATUS.DUE_TODAY ||
    status === Config.STATUS.OVERDUE;
}

function preservableSync_(sync) {
  return String(sync || '').indexOf(Config.SYNC_STATUS.ERROR_PREFIX) === 0;
}

function checkPortalRow_(row) {
  if (typeof row !== 'number' || !isFinite(row) || Math.floor(row) !== row) {
    return {
      ok: false,
      result: {
        ok: false,
        row: row,
        cycleId: '',
        syncStatus: '',
        reason: 'row must be a portal row number.',
        spawned: false,
        successorCycleId: ''
      }
    };
  }
  if (row < Config.ROWS.DATA_START || row > Config.ROWS.PORTAL_LAST) {
    return {
      ok: false,
      result: {
        ok: false,
        row: row,
        cycleId: '',
        syncStatus: '',
        reason: 'Row ' + row + ' is outside Employee_Portal data rows.',
        spawned: false,
        successorCycleId: ''
      }
    };
  }
  return { ok: true, result: null };
}

function portalHeight_() {
  return Config.ROWS.PORTAL_LAST - Config.ROWS.DATA_START + 1;
}

function blankColumn_(height) {
  const values = [];
  for (let i = 0; i < height; i++) values.push(['']);
  return values;
}

function ensurePortalRows_(portal) {
  const max = portal.getMaxRows();
  if (Config.ROWS.PORTAL_LAST > max) {
    portal.insertRowsAfter(max, Config.ROWS.PORTAL_LAST - max);
  }
}

function todayToken_(timezone) {
  const iso = Utilities.formatDate(new Date(), timezone, 'yyyy-MM-dd');
  const date = TaskEngine.calendarDateFromIso(iso);
  if (!date) throw new Error('Could not resolve today in ' + timezone + '.');
  return date;
}

function calendarDateFromCell_(value, timezone) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    try {
      return TaskEngine.calendarDateFromIso(Utilities.formatDate(value, timezone, 'yyyy-MM-dd'));
    } catch (err) {
      return null;
    }
  }
  if (typeof value === 'string') return TaskEngine.calendarDateFromIso(value.trim().slice(0, 10));
  return null;
}

function emailsEqual_(left, right) {
  return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
}

function cellText_(value) {
  return value == null ? '' : String(value).trim();
}

function hasValue_(value) {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (value instanceof Date) return !isNaN(value.getTime());
  return true;
}

function errorStatus_(message) {
  const text = String(message || 'Could not save.').replace(/^Error:\s*/, '');
  return Config.SYNC_STATUS.ERROR_PREFIX + ': ' + text;
}

function portalFailure_(err) {
  return {
    ok: false,
    email: '',
    source: '',
    rows: [],
    errors: [{ message: err.message || String(err) }]
  };
}

function completionFailure_(row, err) {
  return {
    ok: false,
    row: row,
    cycleId: '',
    syncStatus: '',
    reason: err.message || String(err),
    spawned: false,
    successorCycleId: ''
  };
}

function flushSpreadsheet_() {
  try {
    SpreadsheetApp.flush();
  } catch (err) {
    console.warn('Spreadsheet flush failed.', err);
  }
}

const EmployeeService = Object.freeze({
  refreshEmployeePortal: refreshEmployeePortal,
  handlePortalCompletion: handlePortalCompletion,
  applyProofValidation: applyProofValidation
});
