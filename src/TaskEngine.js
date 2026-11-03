/**
 * Recurrence math and the idempotent cycle job.
 *
 * Cycle_Anchor is the first due date. Cycle_ID is `{Task_ID}-{yyyy-MM-dd}`
 * of that due date and is never inserted twice. Daily cycles exist only on
 * CFG_WEEKDAYS. A completed latest cycle spawns exactly one successor, even
 * when that successor has not started.
 *
 * Calendar math uses UTC midnights as date tokens. Sheet values are converted
 * at the boundary with the spreadsheet timezone.
 */
const CYCLE_LOOP_GUARD = 5000;

/**
 * Materializes current cycles and, when the latest cycle is complete, one successor.
 * Holds the script lock. Safe to call from a poll.
 * @param {string|Date=} asOf yyyy-MM-dd or a Date. Omit to use today in the configured timezone.
 * @return {CycleJobResult}
 */
function ensureCurrentCycles(asOf) {
  return Config.withScriptLock(function () {
    return ensureCurrentCyclesUnlocked_(asOf);
  });
}

/**
 * Same as ensureCurrentCycles. Use this only inside a caller that already holds the script lock.
 * @param {string|Date=} asOf
 * @return {CycleJobResult}
 */
function ensureCurrentCyclesUnlocked_(asOf) {
  try {
    return runCycleJob_(asOf);
  } catch (err) {
    console.error('Cycle job failed.', err);
    throw err;
  }
}

/**
 * Writes the next cycle for a completed cycle. Idempotent.
 * Holds the script lock.
 * @param {string} taskId
 * @param {string} completedCycleId
 * @return {SpawnResult}
 */
function spawnSuccessorCycle(taskId, completedCycleId) {
  return Config.withScriptLock(function () {
    return spawnSuccessorCycleUnlocked_(taskId, completedCycleId);
  });
}

/**
 * Same as spawnSuccessorCycle. Use this only inside a caller that already holds the script lock.
 * @param {string} taskId
 * @param {string} completedCycleId
 * @return {SpawnResult}
 */
function spawnSuccessorCycleUnlocked_(taskId, completedCycleId) {
  Config.clearCache();
  const settings = Config.getSettings();
  const today = todayToken_(settings.timezone);
  const logSheet = Config.getSheet(Config.SHEETS.EXECUTION_LOG);
  const taskSheet = Config.getSheet(Config.SHEETS.TASK_MASTER);
  Config.assertHeaders(logSheet, Config.HEADERS.EXECUTION_LOG);
  Config.assertHeaders(taskSheet, Config.HEADERS.TASK_MASTER);

  const loaded = loadTasks_(taskSheet, settings);
  const task = findTask_(loaded.tasks, taskId);
  if (!task) {
    return { ok: false, created: false, cycleId: '', reason: 'Unknown task ' + taskId + '.' };
  }
  if (!task.active) {
    return {
      ok: true,
      created: false,
      cycleId: '',
      reason: 'Task ' + taskId + ' is inactive. No successor is created.'
    };
  }

  const book = loadLog_(logSheet, settings.timezone);
  const completed = book.byId.get(completedCycleId);
  if (!completed || completed.taskId !== task.taskId) {
    return {
      ok: false,
      created: false,
      cycleId: '',
      reason: 'Cycle ' + completedCycleId + ' is not in the log for ' + taskId + '.'
    };
  }
  if (!completed.completed) {
    return {
      ok: false,
      created: false,
      cycleId: '',
      reason: 'Cycle ' + completedCycleId + ' is not completed.'
    };
  }

  const successor = successorOf(completed, task.frequencyDays, settings.weekdayNumbers);
  const goLive = calendarDateFromIso(settings.goLiveDate);
  if (compareDates(successor.due, goLive) < 0) {
    return {
      ok: false,
      created: false,
      cycleId: makeCycleId(task.taskId, successor.due),
      reason: 'Successor is due before Go_Live_Date.'
    };
  }
  if (!isLegalCycle_(task, successor, settings.weekdayNumbers)) {
    return {
      ok: false,
      created: false,
      cycleId: makeCycleId(task.taskId, successor.due),
      reason: 'Successor is not a legal cycle date.'
    };
  }

  const queued = queueCycle_(book, task, successor, today, true);
  writePending_(logSheet, book, settings.timezone);
  flushSpreadsheet_();
  return {
    ok: true,
    created: queued.created,
    cycleId: queued.cycleId,
    cycleStart: formatIsoDate(successor.start),
    dueDate: formatIsoDate(successor.due),
    status: deriveStatus(successor.start, successor.due, null, today),
    reason: queued.created ? '' : 'Cycle already exists.'
  };
}

