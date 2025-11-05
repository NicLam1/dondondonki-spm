jest.unmock('../../../backend/src/services/reminderService');

const { createSupabaseMock } = require('../mocks/supabaseClient');
let sendMailMock;
let mockSupabase;

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase),
}));

describe('services/reminderService', () => {
  let reminderService;

  beforeEach(() => {
    jest.resetModules();
    mockSupabase = createSupabaseMock();
    mockSupabase.tables.user_notification_prefs = [];
    mockSupabase.tables.reminder_log = [];
    mockSupabase.tables.notifications = [];
    mockSupabase.tables.users = [];

    jest.isolateModules(() => {
      reminderService = require('../../../backend/src/services/reminderService');
      sendMailMock = require('../../../backend/src/services/email').sendMail;
    });
    sendMailMock.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends reminder notifications to opted-in recipients', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2025, 10, 1, 9, 30, 0));

    mockSupabase.tables.users.push({
      user_id: 6,
      email: 'assignee@example.com',
      full_name: 'Assignee Person',
    });
    mockSupabase.tables.user_notification_prefs.push({
      user_id: 6,
      email: true,
      in_app: true,
    });

    mockSupabase.__setNextResult({
      table: 'task_reminders',
      operation: 'select',
      data: [
        {
          reminder_id: 1,
          task_id: 10,
          days_before: 2,
          frequency_per_day: 1,
          enabled: true,
          task: {
            task_id: 10,
            title: 'Board Report',
            due_date: '2025-11-02T00:00:00Z',
            status: 'ONGOING',
            owner_id: 5,
            assignee_id: 6,
            members_id: [],
          },
        },
      ],
    });

    mockSupabase.__setNextResult({
      table: 'tasks',
      operation: 'select',
      data: [],
    });

    const result = await reminderService.checkAndSendReminders();

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'assignee@example.com',
        subject: expect.stringContaining('Board Report'),
      })
    );
    expect(mockSupabase.tables.notifications).toEqual([
      expect.objectContaining({
        user_id: 6,
        task_id: 10,
        read: false,
      }),
    ]);
    expect(mockSupabase.tables.reminder_log).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ user_id: 6, task_id: 10 }),
      ])
    );
    expect(result.reminders).toEqual(
      expect.arrayContaining([
      expect.objectContaining({ user_id: 6, task_id: 10 }),
      ])
    );
  });

  it('skips reminders when already logged for the day', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2025, 10, 1, 9, 30, 0));

    mockSupabase.tables.users.push({
      user_id: 15,
      email: 'repeat@example.com',
      full_name: 'Repeat User',
    });
    mockSupabase.tables.user_notification_prefs.push({
      user_id: 15,
      email: true,
      in_app: true,
    });

    mockSupabase.__setNextResult({
      table: 'task_reminders',
      operation: 'select',
      data: [
        {
          reminder_id: 2,
          task_id: 300,
          days_before: 1,
          frequency_per_day: 1,
          enabled: true,
          task: {
            task_id: 300,
            title: 'Weekly Report',
            due_date: '2025-11-02T00:00:00Z',
            status: 'ONGOING',
            owner_id: 15,
            assignee_id: null,
            members_id: [],
          },
        },
      ],
    });

    mockSupabase.__setNextResult({
      table: 'reminder_log',
      operation: 'select',
      data: { log_id: 99 },
    });

    mockSupabase.__setNextResult({
      table: 'tasks',
      operation: 'select',
      data: [],
    });

    const result = await reminderService.checkAndSendReminders();

    expect(sendMailMock).not.toHaveBeenCalled();
    expect(mockSupabase.tables.notifications).toHaveLength(0);
    expect(result.reminders).toEqual([]);
  });

  it('sends overdue notifications to eligible users', async () => {
    const { checkAndSendOverdueNotifications } = reminderService;
    jest.useFakeTimers().setSystemTime(new Date(2025, 10, 5, 9, 30, 0));

    mockSupabase.tables.users.push(
      { user_id: 1, email: 'owner@example.com', full_name: 'Owner' },
      { user_id: 2, email: 'assignee@example.com', full_name: 'Assignee' }
    );
    mockSupabase.tables.user_notification_prefs.push(
      { user_id: 1, email: true, in_app: true },
      { user_id: 2, email: true, in_app: true }
    );

    mockSupabase.__setNextResult({
      table: 'tasks',
      operation: 'select',
      data: [
        {
          task_id: 200,
          title: 'Compliance Audit',
          due_date: '2025-11-02',
          status: 'ONGOING',
          owner_id: 1,
          assignee_id: 2,
          members_id: [],
          is_deleted: false,
        },
      ],
    });

    const results = await checkAndSendOverdueNotifications();

    expect(sendMailMock).toHaveBeenCalledTimes(2);
    const recipients = sendMailMock.mock.calls.map((call) => call[0].to).sort();
    expect(recipients).toEqual(['assignee@example.com', 'owner@example.com']);
    expect(mockSupabase.tables.notifications.length).toBeGreaterThanOrEqual(2);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ task_id: 200, user_id: 1 }),
        expect.objectContaining({ task_id: 200, user_id: 2 }),
      ])
    );
  });

  it('returns empty array when reminder fetch fails', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2025, 10, 1, 9, 30, 0));

    mockSupabase.__setNextResult({
      table: 'task_reminders',
      operation: 'select',
      error: { message: 'fetch failed' },
    });

    const result = await reminderService.checkAndSendReminders();

    expect(sendMailMock).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('returns empty array when overdue task query fails', async () => {
    const { checkAndSendOverdueNotifications } = reminderService;
    mockSupabase.__setNextResult({
      table: 'tasks',
      operation: 'select',
      error: { message: 'task fetch failed' },
    });

    const result = await checkAndSendOverdueNotifications();

    expect(sendMailMock).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});
