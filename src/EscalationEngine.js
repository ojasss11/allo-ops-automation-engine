/**
 * Manager alerts, leadership escalation, and the dashboard queue.
 *
 * Mail is stamped only after MailApp succeeds. A second poll finds the stamp
 * and does not send again. Working hours are 09:00–18:00 on CFG_WEEKDAYS
 * in the configured timezone. Ack checkboxes stay bound to Cycle_ID.
 */

/**
 * Working hours between two instants. Time outside 09:00–18:00 and time on
 * non-working days adds zero. Returns hours, including fractions.
 * @param {Date} start
 * @param {Date} end
 * @return {number}
 */
function calculateWorkingHoursElapsed(start, end) {
  if (!(start instanceof Date) || isNaN(start.getTime())) {
    throw new TypeError('start must be a Date.');
  }
  if (!(end instanceof Date) || isNaN(end.getTime())) {
    throw new TypeError('end must be a Date.');
  }
  if (end.getTime() <= start.getTime()) return 0;
  const settings = Config.getSettings();
  const timezone = settings.timezone;
  const weekdays = settings.weekdayNumbers;
  const startDay = wallDate_(start, timezone);
  const endDay = wallDate_(end, timezone);
  const startMinute = minutesOfDay_(start, timezone);
  const endMinute = minutesOfDay_(end, timezone);
  const open = Config.WORKING_WINDOW.START_HOUR * 60 + Config.WORKING_WINDOW.START_MINUTE;
  const close = Config.WORKING_WINDOW.END_HOUR * 60 + Config.WORKING_WINDOW.END_MINUTE;
  let minutes = 0;
  let guard = 0;
  for (
    let day = startDay;
    TaskEngine.diffCalendarDays(day, endDay) <= 0;
    day = TaskEngine.addCalendarDays(day, 1)
  ) {
    if (++guard > 4000) throw new Error('Working-hour span is too long.');
    if (!TaskEngine.isWorkingDay(day, weekdays)) continue;
    let from = open;
    let to = close;
    if (TaskEngine.diffCalendarDays(day, startDay) === 0) from = Math.max(from, startMinute);
    if (TaskEngine.diffCalendarDays(day, endDay) === 0) to = Math.min(to, endMinute);
    if (to > from) minutes += to - from;
  }
  return minutes / 60;
}

/**
 * One manager email per cycle that is due or overdue at the cutoff.
 * @param {Date=} now
 * @return {AlertBatch}
 */
function checkAndSendManagerAlerts(now) {
  try {
    return Config.withScriptLock(function () {
      Config.clearCache();
      return checkAndSendManagerAlertsUnlocked_(resolveNow_(now));
    });
  } catch (err) {
    console.error('Manager alerts failed.', err);
    return { ok: false, sent: [], skipped: [], errors: [{ message: err.message || String(err) }] };
  }
}

/**
 * One leadership email per cycle. Ack miss wins when both rules are true.
 * @param {Date=} now
 * @return {AlertBatch}
 */
function checkAndSendLeadershipEscalations(now) {
  try {
    return Config.withScriptLock(function () {
      Config.clearCache();
      return checkAndSendLeadershipEscalationsUnlocked_(resolveNow_(now));
    });
  } catch (err) {
    console.error('Leadership escalations failed.', err);
    return { ok: false, sent: [], skipped: [], errors: [{ message: err.message || String(err) }] };
  }
}

/**
 * Writes Manager_Ack once. A second call leaves the existing stamp.
 * @param {string} cycleId
 * @param {string} ackEmail
 * @param {Date=} now
 * @return {AckResult}
 */
function handleManagerAck(cycleId, ackEmail, now) {
  try {
    return Config.withScriptLock(function () {
      Config.clearCache();
      return handleManagerAckUnlocked_(cycleId, ackEmail, resolveNow_(now));
    });
  } catch (err) {
    console.error('Manager ack failed.', err);
    return { ok: false, created: false, cycleId: cycleId || '', stamp: '', reason: err.message || String(err) };
  }
}

