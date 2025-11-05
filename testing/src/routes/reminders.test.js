jest.mock('../../../backend/src/services/reminderService', () => ({
  checkAndSendReminders: jest.fn().mockResolvedValue([]),
  checkAndSendOverdueNotifications: jest.fn().mockResolvedValue([]),
}));

const request = require('supertest');
const { createTestApp } = require('../utils/createTestApp');
const {
  checkAndSendReminders,
  checkAndSendOverdueNotifications,
} = require('../../../backend/src/services/reminderService');

describe('Task reminders & notifications', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    checkAndSendReminders.mockReset().mockResolvedValue([]);
    checkAndSendOverdueNotifications.mockReset().mockResolvedValue([]);
  });

  describe('GET /api/tasks/:id/reminders', () => {
    it('returns default reminder settings when none exist', async () => {
      global.supabaseMock.tables.users.push({ user_id: 10, access_level: 1 });
      global.supabaseMock.tables.tasks.push({
        task_id: 200,
        owner_id: 10,
        members_id: [],
        is_deleted: false,
      });

      const response = await request(app)
        .get('/api/tasks/200/reminders')
        .query({ acting_user_id: '10' });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({
        task_id: 200,
        enabled: false,
        days_before: 3,
        frequency_per_day: 1,
      });
    });

    it('returns stored reminder settings', async () => {
      global.supabaseMock.tables.users.push({ user_id: 20, access_level: 2 });
      global.supabaseMock.tables.tasks.push({
        task_id: 201,
        owner_id: 20,
        members_id: [],
        is_deleted: false,
      });
      global.supabaseMock.tables.task_reminders.push({
        task_id: 201,
        enabled: true,
        days_before: 7,
        frequency_per_day: 2,
      });

      const response = await request(app)
        .get('/api/tasks/201/reminders')
        .query({ acting_user_id: '20' });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({
        task_id: 201,
        enabled: true,
        days_before: 7,
        frequency_per_day: 2,
      });
    });

    it('returns 500 when reminder query fails', async () => {
      global.supabaseMock.tables.users.push({ user_id: 30, access_level: 1 });
      global.supabaseMock.tables.tasks.push({
        task_id: 202,
        owner_id: 30,
        members_id: [],
        is_deleted: false,
      });
      global.supabaseMock.__setNextResult({
        table: 'task_reminders',
        operation: 'select',
        error: { message: 'Reminder fetch failed' },
      });

      const response = await request(app)
        .get('/api/tasks/202/reminders')
        .query({ acting_user_id: '30' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Reminder fetch failed' });
    });
  });

  describe('PUT /api/tasks/:id/reminders', () => {
    it('allows the task owner to enable reminders', async () => {
      global.supabaseMock.tables.users.push({ user_id: 40, access_level: 1 });
      global.supabaseMock.tables.tasks.push({
        task_id: 210,
        title: 'Board meeting',
        owner_id: 40,
        due_date: '2025-11-05',
        is_deleted: false,
      });

      const response = await request(app)
        .put('/api/tasks/210/reminders')
        .send({
          acting_user_id: 40,
          enabled: true,
          days_before: 3,
          frequency_per_day: 2,
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(
        expect.objectContaining({
          task_id: 210,
          enabled: true,
          days_before: 3,
          frequency_per_day: 2,
        })
      );
    });

    it('rejects enabling reminders for tasks without due dates', async () => {
      global.supabaseMock.tables.users.push({ user_id: 41, access_level: 1 });
      global.supabaseMock.tables.tasks.push({
        task_id: 211,
        title: 'No due date',
        owner_id: 41,
        due_date: null,
        is_deleted: false,
      });

      const response = await request(app)
        .put('/api/tasks/211/reminders')
        .send({
          acting_user_id: 41,
          enabled: true,
          days_before: 3,
          frequency_per_day: 1,
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Cannot enable reminders for a task without a due date' });
    });

    it('prevents non-owners from updating reminders', async () => {
      global.supabaseMock.tables.users.push(
        { user_id: 42, access_level: 1 },
        { user_id: 43, access_level: 1 }
      );
      global.supabaseMock.tables.tasks.push({
        task_id: 212,
        title: 'Private task',
        owner_id: 42,
        due_date: '2025-11-10',
        is_deleted: false,
      });

      const response = await request(app)
        .put('/api/tasks/212/reminders')
        .send({
          acting_user_id: 43,
          enabled: true,
          days_before: 7,
          frequency_per_day: 1,
        });

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'Only the task owner can set reminders' });
    });

    it('returns 500 when the upsert fails', async () => {
      global.supabaseMock.tables.users.push({ user_id: 44, access_level: 1 });
      global.supabaseMock.tables.tasks.push({
        task_id: 213,
        title: 'Database issue',
        owner_id: 44,
        due_date: '2025-11-12',
        is_deleted: false,
      });
      global.supabaseMock.__setNextResult({
        table: 'task_reminders',
        operation: 'upsert',
        error: { message: 'Upsert failed' },
      });

      const response = await request(app)
        .put('/api/tasks/213/reminders')
        .send({
          acting_user_id: 44,
          enabled: true,
          days_before: 1,
          frequency_per_day: 3,
        });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Upsert failed' });
    });
  });

  describe('POST /api/reminders/check', () => {
    it('returns the number of reminders sent', async () => {
      checkAndSendReminders.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);

      const response = await request(app).post('/api/reminders/check');

      expect(response.status).toBe(200);
      expect(checkAndSendReminders).toHaveBeenCalled();
      expect(response.body).toEqual({
        success: true,
        message: 'Processed reminder check - sent 2 notifications',
        notifications_sent: [{ id: 1 }, { id: 2 }],
      });
    });

    it('propagates errors from the reminder service', async () => {
      checkAndSendReminders.mockRejectedValueOnce(new Error('Reminder service down'));

      const response = await request(app).post('/api/reminders/check');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('POST /api/overdue/check', () => {
    it('returns the number of overdue notifications sent', async () => {
      checkAndSendOverdueNotifications.mockResolvedValueOnce([{ id: 5 }]);

      const response = await request(app).post('/api/overdue/check');

      expect(response.status).toBe(200);
      expect(checkAndSendOverdueNotifications).toHaveBeenCalled();
      expect(response.body.notifications_sent).toEqual([{ id: 5 }]);
    });

    it('handles errors from the overdue service', async () => {
      checkAndSendOverdueNotifications.mockRejectedValueOnce(new Error('Overdue service down'));

      const response = await request(app).post('/api/overdue/check');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('Notification preferences', () => {
    it('returns default preferences when none exist', async () => {
      const response = await request(app)
        .get('/api/notification-prefs')
        .query({ user_id: '500' });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({ user_id: 500, in_app: true, email: true });
    });

    it('returns stored preferences when present', async () => {
      global.supabaseMock.tables.user_notification_prefs.push({
        user_id: 501,
        in_app: false,
        email: true,
      });

      const response = await request(app)
        .get('/api/notification-prefs')
        .query({ user_id: '501' });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({
        user_id: 501,
        in_app: false,
        email: true,
      });
    });

    it('returns 500 when retrieving prefs fails with non-116 code', async () => {
      global.supabaseMock.__setNextResult({
        table: 'user_notification_prefs',
        operation: 'select',
        error: { message: 'Prefs fetch failed', code: '999' },
      });

      const response = await request(app)
        .get('/api/notification-prefs')
        .query({ user_id: '502' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Prefs fetch failed' });
    });

    it('allows updating notification preferences', async () => {
      const response = await request(app)
        .post('/api/notification-prefs')
        .send({ user_id: 503, in_app: false, email: false });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({
        user_id: 503,
        in_app: false,
        email: false,
      });
    });
  });

  describe('Notifications endpoints', () => {
    it('lists notifications for a user', async () => {
      global.supabaseMock.tables.notifications.push(
        { id: 1, user_id: 600, message: 'First', created_at: '2025-11-01', read: false },
        { id: 2, user_id: 600, message: 'Second', created_at: '2025-11-02', read: true }
      );

      const response = await request(app)
        .get('/api/notifications')
        .query({ user_id: '600' });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
    });

    it('marks a notification as read', async () => {
      global.supabaseMock.tables.notifications.push({
        id: 10,
        user_id: 601,
        read: false,
      });

      const response = await request(app)
        .post('/api/notifications/10/read')
        .send({ user_id: 601 });

      expect(response.status).toBe(200);
      const updated = global.supabaseMock.tables.notifications.find((n) => n.id === 10);
      expect(updated.read).toBe(true);
    });

    it('returns 500 when marking as read fails', async () => {
      global.supabaseMock.__setNextResult({
        table: 'notifications',
        operation: 'update',
        error: { message: 'Update failed' },
      });

      const response = await request(app)
        .post('/api/notifications/11/read')
        .send({ user_id: 602 });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Update failed' });
    });
  });
});
