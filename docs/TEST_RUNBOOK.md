# Test runbook

Demonstration script for assignment section 6, against the workbook in `docs/SHEET_SCHEMA.md`.

The spreadsheet timezone is **Asia/Kolkata**. Every “today”, cutoff, and stamp in this runbook uses that clock. Menu actions are under **🚀 Allo Ops Automation**.

Run the tests in the order in [Session order](#session-order). Each test still lists its own before and after state, so a reviewer can check one case without reading the others. Do not delete log rows to rewind a demo. Duplicate the whole file before the first cycle job if you need the Monday baseline again.

## Session order

| When (Asia/Kolkata) | Do | Proves |
| --- | --- | --- |
| Saturday 2026-10-31, any time | Optional Test 7 weekend check | No daily row, no mail |
| Monday 2026-11-02, before 18:00 | Setup, baseline, then Test 2 | Ticket completion from the portal only |
| Monday 2026-11-02, 18:00 | Test 4 | Same-day manager email |
| Monday 2026-11-02, 18:10 | Test 5, first half, on `T-001` | Ack while the task is still open |
| Monday 2026-11-02, 18:15 | Test 3, then the rest of Test 5, on `T-001` | `Posted`, then “Resolved after alert” |
| Monday 2026-11-02, 18:20 | Test 1 on `T-002` | 7-day cycle closes and the next cycle appears |
| Tuesday 2026-11-03, 13:00 | Test 6A on `T-002` | `MGR_ACK_MISSED` |
| Copy of the file, Tuesday 2026-11-03, 18:00 | Test 6B on `T-001` | `UNRESOLVED_SLA` |
| After the above | Test 7, then Test 8 | Why the clock is built this way, and why a second run is quiet |

`T-002` is alerted and then completed, and it is never acknowledged. That is what makes Tuesday’s missed-review email fire. `T-001` is acknowledged and then completed on Monday, which is why its leadership reason is shown on a copy of the file instead of this one.

## 0. Setup

### 0.1 Workbook

1. Spreadsheet timezone: `Asia/Kolkata`.
2. Tabs, in order: `Task_Master`, `Execution_Log`, `Employee_Portal`, `Manager_Dashboard`.
3. Headers, formulas, named ranges, dropdowns, and checkboxes match `docs/SHEET_SCHEMA.md`.
4. `Execution_Log!E2` is the status `ARRAYFORMULA`. Leave column E alone.
5. `Employee_Portal` columns B–H and J are formulas. The only typed cell in the task grid is column I.
6. `Manager_Dashboard` queue formulas fill B–I and K from row 6. The only typed queue cell is the Ack checkbox in column J. Checkboxes already exist in `J6:J205`.
7. Apps Script from `src/` is bound to the sheet. Reload the spreadsheet so `onOpen` builds the menu.
8. Run **Install 30-Min Trigger** once and accept the authorization prompt. That installs the 30-minute poll and the edit trigger that saves portal proof and Ack ticks. For these tests, still run **Run Escalation Poll** yourself at the times below so the result is tied to a known minute.

### 0.2 Settings seed

`Manager_Dashboard` row 1 is the field name. Row 2 is the value. `A4` is `ACTION_QUEUE`. Row 5 is the queue header.

| Cell | Setting | Seed |
| --- | --- | --- |
| A2 | `CFG_MANAGER_EMAIL` | `manager@example.com` |
| B2 | `CFG_LEADERSHIP_EMAILS` | `leadership.one@example.com, leadership.two@example.com` |
| C2 | `CFG_TIMEZONE` | `Asia/Kolkata` |
| D2 | `CFG_ACK_SLA_HOURS` | `4` |
| E2 | `CFG_RESOLVE_WORKING_DAYS` | `1` |
| F2 | `CFG_POLL_MINUTES` | `30` |
| G2 | `CFG_WEEKDAYS` | `Mon,Tue,Wed,Thu,Fri` |
| H2 | `CFG_DEFAULT_DUE_TIME` | `18:00` |
| I2 | `CFG_GO_LIVE` | `2026-10-27` |
| J2 | `CFG_DAILY_TOKEN` | `Posted` |
| K2 | `CFG_TICKET_REGEX` | `^[A-Za-z0-9][A-Za-z0-9_-]{2,30}$` |

Before Test 4, replace A2 and B2 with inboxes you can open. The log stamp is the pass/fail record. The inbox confirms the same event.

### 0.3 Task seed

Type these on `Task_Master` rows 2–5. Leave column F empty of typed numbers. The formula must show 1, 7, 15, 30. `Due_By_Time` is `18:00`. `Active` is `Yes`.

| Row | Task_ID | Task_Name | Assigned_To | Employee_Email | Frequency | Proof_Type | Cycle_Anchor | Work_Instruction |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | `T-001` | Daily Operations Update | Employee A | `employee.a@example.com` | Daily | Daily Confirmation | `2026-11-02` | Post today's operations update in the Ops WhatsApp group. Then choose Posted in Proof_Value on this row. |
| 3 | `T-002` | Portal Task A | Employee B | `employee.b@example.com` | Every 7 days | Ticket ID | `2026-11-02` | Complete Portal Task A in the portal and enter that Ticket ID in Proof_Value on this row. |
| 4 | `T-003` | Portal Task B | Employee C | `employee.c@example.com` | Every 15 days | Ticket ID | `2026-11-16` | Complete Portal Task B in the portal and enter that Ticket ID in Proof_Value on this row. |
| 5 | `T-004` | Portal Task C | Employee D | `employee.d@example.com` | Every 30 days | Ticket ID | `2026-12-01` | Complete Portal Task C in the portal and enter that Ticket ID in Proof_Value on this row. |

`Execution_Log` has headers and no data rows. `Employee_Portal!Z1` (`PORTAL_VIEW_AS`) is blank. Unhide columns Y–Z for the demo. `Y1` is the label `View_As_Email`.

### 0.4 Baseline on Monday 2026-11-02, before 18:00

**Action.** Menu → **Run Cycle Job**. Then menu → **Refresh Manager Queue**.

**After.** Exactly these four log rows. Status comes from the formula.

| Cycle_ID | Task_ID | Cycle_Start | Due_Date | Status | Proof_Value | Completed_By | Completed_At | Manager_Alert_Sent_At | Manager_Ack | Leadership_Escalation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `T-001-2026-11-02` | `T-001` | 2026-11-02 | 2026-11-02 | Due Today | blank | blank | blank | blank | blank | blank |
| `T-002-2026-11-02` | `T-002` | 2026-10-27 | 2026-11-02 | Due Today | blank | blank | blank | blank | blank | blank |
| `T-003-2026-11-16` | `T-003` | 2026-11-02 | 2026-11-16 | Pending | blank | blank | blank | blank | blank | blank |
| `T-004-2026-12-01` | `T-004` | 2026-11-02 | 2026-12-01 | Pending | blank | blank | blank | blank | blank | blank |

`T-002`’s window is 2026-10-27 through 2026-11-02 (seven calendar days). `T-003` opens on the anchor’s first day of work, 2026-11-02, and is due 2026-11-16. `T-004` opens 2026-11-02 and is due 2026-12-01. No row is due before `2026-10-27`.

Queue from row 6, overdue first, then due today, then pending, then due date, then employee name:

| Row | Cycle_ID | Assigned_To | Status | Escalation_State |
| --- | --- | --- | --- | --- |
| 6 | `T-001-2026-11-02` | Employee A | Due Today | Due today |
| 7 | `T-002-2026-11-02` | Employee B | Due Today | Due today |
| 8 | `T-003-2026-11-16` | Employee C | Pending | Pending |
| 9 | `T-004-2026-12-01` | Employee D | Pending | Pending |

Ack is unchecked on every queue row. No email has been sent.

**Portal check.** Set `Employee_Portal!Z1` to `employee.a@example.com`. Menu → **Refresh Portal**.

| Column | Value |
| --- | --- |
| A Cycle_ID | `T-001-2026-11-02` |
| B Task_Name | Daily Operations Update |
| C Due_Date | 2026-11-02 |
| D Cycle_Window | `2026-11-02 → 2026-11-02` |
| E Status | Due Today |
| F Proof_Required | Daily Confirmation |
| G Work_Instruction | the `T-001` instruction above |
| H Assigned_To | Employee A |
| I Proof_Value | blank, dropdown whose only choice is `Posted` |
| J Entry_Check | Missing |
| K Sync_Status | blank |

Employee B, C, and D do not appear while Z1 is Employee A’s address. Repeat the refresh with `employee.b@example.com` and the only row is `T-002-2026-11-02`, with `Proof_Required` = `Ticket ID` and column I accepting a ticket id. Column I is blank-allowed until a value is committed.

## Test 1 — Recurring cycle close and auto-successor

Assignment: complete a 7-day task and show the current cycle close and the next cycle appear on its own.

Use `T-002`. Do this on Monday 2026-11-02, after Test 4 has stamped the manager alert and after you have confirmed `T-002` has no Ack tick. Completing it on Monday is what creates the next row while that row’s start date is still tomorrow.

### Before

`T-002-2026-11-02` is `Due Today`. `Proof_Value`, `Completed_By`, and `Completed_At` are blank. `Manager_Alert_Sent_At` is the Monday 18:00 poll time from Test 4. `Manager_Ack` and `Leadership_Escalation` are blank. There is no `T-002-2026-11-09` row. The portal, with Z1 = `employee.b@example.com`, shows this one open cycle. Column I is empty. `Entry_Check` is `Missing`.

### Actions

1. Leave Z1 as `employee.b@example.com` and refresh the portal if that row is not on screen.
2. In column I type `no` and leave the cell. `Entry_Check` becomes `Invalid Ticket ID`. The log row stays open. `Sync_Status` stays blank because a short value is not submitted.
3. Replace column I with `TCK-2048`.
4. Wait until `Sync_Status` shows `Synced`.
5. Wait a few seconds, enter `TCK-2048` in that same cell again. `Sync_Status` becomes `Locked`. The log proof and `Completed_At` stay exactly as the first save left them. Still one successor row.
6. Menu → **Refresh Portal**.

`Completed_By` is the Google account that edited the cell. With Z1 set, the portal lists Employee B’s work, and the stamp still records the signed-in editor. If that account has no visible email, the stamp falls back to `employee.b@example.com`.

### After

Closed cycle:

| Field | Value |
| --- | --- |
| Cycle_ID | `T-002-2026-11-02` |
| Cycle_Start | 2026-10-27 |
| Due_Date | 2026-11-02 |
| Status | Completed |
| Proof_Value | `TCK-2048` |
| Completed_By | signed-in account, or `employee.b@example.com` |
| Completed_At | the time of the edit, `yyyy-MM-dd HH:mm:ss` |
| Manager_Alert_Sent_At | unchanged from Test 4 |
| Manager_Ack | blank |
| Leadership_Escalation | blank |

New cycle, one row:

| Field | Value |
| --- | --- |
| Cycle_ID | `T-002-2026-11-09` |
| Task_ID | `T-002` |
| Cycle_Start | 2026-11-03 |
| Due_Date | 2026-11-09 |
| Status | Scheduled |
| Proof, completion, alert, ack, escalation | blank |

`2026-11-03` is the day after `2026-11-02`. The new window is 2026-11-03 through 2026-11-09. Nobody typed that due date.

Portal after refresh: `T-002-2026-11-02` is gone, and `T-002-2026-11-09` is absent too, because Scheduled rows stay on the log. Employee B has no open row left on 2026-11-02.

Queue: `T-002-2026-11-02` remains, because a manager alert was sent and completion is inside seven days. `Escalation_State` is `Resolved after alert`. `T-002-2026-11-09` is not on the queue.

## Test 2 — Single-point completion

Assignment: the employee sees the pending task and records the ticket in one place.

Use `T-003`, on Monday 2026-11-02, before or after 18:00. This cycle is `Pending`, so it does not generate a same-day manager email.

### Before

| Place | State |
| --- | --- |
| Log `T-003-2026-11-16` | Start 2026-11-02, due 2026-11-16, status Pending, proof and completion blank |
| Log `T-003-2026-12-01` | row does not exist |
| Portal Z1 | about to be set to `employee.c@example.com` |
| Task_Master, Execution_Log proof columns | employee does not type in them |

### Actions

1. Set `Employee_Portal!Z1` to `employee.c@example.com`.
2. Menu → **Refresh Portal**.
3. Read the single row. Confirm task name Portal Task B, due date 2026-11-16, window `2026-11-02 → 2026-11-16`, status Pending, proof required Ticket ID, and the `T-003` work instruction.
4. Type `TCK-1042` in column I only. Do not edit `Task_Master` or `Execution_Log`.
5. Menu → **Refresh Portal**.

### After

The log, written by the script from that one cell:

| Field | Value |
| --- | --- |
| Cycle_ID | `T-003-2026-11-16` |
| Status | Completed |
| Proof_Value | `TCK-1042` |
| Completed_By | signed-in account, or `employee.c@example.com` |
| Completed_At | time of the edit |

Successor, created because the cycle completed, still in the future on Monday:

| Field | Value |
| --- | --- |
| Cycle_ID | `T-003-2026-12-01` |
| Cycle_Start | 2026-11-17 |
| Due_Date | 2026-12-01 |
| Status | Scheduled |

`T-004-2026-12-01` is a different task and is unchanged.

Portal after refresh: no row for Employee C. The completed cycle and the scheduled successor are both hidden. `Task_Master` row 4 is unchanged. The employee did not type the ticket anywhere except `Employee_Portal` column I.

Immediately after the edit, before the refresh, that portal row shows `Entry_Check` = `Valid` and `Sync_Status` = `Synced`.

## Test 3 — Daily task completion with `Posted`

Assignment: record a daily task that has no ticket. The employee posts the update in the Ops WhatsApp group, then selects `Posted`.

Use `T-001` on Monday 2026-11-02 after Test 4’s alert and after Test 5’s Ack tick. Do it before Tuesday, so the next daily row does not already exist.

### Before

| Place | State |
| --- | --- |
| Log `T-001-2026-11-02` | Due Today, proof blank, completion blank, manager-alert stamp from 18:00, `Manager_Ack` filled by Test 5, leadership blank |
| Log `T-001-2026-11-03` | row does not exist |
| Portal Z1 | `employee.a@example.com` |
| Column I | dropdown, single value `Posted` |
| Column G | the WhatsApp instruction from the seed |

### Actions

1. Post the operations update in the Ops WhatsApp group. The sheet does not store the message. The dropdown is the record that the post happened.
2. Refresh the portal for `employee.a@example.com`.
3. Choose `Posted` from the column I dropdown. Do not type a time, a name, or a second task title.
4. Refresh the portal.

### After

| Field | Value |
| --- | --- |
| Cycle_ID | `T-001-2026-11-02` |
| Status | Completed |
| Proof_Value | `Posted` |
| Completed_By | signed-in account, or `employee.a@example.com` |
| Completed_At | time of the edit |
| Manager_Alert_Sent_At | unchanged |
| Manager_Ack | unchanged from Test 5 |
| Leadership_Escalation | blank |

Next working day, created by the completion:

| Field | Value |
| --- | --- |
| Cycle_ID | `T-001-2026-11-03` |
| Cycle_Start | 2026-11-03 |
| Due_Date | 2026-11-03 |
| Status | Scheduled |

Monday’s portal no longer lists `T-001-2026-11-02` or `T-001-2026-11-03`. Queue row for `T-001-2026-11-02`: status Completed, proof `Posted`, Ack checked, `Escalation_State` = `Resolved after alert`.

A value other than `Posted` is rejected by the dropdown. The daily method is one choice, not a ticket.

## Test 4 — Same-day manager alert

Assignment: the employee has not finished by the required time, and the manager gets one email that names the employee and the task.

Run this on Monday 2026-11-02 at 18:00, while `T-001` and `T-002` are still open. Tests 1, 3, and 5 have not touched them yet. Test 2 may already have completed `T-003`.

### Before

| Cycle_ID | Status | Completed_At | Manager_Alert_Sent_At |
| --- | --- | --- | --- |
| `T-001-2026-11-02` | Due Today | blank | blank |
| `T-002-2026-11-02` | Due Today | blank | blank |
| `T-003-2026-11-16` | Completed, if Test 2 is done | set | blank |
| `T-004-2026-12-01` | Pending | blank | blank |

Inbox for the manager address: no Allo Ops message for these cycle ids. Queue state for the two due-today rows is `Due today`.

At 17:59 the same poll sends nothing. Optional check: menu → **Run Escalation Poll** one minute early, then confirm both alert cells are still blank.

### Actions

1. At 18:00, menu → **Run Escalation Poll**.
2. Open the manager inbox.
3. Read `Execution_Log` columns I for the two due-today rows. On this sheet, column I is `Manager_Alert_Sent_At`.

Shortcut if you cannot wait until 18:00: set `Due_By_Time` on `T-001` and `T-002` to a few minutes ahead, run the poll after that minute, and treat that minute as the cutoff in the tables below. Put the seed value `18:00` back only if you still need the Tuesday deadline math in Test 6 to use 18:00. A changed cutoff also moves the resolution deadline.

### After

Two emails, one per open due-today cycle. `T-003` and `T-004` produce none.

Subject lines:

```text
[Allo Ops] Pending: Employee A — Daily Operations Update (T-001-2026-11-02)
[Allo Ops] Pending: Employee B — Portal Task A (T-002-2026-11-02)
```

Both go to the address in A2. Employee A’s body contains:

```text
Employee: Employee A
Email: employee.a@example.com
Task: Daily Operations Update
Cycle: T-001-2026-11-02
Window: 2026-11-02 → 2026-11-02
Status: Due Today
Proof required: Daily Confirmation
Due cutoff: 18:00 Asia/Kolkata
```

Employee B’s body is the same shape with Employee B, `employee.b@example.com`, Portal Task A, `T-002-2026-11-02`, window `2026-10-27 → 2026-11-02`, and proof required Ticket ID.

| Cycle_ID | Manager_Alert_Sent_At | Status | Queue Escalation_State |
| --- | --- | --- | --- |
| `T-001-2026-11-02` | poll time, about `2026-11-02 18:00:00` | Due Today | Awaiting manager ack |
| `T-002-2026-11-02` | same poll time | Due Today | Awaiting manager ack |

Completion columns are still blank. Ack is still unchecked. `Leadership_Escalation` is blank: four working hours have not passed, and the resolution deadline is still Tuesday 18:00.

## Test 5 — Manager acknowledgement

Assignment: show what the manager does after the email, whether that review was recorded, and whether the task was completed afterwards.

Use `T-001` after Test 4, before Test 3.

### Before

`T-001-2026-11-02` is `Due Today`, alert stamp filled, `Manager_Ack` blank, `Completed_At` blank, Ack checkbox clear. Queue `Escalation_State` is `Awaiting manager ack`.

### Actions

1. On `Manager_Dashboard`, find `T-001-2026-11-02`.
2. Read the row. Do not type the ticket or `Posted` here.
3. Tick Ack in column J.
4. If the log cell stays blank, menu → **Refresh Manager Queue**. The refresh writes a tick that was not stamped yet.
5. Read queue column K.
6. Later, perform Test 3 (choose `Posted` on the portal). Read column K again.

### After the tick, before completion

| Field | Value |
| --- | --- |
| Manager_Ack | `yyyy-MM-dd HH:mm:ss \| editor@email` with spaces around the pipe |
| Completed_At | blank |
| Ack checkbox | TRUE |
| Escalation_State | `Acknowledged — still open` |

The editor address is the Google account that ticked the box, then the signed-in account, then A2 if neither address is visible.

### After Test 3 completes the same cycle

| Field | Value |
| --- | --- |
| Proof_Value | `Posted` |
| Completed_At | time of the portal edit |
| Manager_Ack | the same stamp as above |
| Escalation_State | `Resolved after alert` |

`T-002` is the contrast for Test 6. Leave its Ack checkbox clear for the whole of Monday.

Clearing the `T-001` checkbox after the stamp does not clear `Manager_Ack`. Refresh the queue and the checkbox is TRUE again. The stamp text is unchanged. That check is repeated under Test 8.

## Test 6 — Leadership escalation

Assignment: escalate when the manager review does not happen, or when the task is still open after the resolution window. One email per cycle. The reason is stored in the stamp.

Working hours are 09:00–18:00, Monday–Friday. Monday 18:00 is the close of that day, so the four-hour ack clock starts Tuesday at 09:00 and matures Tuesday at 13:00. The resolution deadline for a Monday 18:00 due date is Tuesday 18:00.

### 6A — `MGR_ACK_MISSED` on the main file

`T-002-2026-11-02` was alerted Monday at 18:00, never acknowledged, and completed in Test 1. Completion does not cancel a missed review.

#### Before (Tuesday 2026-11-03, 12:59)

| Field | Value |
| --- | --- |
| Manager_Alert_Sent_At | Monday’s poll time |
| Manager_Ack | blank |
| Leadership_Escalation | blank |
| Status | Completed |

Working time from Monday 18:00 to Tuesday 12:59 is 3 hours 59 minutes. That is under 4 hours.

#### Actions

1. At 12:59, menu → **Run Escalation Poll**. Confirm `Leadership_Escalation` is still blank and the leadership inbox has no message for this cycle.
2. At 13:00, run the poll again.

#### After 13:00

One email to every address in B2 (one message, both recipients):

```text
[Allo Ops] Escalation MGR_ACK_MISSED: Employee B — Portal Task A (T-002-2026-11-02)
```

The body includes:

| Line | Value |
| --- | --- |
| Rule | `MGR_ACK_MISSED` |
| Manager alert | Monday’s alert time |
| Manager ack | none |
| Proof | `TCK-2048` |
| Completed | Test 1’s completion time |

Log column K:

```text
2026-11-03 13:00:00 | MGR_ACK_MISSED
```

Use the actual poll time if it is a few seconds later. The reason code is fixed. Queue `Escalation_State` is `Escalated | MGR_ACK_MISSED`.

`T-001-2026-11-02` has an ack from Test 5, so this poll does not give it `MGR_ACK_MISSED`. It is already completed, so it does not get `UNRESOLVED_SLA` either.

`T-001-2026-11-03` already exists from Test 3. On Tuesday its status is Due Today. At 13:00 its cutoff is still 18:00, so this poll sends it no manager email. At 18:00 it gets its own manager email. That is a different cycle id, not a second email for Monday’s row.

### 6B — `UNRESOLVED_SLA` on a copy

Take this copy immediately after Test 4, before any Ack tick and before Tests 1 and 3.

1. On the copy, tick Ack for `T-001-2026-11-02` only.
2. Leave `Completed_At` blank through Tuesday.
3. Do not ack `T-002`.
4. Skip the Tuesday 13:00 poll, or run it and expect no leadership mail for `T-001` (the ack is present and the resolution deadline has not arrived). `T-002` will take `MGR_ACK_MISSED` at 13:00 on this copy as well.
5. At Tuesday 18:00, run the poll.

#### Before Tuesday 18:00, `T-001-2026-11-02`

| Field | Value |
| --- | --- |
| Status | Overdue |
| Completed_At | blank |
| Manager_Alert_Sent_At | Monday 18:00 |
| Manager_Ack | filled |
| Leadership_Escalation | blank |

#### After Tuesday 18:00

```text
[Allo Ops] Escalation UNRESOLVED_SLA: Employee A — Daily Operations Update (T-001-2026-11-02)
```

```text
2026-11-03 18:00:00 | UNRESOLVED_SLA
```

The body shows the ack stamp, proof `none`, and completed `still open`. Queue state is `Escalated | UNRESOLVED_SLA`.

### Both rules at once

On a cycle that is still open, still unacknowledged, and polled for the first time at Tuesday 18:00, both rules are true. The single email and the stamp use `MGR_ACK_MISSED`. A later poll does not send `UNRESOLVED_SLA` for that same cycle.

## Test 7 — SLA and working-hours rationale

Assignment: state when the manager is told, how long people have, when leadership is told, and how repeats are avoided.

These are the rules the tests above already exercised.

| Question | Rule | Why |
| --- | --- | --- |
| When does the manager hear? | At `Due_By_Time` on the due date, default 18:00. Status must be Due Today or Overdue, and the task must be active. | The employee has the whole working day. The manager hears on the due date, not the next morning. |
| What if the 18:00 poll is missed? | The next poll sends that same alert once. | An overdue row with a blank alert stamp is the catch-up. The stamp blocks a second send. |
| How long does the manager have to review? | 4 working hours after the alert, inside 09:00–18:00 on Mon–Fri. | An 18:00 alert has no working time left that evening. Leadership hears the next morning, at 13:00, if Ack is still empty. |
| How long can the task stay open after the due date? | 1 working day, until `Due_By_Time` that day. | Monday 18:00 is due by Tuesday 18:00. Friday 18:00 is due by Monday 18:00. The employee’s finish window and the manager’s review window are separate. |
| What if both are late together? | One email, reason `MGR_ACK_MISSED`. | A missed review is the first fact. The stamp stops a second email when the resolution deadline arrives later. |
| What stops repeat mail? | `Manager_Alert_Sent_At`, `Manager_Ack`, and `Leadership_Escalation` are write-once. Mail is sent first. A failed send leaves the cell blank so the next poll can retry. | Reruns are safe. Test 8 checks this. |

Worked clocks:

| From | To | Working time | Result |
| --- | --- | --- | --- |
| Friday 2026-11-06 18:00 | Monday 2026-11-09 13:00 | 4 hours (Monday 09:00–13:00) | Ack SLA matures |
| Wednesday 2026-11-04 15:00 | Thursday 2026-11-05 10:00 | 4 hours (3 hours Wednesday, 1 hour Thursday) | Ack SLA matures |
| Wednesday 2026-11-04 15:00 | Thursday 2026-11-05 09:30 | 3.5 hours | Ack SLA has not matured |
| Monday 2026-11-02 18:00 due | Tuesday 2026-11-03 18:00 | 1 working day | `UNRESOLVED_SLA` if still open |
| Friday 2026-11-06 18:00 due | Monday 2026-11-09 18:00 | 1 working day | `UNRESOLVED_SLA` if still open |
| Saturday 10:00 through Sunday 17:00 | | 0 hours | Weekend time does not move the ack clock |

### Weekend check (Saturday 2026-10-31)

Run the cycle job and the escalation poll on the seed file before Monday.

| Expected | Why |
| --- | --- |
| One log row, `T-002-2026-11-02`, status Pending | Its start, 2026-10-27, is already here. Due date is still Monday. |
| No `T-001` row | Daily cycles exist only on Mon–Fri, and the anchor is Monday. |
| No `T-003` or `T-004` row | Their start date is Monday 2026-11-02. |
| No manager email and no leadership email | Nothing is Due Today or Overdue, and no working-hour clock is running. |

A 15-day or 30-day task whose own due date falls on a Saturday still gets the same-day manager email at its cutoff. The weekend rule above is about this seed, where no due date lands on Saturday and the ack clock is stopped.

## Test 8 — Idempotency and anti-duplicate

Assignment: run the automation more than once. There must be one cycle row, one completion, and one email per event.

Do these after Tests 1–6A. Each “after” is the sheet you already have, plus the proof that the second run added nothing.

| # | Action | Before | After the second run |
| --- | --- | --- | --- |
| 8.1 | Menu → **Run Cycle Job** again on Monday, after the baseline | 4 cycle ids | Same 4 ids, one row each. A second click inside 30 seconds is ignored by the menu. After that, the job still inserts nothing. |
| 8.2 | The second `TCK-2048` entry in Test 1, before the portal refresh | `T-002-2026-11-02` completed once. One `T-002-2026-11-09`. | `Sync_Status` is `Locked`. Proof, `Completed_By`, and `Completed_At` stay as the first save wrote them. Still one successor row. |
| 8.3 | Menu → **Refresh Portal** for `employee.b@example.com` | Log already holds the cycle ids | Portal column A is rewritten from the log. No new cycle id appears in the log. |
| 8.4 | Menu → **Run Escalation Poll** again after Test 4 | One manager email each for `T-001-2026-11-02` and `T-002-2026-11-02`. Alert stamps filled. | Inbox count for those two subjects stays the same. Both alert stamps keep the original time. |
| 8.5 | Tick Ack again on `T-001-2026-11-02` | `Manager_Ack` already set | Stamp text is unchanged. Checkbox stays TRUE. |
| 8.6 | Clear that Ack checkbox, then menu → **Refresh Manager Queue** | Stamp present, checkbox FALSE | Checkbox returns to TRUE. Stamp text is unchanged. A second refresh writes the stamp once, not twice. |
| 8.7 | Menu → **Run Escalation Poll** again after Test 6A | `Leadership_Escalation` = `… \| MGR_ACK_MISSED` | That cell is unchanged. No second leadership email for `T-002-2026-11-02`. |
| 8.8 | Count `T-002-2026-11-02` and `T-002-2026-11-09` in column A | One of each | One of each. Conditional formatting would turn a duplicate id red. |

Mail is sent and then the stamp is written. If a send fails, the stamp cell stays blank and the next poll is allowed to try again. A successful stamp is what makes the following poll quiet.

## Scorecard

| Test | Pass when |
| --- | --- |
| 1 | `T-002-2026-11-02` is Completed with `TCK-2048`, and `T-002-2026-11-09` exists as Scheduled (start 2026-11-03, due 2026-11-09). |
| 2 | `TCK-1042` was typed only in `Employee_Portal` column I. The log received it. `T-003-2026-12-01` is Scheduled. The portal hides both after refresh. |
| 3 | `T-001-2026-11-02` proof is `Posted`, with a person and a time. `T-001-2026-11-03` is Scheduled. |
| 4 | At the Monday cutoff, one manager email each for Employee A and Employee B, subjects as written above, and two alert stamps. Pending and already completed rows are silent. |
| 5 | After the tick, `T-001` shows `Acknowledged — still open`. After `Posted`, it shows `Resolved after alert`. The ack text does not change. |
| 6 | Tuesday 13:00 writes `MGR_ACK_MISSED` for unacked `T-002`. On the copy, Tuesday 18:00 writes `UNRESOLVED_SLA` for acked, still-open `T-001`. |
| 7 | The clocks in the table match the product: same-day manager mail, 4 working hours to ack, 1 working day to finish, one email per event. |
| 8 | A second cycle job, completion, portal refresh, poll, and ack leave row counts and stamps as they were. |
