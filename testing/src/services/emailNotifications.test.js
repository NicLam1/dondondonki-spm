'use strict';

jest.unmock('../../../backend/src/services/emailNotifications');

jest.mock('../../../backend/src/services/email', () => ({
  sendMail: jest.fn().mockResolvedValue(undefined),
}));

const { sendMail } = require('../../../backend/src/services/email');
const {
  notifyTaskAssigned,
  notifyTaskUnassigned,
  notifyTaskStatusChange,
  notifyCommentMentioned,
  notifyMembersAdded,
} = require('../../../backend/src/services/emailNotifications');

function queueResponse(mock, table, rows) {
  mock.__responses[table].push({ data: rows });
}

function createSupabaseMock() {
  const responses = {
    users: [],
    user_notification_prefs: [],
  };
  const notificationsInsert = jest.fn().mockResolvedValue({ data: null, error: null });

  function nextResponse(table, fallback = { data: [] }) {
    const queue = responses[table] || [];
    if (!queue.length) return fallback;
    return queue.shift();
  }

  const supabase = {
    __responses: responses,
    __notificationsInsert: notificationsInsert,
    from: jest.fn((table) => {
      if (table === 'notifications') {
        return {
          insert: notificationsInsert,
        };
      }
      const builder = Promise.resolve(nextResponse(table));
      builder.select = jest.fn(() => builder);
      builder.in = jest.fn(() => builder);
      builder.eq = jest.fn(() => builder);
      return builder;
    }),
  };

  return supabase;
}

