jest.unmock('../../../backend/src/services/emailNotifications.js');

const {
  notifyTaskAssigned,
  notifyTaskStatusChange,
} = require('../../../backend/src/services/emailNotifications.js');
const { sendMail } = require('../../../backend/src/services/email');
const { createSupabaseMock } = require('../mocks/supabaseClient');

describe('services/emailNotifications', () => {
  let supabase;

  beforeEach(() => {
    supabase = createSupabaseMock();
    sendMail.mockReset();
    supabase.tables.user_notification_prefs = supabase.tables.user_notification_prefs || [];
    supabase.tables.notifications = supabase.tables.notifications || [];
  });

  it('sends email and in-app notification for assigned user with opt-in', async () => {
    supabase.tables.users.push({
      user_id: 7,
      email: 'assignee@example.com',
      full_name: 'Assignee',
    });
    supabase.tables.user_notification_prefs.push({
      user_id: 7,
      email: true,
      in_app: true,
    });

    await notifyTaskAssigned(
      supabase,
      { task_id: 55, title: 'Board Report', due_date: '2025-12-01' },
      7
    );

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'assignee@example.com',
        subject: expect.stringContaining('Board Report'),
      })
    );
    expect(supabase.tables.notifications).toHaveLength(1);
    expect(supabase.tables.notifications[0]).toMatchObject({
      user_id: 7,
      task_id: 55,
      read: false,
    });
  });

  it('notifies all recipients on status change except acting user', async () => {
    supabase.tables.users.push(
      { user_id: 1, email: 'owner@example.com', full_name: 'Owner' },
      { user_id: 2, email: 'assignee@example.com', full_name: 'Assignee' },
      { user_id: 3, email: 'member@example.com', full_name: 'Member' }
    );
    supabase.tables.user_notification_prefs.push(
      { user_id: 1, email: true, in_app: true },
      { user_id: 2, email: true, in_app: true },
      { user_id: 3, email: true, in_app: true }
    );

    await notifyTaskStatusChange(
      supabase,
      {
        task_id: 88,
        title: 'Launch Campaign',
        owner_id: 1,
        assignee_id: 2,
        members_id: [3],
        due_date: '2025-11-15',
      },
      'ONGOING',
      'COMPLETED',
      2
    );

    expect(sendMail).toHaveBeenCalledTimes(2);
    const recipients = sendMail.mock.calls.map((call) => call[0].to).sort();
    expect(recipients).toEqual(['member@example.com', 'owner@example.com']);
    expect(supabase.tables.notifications).toHaveLength(2);
    const notifiedUsers = supabase.tables.notifications.map((n) => n.user_id).sort();
    expect(notifiedUsers).toEqual([1, 3]);
  });

  it('notifies user on unassignment when email opt-in enabled', async () => {
    const { notifyTaskUnassigned } = require('../../../backend/src/services/emailNotifications.js');
    supabase.tables.users.push({
      user_id: 9,
      email: 'old@example.com',
      full_name: 'Old Assignee',
    });
    supabase.tables.user_notification_prefs.push({
      user_id: 9,
      email: true,
      in_app: true,
    });

    await notifyTaskUnassigned(
      supabase,
      { task_id: 501, title: 'Inventory Audit', due_date: '2025-12-10' },
      9
    );

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'old@example.com',
        subject: expect.stringContaining('Inventory Audit'),
      })
    );
    expect(supabase.tables.notifications).toEqual([
      expect.objectContaining({ user_id: 9, task_id: 501 }),
    ]);
  });

  it('emails mentioned users and posts in-app alerts', async () => {
    const { notifyCommentMentioned } = require('../../../backend/src/services/emailNotifications.js');
    supabase.tables.users.push(
      { user_id: 11, email: 'mention1@example.com', full_name: 'Mention One' },
      { user_id: 12, email: 'mention2@example.com', full_name: 'Mention Two' }
    );
    supabase.tables.user_notification_prefs.push(
      { user_id: 11, email: true, in_app: true },
      { user_id: 12, email: true, in_app: true }
    );

    await notifyCommentMentioned(
      supabase,
      { task_id: 700, title: 'Draft Proposal', comment_preview: 'Please review section 2.' },
      [11, 12],
      { full_name: 'Commenter' }
    );

    expect(sendMail).toHaveBeenCalledTimes(2);
    const recipients = sendMail.mock.calls.map((call) => call[0].to).sort();
    expect(recipients).toEqual(['mention1@example.com', 'mention2@example.com']);
    expect(supabase.tables.notifications).toHaveLength(2);
    expect(new Set(supabase.tables.notifications.map((n) => n.user_id))).toEqual(
      new Set([11, 12])
    );
  });

  it('notifies new members added to task', async () => {
    const { notifyMembersAdded } = require('../../../backend/src/services/emailNotifications.js');
    supabase.tables.users.push(
      { user_id: 20, email: 'memberA@example.com', full_name: 'Member A' },
      { user_id: 21, email: 'memberB@example.com', full_name: 'Member B' }
    );
    supabase.tables.user_notification_prefs.push(
      { user_id: 20, email: true, in_app: true },
      { user_id: 21, email: true, in_app: false } // email only
    );

    await notifyMembersAdded(
      supabase,
      { task_id: 900, title: 'QA Checklist', due_date: '2025-12-20' },
      [20, 21],
      { full_name: 'Project Lead' }
    );

    expect(sendMail).toHaveBeenCalledTimes(2);
    const recipients = sendMail.mock.calls.map((call) => call[0].to).sort();
    expect(recipients).toEqual(['memberA@example.com', 'memberB@example.com']);
    expect(supabase.tables.notifications).toEqual([
      expect.objectContaining({ user_id: 20, task_id: 900 }),
    ]);
  });

  it('skips assignment notification when user lacks opt-in', async () => {
    const { notifyTaskAssigned } = require('../../../backend/src/services/emailNotifications.js');
    supabase.tables.users.push({
      user_id: 30,
      email: 'no-opt@example.com',
      full_name: 'No Opt',
    });
    supabase.tables.user_notification_prefs.push({
      user_id: 30,
      email: false,
      in_app: false,
    });

    await notifyTaskAssigned(
      supabase,
      { task_id: 601, title: 'Silent Task', due_date: '2025-12-01' },
      30
    );

    expect(sendMail).not.toHaveBeenCalled();
    expect(supabase.tables.notifications || []).toHaveLength(0);
  });

  it('skips status change notification when all recipients filtered out', async () => {
    supabase.tables.users.push({ user_id: 50, email: 'owner@example.com', full_name: 'Owner' });
    supabase.tables.user_notification_prefs.push({
      user_id: 50,
      email: false,
      in_app: false,
    });

    await notifyTaskStatusChange(
      supabase,
      {
        task_id: 999,
        title: 'Private Task',
        owner_id: 50,
        assignee_id: null,
        members_id: [],
        due_date: '2025-12-05',
      },
      'ONGOING',
      'COMPLETED',
      50
    );

    expect(sendMail).not.toHaveBeenCalled();
    expect((supabase.tables.notifications || []).length).toBe(0);
  });

  it('handles errors when fetching users during assignment', async () => {
    const { notifyTaskAssigned } = require('../../../backend/src/services/emailNotifications.js');
    supabase.tables.user_notification_prefs.push({
      user_id: 70,
      email: true,
      in_app: true,
    });

    supabase.__setNextResult({
      table: 'users',
      operation: 'select',
      error: { message: 'users fetch failed' },
    });

    await notifyTaskAssigned(
      supabase,
      { task_id: 702, title: 'Error Task', due_date: '2025-11-20' },
      70
    );

    expect(sendMail).not.toHaveBeenCalled();
    expect(supabase.tables.notifications).toHaveLength(0);
  });

  it('handles errors when fetching preferences during status change', async () => {
    supabase.tables.users.push({ user_id: 80, email: 'pref@example.com', full_name: 'Pref User' });

    supabase.__setNextResult({
      table: 'user_notification_prefs',
      operation: 'select',
      error: { message: 'pref fetch failed' },
    });

    await notifyTaskStatusChange(
      supabase,
      {
        task_id: 800,
        title: 'Prefs Task',
        owner_id: 80,
        assignee_id: null,
        members_id: [],
        due_date: '2025-11-30',
      },
      'ONGOING',
      'COMPLETED',
      null
    );

    expect(sendMail).not.toHaveBeenCalled();
    expect((supabase.tables.notifications || []).length).toBe(0);
  });
});