/**
 * Flushes untamped Ack ticks, then rewrites column A without moving a tick
 * onto a different cycle.
 * @param {Date=} now
 * @return {QueueResult}
 */
function refreshManagerQueue(now) {
  try {
    return Config.withScriptLock(function () {
      Config.clearCache();
      return refreshManagerQueueUnlocked_(resolveNow_(now));
    });
  } catch (err) {
    console.error('Manager queue refresh failed.', err);
    return { ok: false, rows: [], acksFlushed: [], errors: [{ message: err.message || String(err) }] };
  }
}

/**
 * Cycle job, then Ack flush, manager mail, leadership mail, and a final queue refresh.
 * @param {Date=} now
 * @return {PollResult}
 */
function runAlertAndEscalationPoll(now) {
  try {
    return Config.withScriptLock(function () {
      Config.clearCache();
      const clock = resolveNow_(now);
      return runAlertAndEscalationPollUnlocked_(clock);
    });
  } catch (err) {
    console.error('Alert poll failed.', err);
    return {
      ok: false,
      now: '',
      cycles: null,
      alerts: null,
      escalations: null,
      queue: null,
      errors: [{ message: err.message || String(err) }]
    };
  }
}

function runAlertAndEscalationPollUnlocked_(now) {
  const day = Utilities.formatDate(now, Config.getSettings().timezone, 'yyyy-MM-dd');
  let cycles = null;
  const errors = [];
  try {
    cycles = TaskEngine.ensureCurrentCyclesUnlocked(day);
    if (cycles && cycles.ok === false) {
      errors.push({ message: 'Cycle job reported errors.' });
    }
  } catch (err) {
    errors.push({ message: err.message || String(err) });
    console.error('Cycle job during the alert poll failed.', err);
  }

  // Stamp a ticked Ack before escalation, so this run does not page leadership
  // for a review that is already on the dashboard.
  const primed = refreshManagerQueueUnlocked_(now);
  const alerts = checkAndSendManagerAlertsUnlocked_(now);
  const escalations = checkAndSendLeadershipEscalationsUnlocked_(now);
  const queue = refreshManagerQueueUnlocked_(now);
  const ok = errors.length === 0 && alerts.ok && escalations.ok && primed.ok && queue.ok;
  console.log(
    'Alert poll ' + day + ' sent ' + alerts.sent.length + ' manager email(s) and ' +
    escalations.sent.length + ' leadership email(s).'
  );
  return {
    ok: ok,
    now: Utilities.formatDate(now, Config.getSettings().timezone, 'yyyy-MM-dd HH:mm:ss'),
    cycles: cycles,
    alerts: alerts,
    escalations: escalations,
    queue: queue,
    acksFlushed: primed.acksFlushed.concat(queue.acksFlushed),
    errors: errors
  };
}