/**
 * Editor entry point for the cycle job.
 * @return {CycleJobResult}
 */
function runCycleJob() {
  return ensureCurrentCycles();
}

/**
 * @param {string} taskId
 * @param {Date} dueDate UTC calendar token
 * @return {string}
 */
function makeCycleId(taskId, dueDate) {
  if (!Config.TASK_ID_PATTERN.test(taskId)) {
    throw new TypeError('Task_ID must match T-###.');
  }
  return taskId + '-' + formatIsoDate(dueDate);
}

/**
 * @param {Date} anchor First due date.
 * @param {number} frequencyDays 1, 7, 15, or 30.
 * @param {number} index Cycle number starting at 0.
 * @param {number[]} weekdayNumbers ISO weekdays, Monday = 1.
 * @return {{index: number, start: Date, due: Date}}
 */
function cycleForIndex(anchor, frequencyDays, index, weekdayNumbers) {
  assertCalendarDate_(anchor, 'anchor');
  assertFrequency_(frequencyDays);
  if (!isFinite(index) || index < 0 || Math.floor(index) !== index) {
    throw new TypeError('Cycle index must be a non-negative integer.');
  }
  if (frequencyDays === 1) {
    const due = weekdayOnOrAfter_(anchor, index, weekdayNumbers);
    return { index: index, start: due, due: due };
  }
  const due = addCalendarDays(anchor, index * frequencyDays);
  const start = addCalendarDays(due, -(frequencyDays - 1));
  return { index: index, start: start, due: due };
}

/**
 * Current non-daily index. Null when today is still before start(0).
 * Negative floor results are clamped to 0.
 * @param {Date} anchor
 * @param {number} frequencyDays
 * @param {Date} today
 * @return {number|null}
 */
function currentNonDailyIndex(anchor, frequencyDays, today) {
  assertCalendarDate_(anchor, 'anchor');
  assertCalendarDate_(today, 'today');
  assertFrequency_(frequencyDays);
  if (frequencyDays === 1) {
    throw new TypeError('currentNonDailyIndex does not apply to Daily.');
  }
  const start0 = addCalendarDays(anchor, -(frequencyDays - 1));
  if (compareDates(today, start0) < 0) return null;
  const raw = Math.floor(diffCalendarDays(today, anchor) / frequencyDays);
  return Math.max(0, raw);
}

/**
 * Cycles with start <= today and due >= goLive.
 * @param {Date} anchor
 * @param {number} frequencyDays
 * @param {Date} today
 * @param {Date} goLive
 * @param {number[]} weekdayNumbers
 * @return {{index: number, start: Date, due: Date}[]}
 */
function listCyclesThrough(anchor, frequencyDays, today, goLive, weekdayNumbers) {
  assertCalendarDate_(anchor, 'anchor');
  assertCalendarDate_(today, 'today');
  assertCalendarDate_(goLive, 'goLive');
  assertFrequency_(frequencyDays);
  if (frequencyDays === 1) {
    return listDailyCycles_(anchor, today, goLive, weekdayNumbers);
  }

  const start0 = addCalendarDays(anchor, -(frequencyDays - 1));
  if (compareDates(today, start0) < 0) return [];

  const cycles = [];
  for (let n = 0; n < CYCLE_LOOP_GUARD; n++) {
    const cycle = cycleForIndex(anchor, frequencyDays, n, weekdayNumbers);
    if (compareDates(cycle.start, today) > 0) break;
    if (compareDates(cycle.due, goLive) >= 0) cycles.push(cycle);
  }
  if (cycles.length === CYCLE_LOOP_GUARD) {
    throw new Error('Cycle generation exceeded ' + CYCLE_LOOP_GUARD + ' rows for one task.');
  }
  return cycles;
}

