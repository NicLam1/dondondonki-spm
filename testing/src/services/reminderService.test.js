'use strict';

jest.unmock('../../../backend/src/services/reminderService');

const {
  createReminderMessage,
  escapeHtml,
  logReminder,
  shouldSendReminderNow,
  checkAndSendReminders,
  checkAndSendOverdueNotifications,
} = require('../../../backend/src/services/reminderService');
const { sendMail } = require('../../../backend/src/services/email');

describe('services/reminderService helpers', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('createReminderMessage adapts copy based on days remaining', () => {
    const sampleTask = { title: 'Quarterly Review' };
    expect(createReminderMessage(sampleTask, 0)).toMatch(/TODAY/);
    expect(createReminderMessage(sampleTask, 1)).toMatch(/TOMORROW/);
    expect(createReminderMessage(sampleTask, 5)).toContain('in 5 days');
  });

  test('escapeHtml encodes reserved characters', () => {
    const raw = `<div>Quote " & ' </div>`;
    expect(escapeHtml(raw)).toBe('&lt;div&gt;Quote &quot; &amp; &#39; &lt;/div&gt;');
  });

  test('shouldSendReminderNow only returns true between 9am-10am local time', () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-11-07T09:15:00'));
    expect(shouldSendReminderNow()).toBe(true);

    jest.setSystemTime(new Date('2025-11-07T08:59:00'));
    expect(shouldSendReminderNow()).toBe(false);

    jest.setSystemTime(new Date('2025-11-07T10:00:00'));
    expect(shouldSendReminderNow()).toBe(false);
  });

  test('logReminder inserts a reminder log row', async () => {
    global.supabaseMock.tables.reminder_log = [];

    await logReminder(501, 20, '2025-11-20', 1, 3);

    expect(global.supabaseMock.tables.reminder_log).toHaveLength(1);
    expect(global.supabaseMock.tables.reminder_log[0]).toMatchObject({
      task_id: 501,
      user_id: 20,
      due_date: '2025-11-20',
      reminder_number: 1,
      days_before: 3,
    });
  });
});

describe('services/reminderService overdue checks', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('checkAndSendOverdueNotifications notifies eligible recipients once', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-11-10T12:00:00Z'));

    const supabase = global.supabaseMock;
    supabase.tables.tasks.push({
      task_id: 9001,
      title: 'Overdue Migration',
      due_date: '2025-11-08',
      status: 'ONGOING',
      owner_id: 41,
      assignee_id: 42,
      members_id: [43],
      is_deleted: false,
    });
    supabase.tables.user_notification_prefs = supabase.tables.user_notification_prefs || [];
    supabase.tables.user_notification_prefs.push(
      { user_id: 41, in_app: true, email: false },
      { user_id: 42, in_app: false, email: true },
      { user_id: 43, in_app: true, email: true },
    );
    supabase.tables.users.push(
      { user_id: 41, email: 'owner@example.com', full_name: 'Owner One' },
      { user_id: 42, email: 'assignee@example.com', full_name: 'Assignee Two' },
      { user_id: 43, email: 'member@example.com', full_name: 'Member Three' },
    );

    const results = await checkAndSendOverdueNotifications();

    expect(results).toHaveLength(3);
    const notifiedUserIds = results.map((r) => r.user_id).sort();
    expect(notifiedUserIds).toEqual([41, 42, 43]);

    // In-app notifications should be written for users that opted in
    const notifications = supabase.tables.notifications || [];
    const inAppRecipients = notifications.map((n) => n.user_id).sort();
    expect(inAppRecipients).toEqual([41, 43]);
  });
});

describe('checkAndSendReminders', () => {
  const reminderRow = {
    reminder_id: 1,
    days_before: 2,
    enabled: true,
    task: {
      task_id: 8001,
      title: 'Prep Deck',
      due_date: '2025-11-09',
      status: 'ONGOING',
      owner_id: 51,
      assignee_id: 52,
      members_id: [53],
    },
  };

  beforeEach(() => {
    jest.useFakeTimers();
    sendMail.mockClear();
    global.supabaseMock.__clearHooks?.();
    global.supabaseMock.tables.reminder_log = [];
    global.supabaseMock.tables.notifications = [];
    global.supabaseMock.tables.user_notification_prefs = [];
    global.supabaseMock.tables.users = [];
    global.supabaseMock.tables.tasks = [];
  });

  function queueReminderData(rows = [reminderRow]) {
    global.supabaseMock.__setNextResult({
      table: 'task_reminders',
      operation: 'select',
      data: rows,
    });
  }

  function seedRecipients() {
    global.supabaseMock.tables.user_notification_prefs.push(
      { user_id: 51, in_app: true, email: true },
      { user_id: 52, in_app: false, email: true },
      { user_id: 53, in_app: true, email: true },
    );
    global.supabaseMock.tables.users.push(
      { user_id: 51, email: 'owner@example.com' },
      { user_id: 52, email: 'assignee@example.com' },
      { user_id: 53, email: 'member@example.com' },
    );
  }

  test('sends reminders for tasks within the time window', async () => {
    jest.setSystemTime(new Date('2025-11-07T09:10:00'));
    queueReminderData();
    seedRecipients();

    const { reminders } = await checkAndSendReminders();

    expect(reminders).toHaveLength(3);
    expect(global.supabaseMock.tables.reminder_log).toHaveLength(3);
    expect(global.supabaseMock.tables.notifications.map((n) => n.user_id).sort()).toEqual([51, 53]);
    expect(sendMail).toHaveBeenCalledTimes(3);
  });

  test('skips reminders outside the allowed time window', async () => {
    jest.setSystemTime(new Date('2025-11-07T08:30:00'));
    queueReminderData();
    seedRecipients();

    const { reminders } = await checkAndSendReminders();

    expect(reminders).toHaveLength(0);
    expect(sendMail).not.toHaveBeenCalled();
    expect(global.supabaseMock.tables.reminder_log).toHaveLength(0);
  });
});