function checkAndSendManagerAlertsUnlocked_(now) {
  const settings = Config.getSettings();
  const context = loadOps_(settings, now);
  const sent = [];
  const skipped = [];
  const errors = [];
  for (let i = 0; i < context.cycles.length; i++) {
    const cycle = context.cycles[i];
    if (!cycle.task) {
      if (isAlertStatus_(cycle.status)) {
        errors.push({ cycleId: cycle.cycleId, message: 'Task is missing from Task_Master.' });
      }
      continue;
    }
    if (!cycle.task.active) {
      if (isAlertStatus_(cycle.status)) {
        skipped.push({ cycleId: cycle.cycleId, reason: 'Task is inactive.' });
      }
      continue;
    }
    if (!isAlertStatus_(cycle.status)) continue;
    if (cycle.alertSentAt) {
      skipped.push({ cycleId: cycle.cycleId, reason: 'Manager alert already sent.' });
      continue;
    }
    const cutoff = instantOn_(cycle.due, cycle.task.dueByTime, settings.timezone);
    if (now.getTime() < cutoff.getTime()) {
      skipped.push({ cycleId: cycle.cycleId, reason: 'Before the due cutoff.' });
      continue;
    }
    const current = readLogCell_(context.logSheet, cycle.rowNumber, Config.COLS.EXECUTION_LOG.MANAGER_ALERT_SENT_AT);
    if (alertHasValue_(current)) {
      skipped.push({ cycleId: cycle.cycleId, reason: 'Manager alert already sent.' });
      continue;
    }
    if (!isEmail_(settings.managerEmail)) {
      errors.push({ cycleId: cycle.cycleId, message: 'Manager_Email is empty.' });
      continue;
    }
    try {
      sendMail_({
        to: settings.managerEmail,
        subject: managerSubject_(cycle),
        body: managerBody_(cycle, settings)
      });
      writeDateTime_(context.logSheet, cycle.rowNumber, Config.COLS.EXECUTION_LOG.MANAGER_ALERT_SENT_AT, now);
      cycle.alertSentAt = now;
      sent.push({ cycleId: cycle.cycleId, to: settings.managerEmail });
    } catch (err) {
      errors.push({ cycleId: cycle.cycleId, message: err.message || String(err) });
      console.error('Manager email failed for ' + cycle.cycleId + '.', err);
    }
  }
  return { ok: errors.length === 0, sent: sent, skipped: skipped, errors: errors };
}

function checkAndSendLeadershipEscalationsUnlocked_(now) {
  const settings = Config.getSettings();
  const context = loadOps_(settings, now);
  const sent = [];
  const skipped = [];
  const errors = [];
  const recipients = settings.leadershipEmails.join(',');
  for (let i = 0; i < context.cycles.length; i++) {
    const cycle = context.cycles[i];
    if (!cycle.task) {
      if (cycle.alertSentAt || queueOpenStatus_(cycle.status)) {
        errors.push({ cycleId: cycle.cycleId, message: 'Task is missing from Task_Master.' });
      }
      continue;
    }
    if (cycle.escalationStamp) {
      skipped.push({ cycleId: cycle.cycleId, reason: 'Leadership escalation already sent.' });
      continue;
    }
    const reason = escalationReason_(cycle, now, settings);
    if (!reason) continue;
    const current = alertText_(
      readLogCell_(context.logSheet, cycle.rowNumber, Config.COLS.EXECUTION_LOG.LEADERSHIP_ESCALATION)
    );
    if (current) {
      skipped.push({ cycleId: cycle.cycleId, reason: 'Leadership escalation already sent.' });
      continue;
    }
    if (!recipients) {
      errors.push({ cycleId: cycle.cycleId, message: 'Leadership_Emails is empty.' });
      continue;
    }
    try {
      sendMail_({
        to: recipients,
        subject: leadershipSubject_(cycle, reason),
        body: leadershipBody_(cycle, reason, settings)
      });
      const stamp = stampText_(now, settings.timezone) + ' | ' + reason;
      writeText_(context.logSheet, cycle.rowNumber, Config.COLS.EXECUTION_LOG.LEADERSHIP_ESCALATION, stamp);
      cycle.escalationStamp = stamp;
      sent.push({ cycleId: cycle.cycleId, to: recipients, reason: reason });
    } catch (err) {
      errors.push({ cycleId: cycle.cycleId, message: err.message || String(err) });
      console.error('Leadership email failed for ' + cycle.cycleId + '.', err);
    }
  }
  return { ok: errors.length === 0, sent: sent, skipped: skipped, errors: errors };
}

function escalationReason_(cycle, now, settings) {
  const ackMissed = !!cycle.alertSentAt &&
    !cycle.ackStamp &&
    calculateWorkingHoursElapsed(cycle.alertSentAt, now) >= settings.ackSlaHours;
  const deadline = resolutionInstant_(cycle.due, cycle.task.dueByTime, settings.resolveWorkingDays, settings);
  const unresolved = !cycle.completedAt && now.getTime() >= deadline.getTime();
  if (ackMissed) return Config.ESCALATION.MGR_ACK_MISSED;
  if (unresolved) return Config.ESCALATION.UNRESOLVED_SLA;
  return '';
}