/**
 * The single next cycle after a completed one.
 * Daily Fridays advance to the next configured weekday (Monday under the default week).
 * @param {{due: Date, index?: number}} cycle
 * @param {number} frequencyDays
 * @param {number[]} weekdayNumbers
 * @return {{index: number, start: Date, due: Date}}
 */
function successorOf(cycle, frequencyDays, weekdayNumbers) {
  if (!cycle || !cycle.due) throw new TypeError('successorOf requires a cycle due date.');
  assertCalendarDate_(cycle.due, 'due');
  assertFrequency_(frequencyDays);
  const nextIndex = (cycle.index == null ? 0 : cycle.index) + 1;
  if (frequencyDays === 1) {
    const due = nextWorkingDay(cycle.due, weekdayNumbers);
    return { index: nextIndex, start: due, due: due };
  }
  const due = addCalendarDays(cycle.due, frequencyDays);
  const start = addCalendarDays(due, -(frequencyDays - 1));
  return { index: nextIndex, start: start, due: due };
}

/**
 * Status labels owned by the Execution_Log formula. This does not write column E.
 * @param {Date} cycleStart
 * @param {Date} dueDate
 * @param {*} completedAt
 * @param {Date} today
 * @return {string}
 */
function deriveStatus(cycleStart, dueDate, completedAt, today) {
  if (hasValue_(completedAt)) return Config.STATUS.COMPLETED;
  if (!cycleStart || !dueDate) return '';
  assertCalendarDate_(today, 'today');
  if (compareDates(cycleStart, today) > 0) return Config.STATUS.SCHEDULED;
  if (compareDates(dueDate, today) < 0) return Config.STATUS.OVERDUE;
  if (compareDates(dueDate, today) === 0) return Config.STATUS.DUE_TODAY;
  return Config.STATUS.PENDING;
}

/**
 * @param {string} iso
 * @return {Date|null} UTC midnight token
 */