describe('services/emailNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('notifyTaskAssigned sends email and in-app notification when user opts in', async () => {
    const supabase = createSupabaseMock();
    supabase.__responses.users.push(
      { data: [{ user_id: 7, email: 'assignee@example.com', full_name: 'Ann Assignee' }] }, // getUsersByIds
      { data: [{ user_id: 7 }] }, // sendInApp existing users lookup
    );
    supabase.__responses.user_notification_prefs.push(
      { data: [{ user_id: 7 }] }, // email opt-in
      { data: [{ user_id: 7 }] }, // in-app opt-in
    );

    const task = { task_id: 55, title: 'Budget Review', due_date: '2025-11-10' };
    await notifyTaskAssigned(supabase, task, 7);

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'assignee@example.com',
      subject: expect.stringContaining('[Task Assigned]'),
    }));
    expect(supabase.__notificationsInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        user_id: 7,
        task_id: 55,
        message: expect.stringContaining('Budget Review'),
        read: false,
      }),
    ]);
  });

  test('notifyTaskAssigned exits when user lacks email opt-in', async () => {
    const supabase = createSupabaseMock();
    supabase.__responses.users.push({ data: [{ user_id: 8, email: 'nope@example.com', full_name: 'No Opt' }] });
    supabase.__responses.user_notification_prefs.push({ data: [] }); // not opted in

    const task = { task_id: 77, title: 'Compliance' };
    await notifyTaskAssigned(supabase, task, 8);

    expect(sendMail).not.toHaveBeenCalled();
    expect(supabase.__notificationsInsert).not.toHaveBeenCalled();
  });

  test('notifyTaskUnassigned alerts the previous assignee via email and in-app when opted in', async () => {
    const supabase = createSupabaseMock();
    queueResponse(supabase, 'users', [{ user_id: 5, email: 'old@example.com', full_name: 'Old Assignee' }]);
    queueResponse(supabase, 'user_notification_prefs', [{ user_id: 5 }]); // email opt-in
    queueResponse(supabase, 'user_notification_prefs', [{ user_id: 5 }]); // in-app opt-in
    queueResponse(supabase, 'users', [{ user_id: 5 }]); // existing user check for in-app

    const task = { task_id: 300, title: 'Budget Review' };
    await notifyTaskUnassigned(supabase, task, 5);

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'old@example.com',
      subject: expect.stringContaining('[Task Unassigned]'),
    }));
    expect(supabase.__notificationsInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        user_id: 5,
        task_id: 300,
        message: expect.stringContaining('unassigned'),
      }),
    ]);
  });

  test('notifyTaskStatusChange emails and notifies all recipients except the actor', async () => {
    const supabase = createSupabaseMock();
    queueResponse(supabase, 'users', [
      { user_id: 11, email: 'owner@example.com', full_name: 'Owner One' },
      { user_id: 13, email: 'member@example.com', full_name: 'Member Three' },
    ]);
    queueResponse(supabase, 'user_notification_prefs', [
      { user_id: 11 },
      { user_id: 13 },
    ]);
    queueResponse(supabase, 'user_notification_prefs', [
      { user_id: 11 },
      { user_id: 13 },
    ]);
    queueResponse(supabase, 'users', [
      { user_id: 11 },
      { user_id: 13 },
    ]);

    const task = {
      task_id: 910,
      title: 'Data Migration',
      owner_id: 11,
      assignee_id: 12,
      members_id: [13],
      due_date: '2025-11-30',
    };
    await notifyTaskStatusChange(supabase, task, 'TO_DO', 'ONGOING', 12);

    expect(sendMail).toHaveBeenCalledTimes(2);
    const recipients = sendMail.mock.calls.map(([,], idx) => sendMail.mock.calls[idx][0].to).sort();
    expect(recipients).toEqual(['member@example.com', 'owner@example.com']);
    expect(supabase.__notificationsInsert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ user_id: 11 }),
      expect.objectContaining({ user_id: 13 }),
    ]));
  });

  test('notifyCommentMentioned emails and sends in-app notifications for mentioned users', async () => {
    const supabase = createSupabaseMock();
    queueResponse(supabase, 'users', [
      { user_id: 21, email: 'ann@example.com', full_name: 'Ann Mentioned' },
      { user_id: 22, email: 'bob@example.com', full_name: 'Bob Mentioned' },
    ]);
    queueResponse(supabase, 'user_notification_prefs', [
      { user_id: 21 },
      { user_id: 22 },
    ]);
    queueResponse(supabase, 'user_notification_prefs', [
      { user_id: 21 },
      { user_id: 22 },
    ]);
    queueResponse(supabase, 'users', [
      { user_id: 21 },
      { user_id: 22 },
    ]);

    const task = { task_id: 9100, title: 'Draft Spec', comment_preview: 'Please review the DB section.' };
    await notifyCommentMentioned(supabase, task, [21, 22], { full_name: 'Lead Alice' });

    expect(sendMail).toHaveBeenCalledTimes(2);
    const notificationMessages = supabase.__notificationsInsert.mock.calls.flatMap((call) => call[0]);
    expect(notificationMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({ user_id: 21, message: expect.stringContaining('Lead Alice') }),
      expect.objectContaining({ user_id: 22, message: expect.stringContaining('Lead Alice') }),
    ]));
  });

  test('notifyMembersAdded emails new members and records in-app notifications', async () => {
    const supabase = createSupabaseMock();
    queueResponse(supabase, 'users', [
      { user_id: 31, email: 'new1@example.com', full_name: 'New One' },
      { user_id: 32, email: 'new2@example.com', full_name: 'New Two' },
    ]);
    queueResponse(supabase, 'user_notification_prefs', [
      { user_id: 31 },
      { user_id: 32 },
    ]);
    queueResponse(supabase, 'user_notification_prefs', [
      { user_id: 31 },
      { user_id: 32 },
    ]);
    queueResponse(supabase, 'users', [
      { user_id: 31 },
      { user_id: 32 },
    ]);

    const task = { task_id: 9200, title: 'Customer Rollout', due_date: '2025-12-01' };
    await notifyMembersAdded(supabase, task, [31, 32], { full_name: 'Manager Mike' });

    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(supabase.__notificationsInsert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ user_id: 31, task_id: 9200 }),
      expect.objectContaining({ user_id: 32, task_id: 9200 }),
    ]));
  });
});