function handleManagerAckUnlocked_(cycleId, ackEmail, now) {
  const id = alertText_(cycleId);
  if (!id) return { ok: false, created: false, cycleId: '', stamp: '', reason: 'Cycle_ID is required.' };
  const email = resolveAckEmail_(ackEmail);
  if (!email) {
    return { ok: false, created: false, cycleId: id, stamp: '', reason: 'Ack needs an email address.' };
  }
  const settings = Config.getSettings();
  const logSheet = Config.getSheet(Config.SHEETS.EXECUTION_LOG);
  Config.assertHeaders(logSheet, Config.HEADERS.EXECUTION_LOG);
  const hit = findAckLogRow_(logSheet, id);
  if (!hit) {
    return { ok: false, created: false, cycleId: id, stamp: '', reason: 'Cycle ' + id + ' is not in Execution_Log.' };
  }
  const existing = alertText_(readLogCell_(logSheet, hit.rowNumber, Config.COLS.EXECUTION_LOG.MANAGER_ACK));
  if (existing) {
    return { ok: true, created: false, cycleId: id, stamp: existing, reason: 'Ack already recorded.' };
  }
  const again = alertText_(readLogCell_(logSheet, hit.rowNumber, Config.COLS.EXECUTION_LOG.MANAGER_ACK));
  if (again) {
    return { ok: true, created: false, cycleId: id, stamp: again, reason: 'Ack already recorded.' };
  }
  const stamp = stampText_(now, settings.timezone) + ' | ' + email;
  writeText_(logSheet, hit.rowNumber, Config.COLS.EXECUTION_LOG.MANAGER_ACK, stamp);
  return { ok: true, created: true, cycleId: id, stamp: stamp, reason: '' };
}

function refreshManagerQueueUnlocked_(now) {
  const settings = Config.getSettings();
  const dashboard = Config.getSheet(Config.SHEETS.MANAGER_DASHBOARD);
  assertQueueHeaders_(dashboard);
  ensureQueueRows_(dashboard);
  const context = loadOps_(settings, now);
  const height = queueHeight_();
  const previous = readQueueTicks_(dashboard, height);
  const acksFlushed = [];
  const errors = [];

  for (let i = 0; i < previous.length; i++) {
    const tick = previous[i];
    if (!tick.cycleId || !tick.checked) continue;
    const cycle = context.byId[tick.cycleId];
    if (cycle && cycle.ackStamp) continue;
    const ack = handleManagerAckUnlocked_(tick.cycleId, '', now);
    if (ack.ok && ack.stamp && cycle) cycle.ackStamp = ack.stamp;
    if (ack.created) acksFlushed.push(tick.cycleId);
    else if (!ack.ok) errors.push({ cycleId: tick.cycleId, message: ack.reason });
  }

  const included = context.cycles.filter(includeInQueue_).sort(compareQueue_);
  const kept = included.slice(0, height);
  if (included.length > height) {
    errors.push({ message: 'Queue shows ' + height + ' of ' + included.length + ' cycles.' });
  }

  const ids = alertBlankColumn_(height);
  const checks = [];
  for (let blank = 0; blank < height; blank++) checks.push([false]);
  const rows = [];
  for (let i = 0; i < kept.length; i++) {
    const cycle = kept[i];
    const prior = previousTick_(previous, cycle.cycleId);
    const acked = !!cycle.ackStamp || (prior && prior.checked);
    ids[i][0] = cycle.cycleId;
    checks[i][0] = acked;
    rows.push({
      row: Config.ROWS.DASHBOARD_QUEUE_START + i,
      cycleId: cycle.cycleId,
      status: cycle.status,
      ack: acked
    });
  }

  const start = Config.ROWS.DASHBOARD_QUEUE_START;
  const idCol = Config.COLS.MANAGER_QUEUE.CYCLE_ID;
  const ackCol = Config.COLS.MANAGER_QUEUE.ACK;
  dashboard.getRange(start, idCol, height, 1).setValues(ids);
  const ackRange = dashboard.getRange(start, ackCol, height, 1);
  try {
    ackRange.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  } catch (err) {
    console.warn('Could not refresh Ack checkboxes.', err);
  }
  ackRange.setValues(checks);
  return { ok: errors.length === 0, rows: rows, acksFlushed: acksFlushed, errors: errors };
}