function calendarDateFromIso(iso) {
  if (typeof iso !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

/** @param {Date} date */
function formatIsoDate(date) {
  assertCalendarDate_(date, 'date');
  return (
    date.getUTCFullYear() +
    '-' +
    pad2_(date.getUTCMonth() + 1) +
    '-' +
    pad2_(date.getUTCDate())
  );
}

/** @param {Date} date @param {number} days */
function addCalendarDays(date, days) {
  assertCalendarDate_(date, 'date');
  if (!isFinite(days)) throw new TypeError('days must be a finite number.');
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** @param {Date} later @param {Date} earlier */
function diffCalendarDays(later, earlier) {
  assertCalendarDate_(later, 'later');
  assertCalendarDate_(earlier, 'earlier');
  return Math.round((later.getTime() - earlier.getTime()) / 86400000);
}

/** Monday = 1 … Sunday = 7. Matches WEEKDAY(date, 2). */
function isoWeekday(date) {
  assertCalendarDate_(date, 'date');
  const js = date.getUTCDay();
  return js === 0 ? 7 : js;
}

function isWorkingDay(date, weekdayNumbers) {
  return weekdayNumbers.indexOf(isoWeekday(date)) !== -1;
}

function nextWorkingDay(date, weekdayNumbers) {
  assertWeekdays_(weekdayNumbers);
  let cursor = addCalendarDays(date, 1);
  for (let i = 0; i < 7; i++) {
    if (isWorkingDay(cursor, weekdayNumbers)) return cursor;
    cursor = addCalendarDays(cursor, 1);
  }
  throw new Error('No working day in the next 7 days. Check CFG_WEEKDAYS.');
}

function runCycleJob_(asOf) {
  Config.clearCache();
  const settings = Config.getSettings();
  const today = resolveAsOf_(asOf, settings.timezone);
  const goLive = calendarDateFromIso(settings.goLiveDate);
  if (!goLive) throw new Error('Go_Live_Date is not a valid date.');

  const taskSheet = Config.getSheet(Config.SHEETS.TASK_MASTER);
  const logSheet = Config.getSheet(Config.SHEETS.EXECUTION_LOG);
  Config.assertHeaders(taskSheet, Config.HEADERS.TASK_MASTER);
  Config.assertHeaders(logSheet, Config.HEADERS.EXECUTION_LOG);

  const loaded = loadTasks_(taskSheet, settings);
  const book = loadLog_(logSheet, settings.timezone);
  const created = [];
  const errors = loaded.errors.slice();

  loaded.tasks.forEach(function (task) {
    if (!task.active) return;
    try {
      const added = ensureTask_(task, today, goLive, settings.weekdayNumbers, book);
      for (let i = 0; i < added.length; i++) created.push(added[i]);
    } catch (err) {
      errors.push({ taskId: task.taskId, message: err.message || String(err) });
      console.error('Cycle job skipped ' + task.taskId + '.', err);
    }
  });

  writePending_(logSheet, book, settings.timezone);
  flushSpreadsheet_();

  const result = {
    ok: errors.length === 0,
    asOf: formatIsoDate(today),
    created: created,
    errors: errors
  };
  console.log(
    'Cycle job ' + result.asOf + ' created ' + created.length + ' cycle(s). Errors: ' + errors.length + '.'
  );
  return result;
}

function ensureTask_(task, today, goLive, weekdayNumbers, book) {
  const created = [];
  const cycles = listCyclesThrough(
    task.cycleAnchor,
    task.frequencyDays,
    today,
    goLive,
    weekdayNumbers
  );
  for (let i = 0; i < cycles.length; i++) {
    const queued = queueCycle_(book, task, cycles[i], today, false);
    if (queued.created) created.push(queued.row);
  }

  const latest = latestCycle_(book, task.taskId);
  if (latest && latest.completed && latest.due) {
    const successor = successorOf(latest, task.frequencyDays, weekdayNumbers);
    if (compareDates(successor.due, goLive) < 0) {
      console.warn(task.taskId + ' successor ' + formatIsoDate(successor.due) + ' is before Go_Live_Date. Not created.');
    } else if (!isLegalCycle_(task, successor, weekdayNumbers)) {
      console.warn(task.taskId + ' successor is not a legal cycle date. Not created.');
    } else {
      const queued = queueCycle_(book, task, successor, today, true);
      if (queued.created) created.push(queued.row);
    }
  }
  return created;
}

function queueCycle_(book, task, cycle, today, spawned) {
  const cycleId = makeCycleId(task.taskId, cycle.due);
  if (book.byId.has(cycleId)) {
    return { created: false, cycleId: cycleId, row: null };
  }
  const entry = {
    cycleId: cycleId,
    taskId: task.taskId,
    start: cycle.start,
    due: cycle.due,
    index: cycle.index,
    completed: false,
    pending: true,
    rowNumber: null
  };
  book.byId.set(cycleId, entry);
  if (!book.byTask.has(task.taskId)) book.byTask.set(task.taskId, []);
  book.byTask.get(task.taskId).push(entry);
  book.pending.push(entry);
  return {
    created: true,
    cycleId: cycleId,
    row: {
      cycleId: cycleId,
      taskId: task.taskId,
      cycleStart: formatIsoDate(cycle.start),
      dueDate: formatIsoDate(cycle.due),
      status: deriveStatus(cycle.start, cycle.due, null, today),
      spawned: spawned
    }
  };
}

function latestCycle_(book, taskId) {
  const list = book.byTask.get(taskId) || [];
  let latest = null;
  for (let i = 0; i < list.length; i++) {
    if (!list[i].due) continue;
    if (!latest || compareDates(list[i].due, latest.due) > 0) latest = list[i];
  }
  return latest;
}

function isLegalCycle_(task, cycle, weekdayNumbers) {
  if (task.frequencyDays !== 1) return true;
  return isWorkingDay(cycle.due, weekdayNumbers) && compareDates(cycle.start, cycle.due) === 0;
}

function listDailyCycles_(anchor, today, goLive, weekdayNumbers) {
  assertWeekdays_(weekdayNumbers);
  const cycles = [];
  // nextWorkingDay(anchor - 1) is the first configured weekday on or after anchor.
  let due = nextWorkingDay(addCalendarDays(anchor, -1), weekdayNumbers);
  let index = 0;
  while (compareDates(due, today) <= 0) {
    if (index >= CYCLE_LOOP_GUARD) {
      throw new Error('Daily cycle generation exceeded ' + CYCLE_LOOP_GUARD + ' rows.');
    }
    if (compareDates(due, goLive) >= 0) {
      cycles.push({ index: index, start: due, due: due });
    }
    due = nextWorkingDay(due, weekdayNumbers);
    index += 1;
  }
  return cycles;
}

function weekdayOnOrAfter_(anchor, index, weekdayNumbers) {
  let due = nextWorkingDay(addCalendarDays(anchor, -1), weekdayNumbers);
  for (let i = 0; i < index; i++) due = nextWorkingDay(due, weekdayNumbers);
  return due;
}

function loadTasks_(sheet, settings) {
  const cols = Config.COLS.TASK_MASTER;
  const lastRow = Math.min(sheet.getMaxRows(), Config.ROWS.TASK_MASTER_LAST);
  const tasks = [];
  const errors = [];
  if (lastRow < Config.ROWS.DATA_START) return { tasks: tasks, errors: errors };

  const values = sheet.getRange(Config.ROWS.DATA_START, 1, lastRow - 1, 11).getValues();
  const seen = {};
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const taskId = String(row[cols.TASK_ID - 1] == null ? '' : row[cols.TASK_ID - 1]).trim();
    if (!taskId) break;
    const rowNumber = i + Config.ROWS.DATA_START;
    try {
      const task = parseTask_(row, rowNumber, settings);
      if (seen[task.taskId]) {
        errors.push({ taskId: task.taskId, message: 'Duplicate Task_ID at row ' + rowNumber + '.' });
        continue;
      }
      seen[task.taskId] = true;
      tasks.push(task);
    } catch (err) {
      errors.push({ taskId: taskId, message: err.message || String(err) });
      console.error('Task_Master row ' + rowNumber + ' skipped.', err);
    }
  }
  return { tasks: tasks, errors: errors };
}

function parseTask_(row, rowNumber, settings) {
  const cols = Config.COLS.TASK_MASTER;
  const taskId = String(row[cols.TASK_ID - 1]).trim();
  if (!Config.TASK_ID_PATTERN.test(taskId)) {
    throw new Error('Row ' + rowNumber + ' Task_ID "' + taskId + '" does not match T-###.');
  }
  const frequency = String(row[cols.FREQUENCY - 1] == null ? '' : row[cols.FREQUENCY - 1]).trim();
  const frequencyDays = Config.FREQUENCY_DAYS[frequency];
  if (!frequencyDays) {
    throw new Error('Row ' + rowNumber + ' has unknown Frequency "' + frequency + '".');
  }
  const sheetDays = asFrequencyDays_(row[cols.FREQUENCY_DAYS - 1]);
  if (sheetDays != null && sheetDays !== frequencyDays) {
    console.warn(
      taskId + ' Frequency_Days is ' + sheetDays + ' and Frequency is ' + frequency + '. Using ' + frequencyDays + '.'
    );
  }
  const anchor = calendarDateFromCell_(row[cols.CYCLE_ANCHOR - 1], settings.timezone);
  if (!anchor) throw new Error('Row ' + rowNumber + ' Cycle_Anchor is not a date.');

  const activeText = String(row[cols.ACTIVE - 1] == null ? '' : row[cols.ACTIVE - 1]).trim().toLowerCase();
  if (activeText !== 'yes' && activeText !== 'no') {
    throw new Error('Row ' + rowNumber + ' Active must be Yes or No.');
  }
  if (frequencyDays === 1 && !isWorkingDay(anchor, settings.weekdayNumbers)) {
    console.warn(taskId + ' daily Cycle_Anchor ' + formatIsoDate(anchor) + ' is not a working day. Cycles start on the next working day.');
  }

  return {
    rowNumber: rowNumber,
    taskId: taskId,
    taskName: String(row[cols.TASK_NAME - 1] == null ? '' : row[cols.TASK_NAME - 1]).trim(),
    assignedTo: String(row[cols.ASSIGNED_TO - 1] == null ? '' : row[cols.ASSIGNED_TO - 1]).trim(),
    employeeEmail: String(row[cols.EMPLOYEE_EMAIL - 1] == null ? '' : row[cols.EMPLOYEE_EMAIL - 1]).trim(),
    frequency: frequency,
    frequencyDays: frequencyDays,
    proofType: String(row[cols.PROOF_TYPE - 1] == null ? '' : row[cols.PROOF_TYPE - 1]).trim(),
    cycleAnchor: anchor,
    active: activeText === 'yes',
    dueByTime: parseTaskTime_(row[cols.DUE_BY_TIME - 1], settings.defaultDueTime),
    workInstruction: String(row[cols.WORK_INSTRUCTION - 1] == null ? '' : row[cols.WORK_INSTRUCTION - 1]).trim()
  };
}

function loadLog_(sheet, timezone) {
  const cols = Config.COLS.EXECUTION_LOG;
  const book = {
    byId: new Map(),
    byTask: new Map(),
    pending: [],
    lastOccupiedRow: Config.ROWS.HEADER
  };
  const maxRow = sheet.getMaxRows();
  if (maxRow < Config.ROWS.DATA_START) return book;

  const values = sheet.getRange(Config.ROWS.DATA_START, 1, maxRow - 1, 11).getValues();
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const cycleId = String(row[cols.CYCLE_ID - 1] == null ? '' : row[cols.CYCLE_ID - 1]).trim();
    if (!cycleId) continue;
    const rowNumber = i + Config.ROWS.DATA_START;
    book.lastOccupiedRow = rowNumber;
    if (book.byId.has(cycleId)) {
      console.warn('Duplicate Cycle_ID ' + cycleId + ' at row ' + rowNumber + '. Keeping the first row.');
      continue;
    }
    const taskId = String(row[cols.TASK_ID - 1] == null ? '' : row[cols.TASK_ID - 1]).trim();
    const start = calendarDateFromCell_(row[cols.CYCLE_START - 1], timezone);
    const due = calendarDateFromCell_(row[cols.DUE_DATE - 1], timezone);
    if (!start || !due) {
      console.error('Execution_Log row ' + rowNumber + ' (' + cycleId + ') has an unreadable date. It will not be duplicated.');
    }
    const entry = {
      cycleId: cycleId,
      taskId: taskId,
      start: start,
      due: due,
      index: null,
      completed: hasValue_(row[cols.COMPLETED_AT - 1]),
      pending: false,
      rowNumber: rowNumber
    };
    book.byId.set(cycleId, entry);
    if (taskId) {
      if (!book.byTask.has(taskId)) book.byTask.set(taskId, []);
      book.byTask.get(taskId).push(entry);
    }
  }
  return book;
}

function writePending_(sheet, book, timezone) {
  if (!book.pending.length) return;
  const startRow = book.lastOccupiedRow + 1;
  ensureSheetRows_(sheet, startRow + book.pending.length - 1);
  const values = book.pending.map(function (entry) {
    return [
      entry.cycleId,
      entry.taskId,
      sheetDateFromCalendar_(entry.start, timezone),
      sheetDateFromCalendar_(entry.due, timezone)
    ];
  });
  // Columns A–D only. Column E is the status ARRAYFORMULA.
  sheet.getRange(startRow, 1, values.length, 4).setValues(values);
  sheet.getRange(startRow, Config.COLS.EXECUTION_LOG.CYCLE_START, values.length, 2)
    .setNumberFormat('yyyy-mm-dd');
  for (let i = 0; i < book.pending.length; i++) {
    book.pending[i].pending = false;
    book.pending[i].rowNumber = startRow + i;
  }
  book.lastOccupiedRow = startRow + book.pending.length - 1;
  book.pending = [];
}

function findTask_(tasks, taskId) {
  for (let i = 0; i < tasks.length; i++) {
    if (tasks[i].taskId === taskId) return tasks[i];
  }
  return null;
}

function resolveAsOf_(asOf, timezone) {
  if (asOf == null || asOf === '') return todayToken_(timezone);
  if (typeof asOf === 'string') {
    const date = calendarDateFromIso(asOf.trim());
    if (!date) throw new Error('asOf must be yyyy-MM-dd.');
    return date;
  }
  if (asOf instanceof Date && !isNaN(asOf.getTime())) {
    const iso = Utilities.formatDate(asOf, timezone, 'yyyy-MM-dd');
    const date = calendarDateFromIso(iso);
    if (!date) throw new Error('asOf could not be read in ' + timezone + '.');
    return date;
  }
  throw new TypeError('asOf must be a yyyy-MM-dd string or a Date.');
}

function todayToken_(timezone) {
  const iso = Utilities.formatDate(new Date(), timezone, 'yyyy-MM-dd');
  const date = calendarDateFromIso(iso);
  if (!date) throw new Error('Could not resolve today in ' + timezone + '.');
  return date;
}

function calendarDateFromCell_(value, timezone) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    try {
      return calendarDateFromIso(Utilities.formatDate(value, timezone, 'yyyy-MM-dd'));
    } catch (err) {
      return null;
    }
  }
  if (typeof value === 'string') return calendarDateFromIso(value.trim().slice(0, 10));
  return null;
}