function includeInQueue_(cycle) {
  if (!cycle.task || cycle.status === Config.STATUS.SCHEDULED || !cycle.status) return false;
  if (queueOpenStatus_(cycle.status)) return true;
  if (cycle.alertSentAt && (!cycle.completedAt || cycle.completedRecently)) return true;
  if (cycle.escalatedRecently) return true;
  return false;
}

function queueOpenStatus_(status) {
  return status === Config.STATUS.PENDING ||
    status === Config.STATUS.DUE_TODAY ||
    status === Config.STATUS.OVERDUE;
}

function isAlertStatus_(status) {
  return status === Config.STATUS.DUE_TODAY || status === Config.STATUS.OVERDUE;
}

function compareQueue_(left, right) {
  const rank = queueStatusRank_(left.status) - queueStatusRank_(right.status);
  if (rank !== 0) return rank;
  const due = left.due.getTime() - right.due.getTime();
  if (due !== 0) return due;
  const name = left.task.assignedTo.localeCompare(right.task.assignedTo);
  if (name !== 0) return name;
  if (left.cycleId < right.cycleId) return -1;
  if (left.cycleId > right.cycleId) return 1;
  return 0;
}

function queueStatusRank_(status) {
  if (status === Config.STATUS.OVERDUE) return 0;
  if (status === Config.STATUS.DUE_TODAY) return 1;
  if (status === Config.STATUS.PENDING) return 2;
  if (status === Config.STATUS.COMPLETED) return 3;
  return 4;
}

function loadOps_(settings, now) {
  const logSheet = Config.getSheet(Config.SHEETS.EXECUTION_LOG);
  const taskSheet = Config.getSheet(Config.SHEETS.TASK_MASTER);
  Config.assertHeaders(logSheet, Config.HEADERS.EXECUTION_LOG);
  Config.assertHeaders(taskSheet, Config.HEADERS.TASK_MASTER);
  const tasks = loadAlertTasks_(taskSheet, settings);
  const today = wallDate_(now, settings.timezone);
  const recentCompletion = TaskEngine.addCalendarDays(today, -7);
  const recentEscalation = TaskEngine.addCalendarDays(today, -14);
  const cycles = [];
  const byId = {};
  const maxRow = logSheet.getMaxRows();
  if (maxRow < Config.ROWS.DATA_START) {
    return { logSheet: logSheet, cycles: cycles, byId: byId };
  }
  const cols = Config.COLS.EXECUTION_LOG;
  const values = logSheet.getRange(Config.ROWS.DATA_START, 1, maxRow - 1, 11).getValues();
  for (let i = 0; i < values.length; i++) {
    const cycleId = alertText_(values[i][cols.CYCLE_ID - 1]);
    if (!cycleId || byId[cycleId]) continue;
    const task = tasks[alertText_(values[i][cols.TASK_ID - 1])] || null;
    const start = calendarFromCell_(values[i][cols.CYCLE_START - 1], settings.timezone);
    const due = calendarFromCell_(values[i][cols.DUE_DATE - 1], settings.timezone);
    if (!start || !due) continue;
    const completedAt = asInstant_(values[i][cols.COMPLETED_AT - 1], settings.timezone);
    const alertSentAt = asInstant_(values[i][cols.MANAGER_ALERT_SENT_AT - 1], settings.timezone);
    const ackStamp = alertText_(values[i][cols.MANAGER_ACK - 1]);
    const escalationStamp = alertText_(values[i][cols.LEADERSHIP_ESCALATION - 1]);
    const completedDay = completedAt ? wallDate_(completedAt, settings.timezone) : null;
    const escalationDay = escalationDate_(escalationStamp);
    const cycle = {
      rowNumber: i + Config.ROWS.DATA_START,
      cycleId: cycleId,
      task: task,
      start: start,
      due: due,
      status: TaskEngine.deriveStatus(start, due, completedAt, today),
      proofValue: alertText_(values[i][cols.PROOF_VALUE - 1]),
      completedAt: completedAt,
      completedRecently: !!completedDay && TaskEngine.diffCalendarDays(completedDay, recentCompletion) >= 0,
      alertSentAt: alertSentAt,
      ackStamp: ackStamp,
      escalationStamp: escalationStamp,
      escalatedRecently: !!escalationDay && TaskEngine.diffCalendarDays(escalationDay, recentEscalation) >= 0
    };
    byId[cycleId] = cycle;
    cycles.push(cycle);
  }
  return { logSheet: logSheet, cycles: cycles, byId: byId };
}

function loadAlertTasks_(sheet, settings) {
  const cols = Config.COLS.TASK_MASTER;
  const byId = {};
  const lastRow = Math.min(sheet.getMaxRows(), Config.ROWS.TASK_MASTER_LAST);
  if (lastRow < Config.ROWS.DATA_START) return byId;
  const values = sheet.getRange(Config.ROWS.DATA_START, 1, lastRow - 1, 11).getValues();
  for (let i = 0; i < values.length; i++) {
    const taskId = alertText_(values[i][cols.TASK_ID - 1]);
    if (!taskId || byId[taskId]) continue;
    const active = alertText_(values[i][cols.ACTIVE - 1]).toLowerCase() === 'yes';
    byId[taskId] = {
      taskId: taskId,
      taskName: alertText_(values[i][cols.TASK_NAME - 1]),
      assignedTo: alertText_(values[i][cols.ASSIGNED_TO - 1]),
      employeeEmail: alertText_(values[i][cols.EMPLOYEE_EMAIL - 1]),
      proofType: alertText_(values[i][cols.PROOF_TYPE - 1]),
      active: active,
      dueByTime: parseDueTime_(values[i][cols.DUE_BY_TIME - 1], settings.defaultDueTime)
    };
  }
  return byId;
}

function managerSubject_(cycle) {
  return '[Allo Ops] Pending: ' + cycle.task.assignedTo + ' — ' + cycle.task.taskName + ' (' + cycle.cycleId + ')';
}

function managerBody_(cycle, settings) {
  return [
    'A recurring task is still open.',
    '',
    'Employee: ' + cycle.task.assignedTo,
    'Email: ' + cycle.task.employeeEmail,
    'Task: ' + cycle.task.taskName,
    'Cycle: ' + cycle.cycleId,
    'Window: ' + TaskEngine.formatIsoDate(cycle.start) + ' → ' + TaskEngine.formatIsoDate(cycle.due),
    'Status: ' + cycle.status,
    'Proof required: ' + cycle.task.proofType,
    'Due cutoff: ' + cycle.task.dueByTime.text + ' ' + settings.timezone,
    '',
    'Open Manager_Dashboard, review this row, and tick Ack.'
  ].join('\n');
}

function leadershipSubject_(cycle, reason) {
  return '[Allo Ops] Escalation ' + reason + ': ' + cycle.task.assignedTo + ' — ' +
    cycle.task.taskName + ' (' + cycle.cycleId + ')';
}