function sheetDateFromCalendar_(date, timezone) {
  return Utilities.parseDate(formatIsoDate(date), timezone, 'yyyy-MM-dd');
}

function parseTaskTime_(value, fallback) {
  if (value == null || value === '') return fallback;
  if (value instanceof Date && !isNaN(value.getTime())) {
    return {
      hours: value.getHours(),
      minutes: value.getMinutes(),
      text: pad2_(value.getHours()) + ':' + pad2_(value.getMinutes())
    };
  }
  if (typeof value === 'string') {
    const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
    if (!match) return fallback;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return fallback;
    return { hours: hours, minutes: minutes, text: pad2_(hours) + ':' + pad2_(minutes) };
  }
  return fallback;
}

function asFrequencyDays_(value) {
  if (typeof value === 'number' && isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function hasValue_(value) {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (value instanceof Date) return !isNaN(value.getTime());
  return true;
}

function ensureSheetRows_(sheet, row) {
  const max = sheet.getMaxRows();
  if (row > max) sheet.insertRowsAfter(max, row - max);
}

function flushSpreadsheet_() {
  try {
    SpreadsheetApp.flush();
  } catch (err) {
    console.warn('Spreadsheet flush failed.', err);
  }
}

function compareDates(left, right) {
  return left.getTime() - right.getTime();
}

function assertCalendarDate_(date, label) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new TypeError(label + ' must be a Date.');
  }
}