function leadershipBody_(cycle, reason, settings) {
  return [
    'This cycle needs leadership attention.',
    '',
    'Rule: ' + reason,
    'Employee: ' + cycle.task.assignedTo,
    'Email: ' + cycle.task.employeeEmail,
    'Task: ' + cycle.task.taskName,
    'Cycle: ' + cycle.cycleId,
    'Window: ' + TaskEngine.formatIsoDate(cycle.start) + ' → ' + TaskEngine.formatIsoDate(cycle.due),
    'Status: ' + cycle.status,
    'Proof: ' + (cycle.proofValue || 'none'),
    'Manager alert: ' + (cycle.alertSentAt ? stampText_(cycle.alertSentAt, settings.timezone) : 'not sent'),
    'Manager ack: ' + (cycle.ackStamp || 'none'),
    'Completed: ' + (cycle.completedAt ? stampText_(cycle.completedAt, settings.timezone) : 'still open'),
    'Due cutoff: ' + cycle.task.dueByTime.text + ' ' + settings.timezone
  ].join('\n');
}

function sendMail_(message) {
  if (typeof MailApp === 'undefined' || !MailApp.sendEmail) {
    throw new Error('MailApp is unavailable.');
  }
  MailApp.sendEmail({
    to: message.to,
    subject: message.subject,
    body: message.body
  });
}

function resolutionInstant_(due, time, workingDays, settings) {
  let day = due;
  let left = workingDays;
  let guard = 0;
  while (left > 0) {
    if (++guard > 4000) throw new Error('Could not resolve the escalation deadline.');
    day = TaskEngine.addCalendarDays(day, 1);
    if (TaskEngine.isWorkingDay(day, settings.weekdayNumbers)) left -= 1;
  }
  return instantOn_(day, time, settings.timezone);
}

function instantOn_(day, time, timezone) {
  const text = TaskEngine.formatIsoDate(day) + ' ' + alertPad2_(time.hours) + ':' + alertPad2_(time.minutes) + ':00';
  return Utilities.parseDate(text, timezone, 'yyyy-MM-dd HH:mm:ss');
}

function stampText_(date, timezone) {
  return Utilities.formatDate(date, timezone, 'yyyy-MM-dd HH:mm:ss');
}

function wallDate_(date, timezone) {
  const iso = Utilities.formatDate(date, timezone, 'yyyy-MM-dd');
  const day = TaskEngine.calendarDateFromIso(iso);
  if (!day) throw new Error('Could not read a calendar day in ' + timezone + '.');
  return day;
}

function minutesOfDay_(date, timezone) {
  const text = Utilities.formatDate(date, timezone, 'HH:mm:ss');
  const match = /^(\d{2}):(\d{2}):(\d{2})$/.exec(text);
  if (!match) throw new Error('Could not read the time of day.');
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseDueTime_(value, fallback) {
  if (value == null || value === '') return fallback;
  if (value instanceof Date && !isNaN(value.getTime())) {
    return alertTimeParts_(value.getHours(), value.getMinutes());
  }
  if (typeof value === 'string') {
    const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
    if (!match) return fallback;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return fallback;
    return alertTimeParts_(hours, minutes);
  }
  return fallback;
}

function alertTimeParts_(hours, minutes) {
  return { hours: hours, minutes: minutes, text: alertPad2_(hours) + ':' + alertPad2_(minutes) };
}

function asInstant_(value, timezone) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2}))?/.exec(value.trim());
  if (!match) return null;
  try {
    return Utilities.parseDate(match[1] + ' ' + (match[2] || '00:00:00'), timezone, 'yyyy-MM-dd HH:mm:ss');
  } catch (err) {
    return null;
  }
}

function calendarFromCell_(value, timezone) {
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

function escalationDate_(stamp) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(stamp || '');
  if (!match) return null;
  return TaskEngine.calendarDateFromIso(match[1]);
}

function findAckLogRow_(sheet, cycleId) {
  const maxRow = sheet.getMaxRows();
  if (maxRow < Config.ROWS.DATA_START) return null;
  const values = sheet.getRange(Config.ROWS.DATA_START, 1, maxRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (alertText_(values[i][0]) === cycleId) {
      return { rowNumber: i + Config.ROWS.DATA_START };
    }
  }
  return null;
}

function readQueueTicks_(sheet, height) {
  const start = Config.ROWS.DASHBOARD_QUEUE_START;
  const ids = sheet.getRange(start, Config.COLS.MANAGER_QUEUE.CYCLE_ID, height, 1).getValues();
  const checks = sheet.getRange(start, Config.COLS.MANAGER_QUEUE.ACK, height, 1).getValues();
  const ticks = [];
  for (let i = 0; i < ids.length; i++) {
    ticks.push({
      cycleId: alertText_(ids[i][0]),
      checked: checks[i][0] === true || String(checks[i][0]).toUpperCase() === 'TRUE'
    });
  }
  return ticks;
}

function previousTick_(ticks, cycleId) {
  for (let i = 0; i < ticks.length; i++) {
    if (ticks[i].cycleId === cycleId) return ticks[i];
  }
  return null;
}

function readLogCell_(sheet, row, column) {
  return sheet.getRange(row, column).getValue();
}

function writeDateTime_(sheet, row, column, value) {
  const cell = sheet.getRange(row, column);
  cell.setValue(value);
  cell.setNumberFormat('yyyy-mm-dd hh:mm:ss');
}

function writeText_(sheet, row, column, value) {
  const cell = sheet.getRange(row, column);
  cell.setNumberFormat('@');
  cell.setValue(value);
}

function assertQueueHeaders_(sheet) {
  const headers = Config.HEADERS.MANAGER_QUEUE;
  let actual;
  try {
    actual = sheet.getRange(Config.ROWS.DASHBOARD_QUEUE_HEADER, 1, 1, headers.length).getValues()[0];
  } catch (err) {
    throw new Error('Could not read Manager_Dashboard queue headers. ' + err.message);
  }
  for (let i = 0; i < headers.length; i++) {
    const found = actual[i] == null ? '' : String(actual[i]).trim();
    if (found !== headers[i]) {
      throw new Error('Manager_Dashboard queue header ' + headers[i] + ' is missing.');
    }
  }
}

function ensureQueueRows_(sheet) {
  const max = sheet.getMaxRows();
  if (Config.ROWS.DASHBOARD_QUEUE_LAST > max) {
    sheet.insertRowsAfter(max, Config.ROWS.DASHBOARD_QUEUE_LAST - max);
  }
}

function queueHeight_() {
  return Config.ROWS.DASHBOARD_QUEUE_LAST - Config.ROWS.DASHBOARD_QUEUE_START + 1;
}

function alertBlankColumn_(height) {
  const values = [];
  for (let i = 0; i < height; i++) values.push(['']);
  return values;
}

function resolveNow_(now) {
  if (now == null || now === '') return new Date();
  if (now instanceof Date && !isNaN(now.getTime())) return now;
  throw new TypeError('now must be a Date.');
}

function resolveAckEmail_(ackEmail) {
  const given = alertText_(ackEmail);
  if (isEmail_(given)) return given;
  const signedIn = ackEditorEmail_();
  if (isEmail_(signedIn)) return signedIn;
  const manager = Config.getManagerEmail();
  if (isEmail_(manager)) return manager;
  return '';
}

function ackEditorEmail_() {
  try {
    if (typeof Session === 'undefined' || !Session.getActiveUser) return '';
    const user = Session.getActiveUser();
    if (!user || !user.getEmail) return '';
    return alertText_(user.getEmail());
  } catch (err) {
    return '';
  }
}

function isEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value || '');
}

function alertText_(value) {
  return value == null ? '' : String(value).trim();
}

function alertHasValue_(value) {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (value instanceof Date) return !isNaN(value.getTime());
  return true;
}

function alertPad2_(number) {
  return number < 10 ? '0' + number : String(number);
}

const EscalationEngine = Object.freeze({
  calculateWorkingHoursElapsed: calculateWorkingHoursElapsed,
  checkAndSendManagerAlerts: checkAndSendManagerAlerts,
  checkAndSendLeadershipEscalations: checkAndSendLeadershipEscalations,
  handleManagerAck: handleManagerAck,
  refreshManagerQueue: refreshManagerQueue,
  runAlertAndEscalationPoll: runAlertAndEscalationPoll
});