function assertFrequency_(frequencyDays) {
  if (frequencyDays !== 1 && frequencyDays !== 7 && frequencyDays !== 15 && frequencyDays !== 30) {
    throw new TypeError('frequencyDays must be 1, 7, 15, or 30.');
  }
}

function assertWeekdays_(weekdayNumbers) {
  if (!weekdayNumbers || !weekdayNumbers.length) {
    throw new Error('Weekday list is empty.');
  }
}

function pad2_(number) {
  return number < 10 ? '0' + number : String(number);
}

const TaskEngine = Object.freeze({
  ensureCurrentCycles: ensureCurrentCycles,
  ensureCurrentCyclesUnlocked: ensureCurrentCyclesUnlocked_,
  spawnSuccessorCycle: spawnSuccessorCycle,
  spawnSuccessorCycleUnlocked: spawnSuccessorCycleUnlocked_,
  runCycleJob: runCycleJob,
  makeCycleId: makeCycleId,
  cycleForIndex: cycleForIndex,
  currentNonDailyIndex: currentNonDailyIndex,
  listCyclesThrough: listCyclesThrough,
  successorOf: successorOf,
  deriveStatus: deriveStatus,
  calendarDateFromIso: calendarDateFromIso,
  formatIsoDate: formatIsoDate,
  addCalendarDays: addCalendarDays,
  diffCalendarDays: diffCalendarDays,
  isoWeekday: isoWeekday,
  isWorkingDay: isWorkingDay,
  nextWorkingDay: nextWorkingDay
});
