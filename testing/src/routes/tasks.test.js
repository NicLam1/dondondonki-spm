const path = require('path');
const request = require('supertest');

const activityLogModulePath = path.resolve(__dirname, '../../../backend/src/services/activityLog.js');
const emailNotificationsModulePath = path.resolve(__dirname, '../../../backend/src/services/emailNotifications.js');

const { ActivityTypes, recordTaskActivity, recordMultipleTaskActivities } = require(activityLogModulePath);
const { notifyTaskAssigned, notifyTaskStatusChange, notifyCommentMentioned } = require(emailNotificationsModulePath);
const { createTestApp } = require('../utils/createTestApp');

describe('GET /api/tasks', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  test('returns filtered tasks for acting director with specified targets', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 10, full_name: 'Director Dee', access_level: 2, team_id: 1, department_id: 1 },
      { user_id: 20, full_name: 'Manager Max', access_level: 1, team_id: 1, department_id: 1 },
      { user_id: 30, full_name: 'Staff Sue', access_level: 0, team_id: 1, department_id: 1 },
      { user_id: 40, full_name: 'Other Ollie', access_level: 0, team_id: 2, department_id: 2 }
    );

    global.supabaseMock.tables.tasks.push(
      {
        task_id: 1,
        title: 'Director Task',
        owner_id: 10,
        members_id: [],
        status: 'TO_DO',
        is_deleted: false,
      },
      {
        task_id: 2,
        title: 'Team Task',
        owner_id: 30,
        members_id: [],
        status: 'IN_PROGRESS',
        is_deleted: false,
      },
      {
        task_id: 3,
        title: 'Member Task',
        owner_id: 40,
        members_id: [30],
        status: 'DONE',
        is_deleted: false,
      },
      {
        task_id: 4,
        title: 'External Task',
        owner_id: 50,
        members_id: [],
        status: 'UNASSIGNED',
        is_deleted: false,
      }
    );

    const response = await request(app)
      .get('/api/tasks')
      .query({ acting_user_id: '10', user_ids: '10,30,40' });

    if (response.status !== 200) {
      throw new Error(`Unexpected status ${response.status}: ${JSON.stringify(response.body)}`);
    }
    const ids = response.body.data.map((t) => t.task_id).sort();
    expect(ids).toEqual([1, 2, 3]);
    const statusMap = Object.fromEntries(response.body.data.map((t) => [t.task_id, t.status]));
    expect(statusMap[1]).toBe('ONGOING'); // mapped from TO_DO
    expect(statusMap[2]).toBe('ONGOING'); // IN_PROGRESS -> ONGOING
    expect(statusMap[3]).toBe('COMPLETED'); // DONE -> COMPLETED
  });

  test('returns empty list when acting user lacks access to requested IDs', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 10, full_name: 'Manager Max', access_level: 1, team_id: 1, department_id: 1 },
      { user_id: 20, full_name: 'Staff Sue', access_level: 0, team_id: 2, department_id: 2 }
    );

    const response = await request(app)
      .get('/api/tasks')
      .query({ acting_user_id: '10', user_ids: '20' });

    if (response.status !== 200) {
      throw new Error(`Unexpected status ${response.status}: ${JSON.stringify(response.body)}`);
    }
    expect(response.body).toEqual({ data: [] });
  });

  test('supports legacy single user filter', async () => {
    global.supabaseMock.tables.tasks.push(
      {
        task_id: 11,
        title: 'Legacy Owner Task',
        owner_id: 99,
        members_id: [],
        status: 'UNASSIGNED',
        is_deleted: false,
      },
      {
        task_id: 12,
        title: 'Legacy Member Task',
        owner_id: 55,
        members_id: [99],
        status: 'TO_DO',
        is_deleted: false,
      }
    );

    const response = await request(app)
      .get('/api/tasks')
      .query({ user_id: '99' });

    expect(response.status).toBe(200);
    const ids = response.body.data.map((t) => t.task_id).sort();
    expect(ids).toEqual([11, 12]);
  });

  test('propagates Supabase errors when acting user lookup fails', async () => {
    const originalFrom = global.supabaseMock.from;
    global.supabaseMock.from = jest.fn((table) => {
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: null, error: { message: 'Lookup failed' } }),
            }),
          }),
        };
      }
      return originalFrom(table);
    });

    const response = await request(app)
      .get('/api/tasks')
      .query({ acting_user_id: '10' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Lookup failed' });

    global.supabaseMock.from = originalFrom;
  });
});

describe('GET /api/tasks/by-user/:userId', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  test('returns merged tasks for subordinate when acting user outranks target', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 1, access_level: 2 },
      { user_id: 2, access_level: 1 }
    );

    global.supabaseMock.tables.tasks.push(
      { task_id: 10, title: 'Owned task', owner_id: 2, assignee_id: null, members_id: [], status: 'TO_DO', is_deleted: false },
      { task_id: 11, title: 'Assigned task', owner_id: 3, assignee_id: 2, members_id: [], status: 'IN_PROGRESS', is_deleted: false },
      { task_id: 12, title: 'Member task', owner_id: 4, assignee_id: null, members_id: [2], status: 'DONE', is_deleted: false },
      { task_id: 13, title: 'Deleted task', owner_id: 2, assignee_id: null, members_id: [], status: 'UNASSIGNED', is_deleted: true }
    );

    const response = await request(app)
      .get('/api/tasks/by-user/2')
      .query({ acting_user_id: '1' });

    expect(response.status).toBe(200);
    const payload = response.body.data;
    expect(payload.map((t) => t.task_id).sort()).toEqual([10, 11, 12]);
    const statusMap = Object.fromEntries(payload.map((t) => [t.task_id, t.status]));
    expect(statusMap[10]).toBe('ONGOING'); // TO_DO normalized
    expect(statusMap[11]).toBe('ONGOING'); // IN_PROGRESS normalized
    expect(statusMap[12]).toBe('COMPLETED'); // DONE normalized
  });

  test('denies access when acting user does not outrank target', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 1, access_level: 1 },
      { user_id: 2, access_level: 1 }
    );

    const response = await request(app)
      .get('/api/tasks/by-user/2')
      .query({ acting_user_id: '1' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "Forbidden: insufficient permissions to view this user's tasks",
    });
  });

  test('returns 400 when acting user id missing', async () => {
    const response = await request(app).get('/api/tasks/by-user/2');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'acting_user_id is required' });
  });
});

describe('POST /api/tasks', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  test('creates an unassigned task for the acting owner', async () => {
    global.supabaseMock.tables.users.push({ user_id: 10, access_level: 1 });

    const response = await request(app)
      .post('/api/tasks')
      .send({
        title: 'Prepare report',
        description: 'Quarterly numbers',
        due_date: '2025-11-01',
        priority_bucket: 4,
        owner_id: 10,
        acting_user_id: 10,
        members_id: [],
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: expect.objectContaining({
        task_id: expect.any(Number),
        title: 'Prepare report',
        status: 'UNASSIGNED',
        owner_id: 10,
        assignee_id: null,
      }),
    });

    expect(global.supabaseMock.tables.tasks).toHaveLength(1);
    expect(recordTaskActivity).toHaveBeenCalledTimes(1);
    expect(recordTaskActivity).toHaveBeenCalledWith(
      global.supabaseMock,
      expect.objectContaining({
        taskId: expect.any(Number),
        type: ActivityTypes.TASK_CREATED,
        authorId: 10,
      })
    );
    expect(notifyTaskAssigned).not.toHaveBeenCalled();
  });

  test('creates a task with assignee and triggers reassignment activity + email', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 1, access_level: 2 },
      { user_id: 2, access_level: 1 }
    );

    const response = await request(app)
      .post('/api/tasks')
      .send({
        title: 'Follow up with client',
        description: 'Call ACME',
        due_date: '2025-12-15',
        priority_bucket: 3,
        owner_id: 2,
        acting_user_id: 1,
        assignee_id: 3,
        members_id: [],
        status: 'UNASSIGNED',
      });

    expect(response.status).toBe(200);
    const createdTask = response.body.data;
    expect(createdTask.assignee_id).toBe(3);
    expect(createdTask.status).toBe('ONGOING');

    expect(recordTaskActivity).toHaveBeenCalledTimes(2);
    expect(recordTaskActivity.mock.calls[0][1]).toMatchObject({
      type: ActivityTypes.TASK_CREATED,
      authorId: 1,
      taskId: createdTask.task_id,
    });
    expect(recordTaskActivity.mock.calls[1][1]).toMatchObject({
      type: ActivityTypes.REASSIGNED,
      metadata: { from_assignee: null, to_assignee: 3 },
    });
    expect(notifyTaskAssigned).toHaveBeenCalledWith(global.supabaseMock, createdTask, 3);
  });

  test('rejects missing required fields', async () => {
    const response = await request(app).post('/api/tasks').send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Missing required fields: title, owner_id, and acting_user_id are required',
    });
    expect(recordTaskActivity).not.toHaveBeenCalled();
  });

  test('rejects when acting user lacks permission for owner', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 1, access_level: 1 },
      { user_id: 2, access_level: 1 }
    );

    const response = await request(app)
      .post('/api/tasks')
      .send({
        title: 'Unauthorized task',
        due_date: '2025-10-10',
        priority_bucket: 5,
        owner_id: 2,
        acting_user_id: 1,
      });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Insufficient permissions to create task for this owner',
    });
    expect(global.supabaseMock.tables.tasks).toHaveLength(0);
  });
});

describe('POST /api/tasks/:id/subtask', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    recordTaskActivity.mockClear();
    notifyTaskAssigned.mockClear();
  });

  test('creates a subtask for the task owner', async () => {
    global.supabaseMock.tables.users.push({ user_id: 120, access_level: 1 });
    global.supabaseMock.tables.tasks.push({
      task_id: 400,
      title: 'Parent',
      description: 'Parent task',
      status: 'ONGOING',
      priority_bucket: 4,
      due_date: '2025-11-10',
      project: 'Alpha',
      project_id: 77,
      owner_id: 120,
      assignee_id: 120,
      members_id: [120],
      is_deleted: false,
    });

    const response = await request(app)
      .post('/api/tasks/400/subtask')
      .send({
        title: 'Child task',
        description: 'Handle sub work',
        status: 'UNASSIGNED',
        due_date: '2025-11-08',
        owner_id: 120,
        assignee_id: 120,
        members_id: [],
        acting_user_id: 120,
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    const created = response.body.data;
    expect(created.parent_task_id).toBe(400);
    expect(created.project_id).toBe(77);
    expect(created.priority_bucket).toBe(4);
    expect(notifyTaskAssigned).toHaveBeenCalledWith(
      global.supabaseMock,
      expect.objectContaining({ task_id: created.task_id }),
      120
    );
  });

  test('rejects when owner is included in members list', async () => {
    global.supabaseMock.tables.users.push({ user_id: 121, access_level: 1 });
    global.supabaseMock.tables.tasks.push({
      task_id: 401,
      title: 'Parent',
      owner_id: 121,
      due_date: '2025-11-05',
      priority_bucket: 5,
      project: null,
      assignee_id: null,
      members_id: [],
      is_deleted: false,
    });

    const response = await request(app)
      .post('/api/tasks/401/subtask')
      .send({
        title: 'Invalid subtask',
        description: 'Should fail',
        status: 'UNASSIGNED',
        due_date: '2025-11-04',
        owner_id: 121,
        assignee_id: null,
        members_id: [121],
        acting_user_id: 121,
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Owner cannot be a member' });
  });

  test('returns 500 when subtask insert fails', async () => {
    global.supabaseMock.tables.users.push({ user_id: 122, access_level: 1 });
    global.supabaseMock.tables.tasks.push({
      task_id: 402,
      title: 'Parent',
      owner_id: 122,
      due_date: '2025-11-07',
      priority_bucket: 3,
      project: null,
      assignee_id: null,
      members_id: [],
      is_deleted: false,
    });
    global.supabaseMock.__setNextResult({
      table: 'tasks',
      operation: 'insert',
      error: { message: 'Insert failed' },
    });

    const response = await request(app)
      .post('/api/tasks/402/subtask')
      .send({
        title: 'Broken subtask',
        description: 'Insert should fail',
        status: 'UNASSIGNED',
        due_date: '2025-11-06',
        owner_id: 122,
        assignee_id: null,
        members_id: [],
        acting_user_id: 122,
      });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: 'Failed to create subtask',
      details: 'Insert failed',
    });
  });

  test('requires due_date when creating a subtask', async () => {
    global.supabaseMock.tables.users.push({ user_id: 123, access_level: 1 });
    global.supabaseMock.tables.tasks.push({
      task_id: 403,
      title: 'Parent',
      owner_id: 123,
      due_date: '2025-11-20',
      priority_bucket: 4,
      project: null,
      assignee_id: null,
      members_id: [],
      is_deleted: false,
    });

    const response = await request(app)
      .post('/api/tasks/403/subtask')
      .send({
        title: 'Missing due date',
        description: 'Should fail',
        status: 'UNASSIGNED',
        due_date: '',
        owner_id: 123,
        assignee_id: null,
        members_id: [],
        acting_user_id: 123,
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'due_date is required' });
  });

  test('returns 500 when acting user lookup fails', async () => {
    global.supabaseMock.tables.tasks.push({
      task_id: 404,
      title: 'Parent',
      owner_id: 124,
      due_date: '2025-11-21',
      priority_bucket: 2,
      project: null,
      assignee_id: null,
      members_id: [],
      is_deleted: false,
    });
    global.supabaseMock.__setNextResult({
      table: 'users',
      operation: 'select',
      error: { message: 'Users table down' },
    });

    const response = await request(app)
      .post('/api/tasks/404/subtask')
      .send({
        title: 'Failure expected',
        description: '',
        status: 'UNASSIGNED',
        due_date: '2025-11-20',
        owner_id: 124,
        assignee_id: null,
        members_id: [],
        acting_user_id: 124,
      });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to verify acting user' });
  });

  test('returns 500 when parent task lookup fails', async () => {
    global.supabaseMock.tables.users.push({ user_id: 125, access_level: 2 });
    global.supabaseMock.tables.tasks.push({
      task_id: 405,
      title: 'Parent',
      owner_id: 125,
      due_date: '2025-11-21',
      priority_bucket: 2,
      project: null,
      assignee_id: null,
      members_id: [],
      is_deleted: false,
    });
    global.supabaseMock.__setNextResult({
      table: 'users',
      operation: 'select',
      data: [{ user_id: 125, access_level: 2 }],
    });
    global.supabaseMock.__setNextResult({
      table: 'tasks',
      operation: 'select',
      error: { message: 'Failed to verify parent task' },
    });

    const response = await request(app)
      .post('/api/tasks/405/subtask')
      .send({
        title: 'Failure expected',
        description: '',
        status: 'UNASSIGNED',
        due_date: '2025-11-20',
        owner_id: 125,
        assignee_id: null,
        members_id: [],
        acting_user_id: 125,
      });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to verify parent task' });
  });

  test('returns 403 when acting user does not outrank parent owner', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 130, access_level: 1 },
      { user_id: 131, access_level: 1 }
    );
    global.supabaseMock.tables.tasks.push({
      task_id: 406,
      title: 'Peer parent',
      owner_id: 131,
      due_date: '2025-11-23',
      priority_bucket: 2,
      project: null,
      assignee_id: null,
      members_id: [],
      is_deleted: false,
    });

    const response = await request(app)
      .post('/api/tasks/406/subtask')
      .send({
        title: 'Unauthorized subtask',
        description: '',
        status: 'UNASSIGNED',
        due_date: '2025-11-22',
        owner_id: 130,
        assignee_id: null,
        members_id: [],
        acting_user_id: 130,
      });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Insufficient permissions to create subtask for this task' });
  });

  test('returns 403 when acting user lacks permission to assign to another owner', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 140, access_level: 1 },
      { user_id: 141, access_level: 1 },
      { user_id: 142, access_level: 2 }
    );
    global.supabaseMock.tables.tasks.push({
      task_id: 407,
      title: 'Parent task',
      owner_id: 142,
      due_date: '2025-11-24',
      priority_bucket: 3,
      project: null,
      assignee_id: null,
      members_id: [],
      is_deleted: false,
    });

    const response = await request(app)
      .post('/api/tasks/407/subtask')
      .send({
        title: 'Unauthorized owner change',
        description: '',
        status: 'UNASSIGNED',
        due_date: '2025-11-23',
        owner_id: 141,
        assignee_id: null,
        members_id: [],
        acting_user_id: 140,
      });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Insufficient permissions to create subtask for this task' });
  });
});

describe('PATCH /api/tasks/:id/status', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  test('updates status when acting owner is allowed and notifies stakeholders', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 1, access_level: 2 },
      { user_id: 3, access_level: 0 }
    );
    global.supabaseMock.tables.tasks.push({
      task_id: 21,
      title: 'Client demo',
      owner_id: 1,
      assignee_id: 3,
      members_id: [1, 3],
      status: 'ONGOING',
      is_deleted: false,
    });

    const response = await request(app)
      .patch('/api/tasks/21/status')
      .query({ acting_user_id: '1' })
      .send({ status: 'COMPLETED' });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        task_id: 21,
        status: 'COMPLETED',
      })
    );

    expect(recordTaskActivity).toHaveBeenCalledWith(
      global.supabaseMock,
      expect.objectContaining({
        taskId: 21,
        authorId: 1,
        type: ActivityTypes.STATUS_CHANGED,
        metadata: { from_status: 'ONGOING', to_status: 'COMPLETED' },
      })
    );
    expect(notifyTaskStatusChange).toHaveBeenCalledWith(
      global.supabaseMock,
      expect.objectContaining({ task_id: 21 }),
      'ONGOING',
      'COMPLETED',
      1
    );
  });

  test('rejects status change when task has no assignee', async () => {
    global.supabaseMock.tables.users.push({ user_id: 1, access_level: 1 });
    global.supabaseMock.tables.tasks.push({
      task_id: 22,
      title: 'Internal doc',
      owner_id: 1,
      assignee_id: null,
      members_id: [1],
      status: 'UNASSIGNED',
      is_deleted: false,
    });

    const response = await request(app)
      .patch('/api/tasks/22/status')
      .query({ acting_user_id: '1' })
      .send({ status: 'ONGOING' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Assign someone before changing status' });
    expect(recordTaskActivity).not.toHaveBeenCalled();
  });

  test('forbids status change when acting user lacks access', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 5, access_level: 1 },
      { user_id: 6, access_level: 1 }
    );
    global.supabaseMock.tables.tasks.push({
      task_id: 23,
      title: 'Secure task',
      owner_id: 6,
      assignee_id: 6,
      members_id: [],
      status: 'ONGOING',
      is_deleted: false,
    });

    const response = await request(app)
      .patch('/api/tasks/23/status')
      .query({ acting_user_id: '5' })
      .send({ status: 'COMPLETED' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Forbidden' });
    expect(global.supabaseMock.tables.tasks.find((t) => t.task_id === 23).status).toBe('ONGOING');
  });

  test('creates the next recurring instance when completing a recurring task', async () => {
    notifyTaskStatusChange.mockClear();
    recordTaskActivity.mockClear();

    global.supabaseMock.tables.users.push(
      { user_id: 60, access_level: 2 },
      { user_id: 61, access_level: 0 }
    );

    global.supabaseMock.tables.tasks.push(
      {
        task_id: 70,
        title: 'Recurring parent',
        owner_id: 60,
        assignee_id: 61,
        members_id: [60, 61],
        status: 'ONGOING',
        is_deleted: false,
        is_recurring: true,
        recurrence_type: 'daily',
        recurrence_interval: 1,
        recurrence_end_date: '2025-12-31',
        due_date: '2025-11-01',
        priority_bucket: 3,
      },
      {
        task_id: 71,
        title: 'Recurring subtask',
        owner_id: 60,
        assignee_id: 61,
        members_id: [],
        status: 'ONGOING',
        is_deleted: false,
        parent_task_id: 70,
      }
    );

    const response = await request(app)
      .patch('/api/tasks/70/status')
      .query({ acting_user_id: '60' })
      .send({ status: 'COMPLETED' });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        task_id: 70,
        status: 'COMPLETED',
      })
    );

    const createdRecurringTask = global.supabaseMock.tables.tasks.find(
      (task) => task.parent_recurring_task_id === 70
    );
    expect(createdRecurringTask).toBeDefined();
    expect(createdRecurringTask.status).toBe('ONGOING');
    expect(createdRecurringTask.due_date).toBe('2025-11-02');

    const createdSubtask = global.supabaseMock.tables.tasks.find(
      (task) => task.parent_task_id === createdRecurringTask.task_id
    );
    expect(createdSubtask).toBeDefined();
    expect(createdSubtask.status).toBe('ONGOING');

    expect(recordTaskActivity).toHaveBeenCalledWith(
      global.supabaseMock,
      expect.objectContaining({
        taskId: createdRecurringTask.task_id,
        type: ActivityTypes.TASK_CREATED,
        metadata: expect.objectContaining({ recurring_instance: true }),
      })
    );
    expect(notifyTaskStatusChange).toHaveBeenCalled();
  });

  test('skips creating a new instance when recurrence end date is reached', async () => {
    global.supabaseMock.tables.users.push({ user_id: 80, access_level: 2 });
    global.supabaseMock.tables.tasks.push({
      task_id: 81,
      title: 'Limited recurrence',
      owner_id: 80,
      assignee_id: 80,
      members_id: [80],
      status: 'ONGOING',
      is_deleted: false,
      is_recurring: true,
      recurrence_type: 'daily',
      recurrence_interval: 1,
      recurrence_end_date: '2025-11-01',
      due_date: '2025-11-01',
      priority_bucket: 3,
    });

    const response = await request(app)
      .patch('/api/tasks/81/status')
      .query({ acting_user_id: '80' })
      .send({ status: 'COMPLETED' });

    expect(response.status).toBe(200);
    const hasNewInstance = global.supabaseMock.tables.tasks.some(
      (task) => task.parent_recurring_task_id === 81
    );
    expect(hasNewInstance).toBe(false);
  });

  test('does not create a new instance when due date is invalid', async () => {
    global.supabaseMock.tables.users.push({ user_id: 90, access_level: 2 });
    global.supabaseMock.tables.tasks.push({
      task_id: 91,
      title: 'Broken recurrence',
      owner_id: 90,
      assignee_id: 90,
      members_id: [90],
      status: 'ONGOING',
      is_deleted: false,
      is_recurring: true,
      recurrence_type: 'daily',
      recurrence_interval: 1,
      recurrence_end_date: null,
      due_date: 'invalid-date',
      priority_bucket: 3,
    });

    const response = await request(app)
      .patch('/api/tasks/91/status')
      .query({ acting_user_id: '90' })
      .send({ status: 'COMPLETED' });

    expect(response.status).toBe(200);
    const hasNewInstance = global.supabaseMock.tables.tasks.some(
      (task) => task.parent_recurring_task_id === 91
    );
    expect(hasNewInstance).toBe(false);
  });

  test('creates a monthly recurring instance and adjusts end-of-month dates', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 200, access_level: 2 },
      { user_id: 201, access_level: 1 }
    );
    global.supabaseMock.tables.tasks.push({
      task_id: 92,
      title: 'Monthly billing',
      owner_id: 200,
      assignee_id: 201,
      members_id: [200, 201],
      status: 'ONGOING',
      is_deleted: false,
      is_recurring: true,
      recurrence_type: 'monthly',
      recurrence_interval: 1,
      recurrence_end_date: '2025-12-31',
      due_date: '2025-01-31',
      priority_bucket: 4,
    });

    const response = await request(app)
      .patch('/api/tasks/92/status')
      .query({ acting_user_id: '200' })
      .send({ status: 'COMPLETED' });

    expect(response.status).toBe(200);

    const nextInstance = global.supabaseMock.tables.tasks.find(
      (task) => task.parent_recurring_task_id === 92
    );
    expect(nextInstance).toBeDefined();
    expect(nextInstance.due_date).toBe('2025-02-28');
    expect(nextInstance.next_due_date).toBe('2025-03-28');
  });

  test('skips creating an instance when custom recurrence interval is invalid', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 210, access_level: 2 },
      { user_id: 211, access_level: 1 }
    );
    global.supabaseMock.tables.tasks.push({
      task_id: 93,
      title: 'Ad-hoc reminder',
      owner_id: 210,
      assignee_id: 211,
      members_id: [210, 211],
      status: 'ONGOING',
      is_deleted: false,
      is_recurring: true,
      recurrence_type: 'custom',
      recurrence_interval: 0,
      recurrence_end_date: null,
      due_date: '2025-11-15',
      priority_bucket: 2,
    });

    const response = await request(app)
      .patch('/api/tasks/93/status')
      .query({ acting_user_id: '210' })
      .send({ status: 'COMPLETED' });

    expect(response.status).toBe(200);
    const createdInstance = global.supabaseMock.tables.tasks.find(
      (task) => task.parent_recurring_task_id === 93
    );
    expect(createdInstance).toBeUndefined();
  });

  test('creates a custom recurring instance when interval is valid', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 220, access_level: 2 },
      { user_id: 221, access_level: 1 }
    );
    global.supabaseMock.tables.tasks.push({
      task_id: 94,
      title: 'Follow-up call',
      owner_id: 220,
      assignee_id: 221,
      members_id: [220, 221],
      status: 'ONGOING',
      is_deleted: false,
      is_recurring: true,
      recurrence_type: 'custom',
      recurrence_interval: 5,
      recurrence_end_date: null,
      due_date: '2025-11-05',
      priority_bucket: 3,
    });

    const response = await request(app)
      .patch('/api/tasks/94/status')
      .query({ acting_user_id: '220' })
      .send({ status: 'COMPLETED' });

    expect(response.status).toBe(200);

    const createdInstance = global.supabaseMock.tables.tasks.find(
      (task) => task.parent_recurring_task_id === 94
    );
    expect(createdInstance).toBeDefined();
    expect(createdInstance.due_date).toBe('2025-11-10');
    expect(createdInstance.next_due_date).toBe('2025-11-15');
  });

  test('skips creating an instance when recurrence type is unsupported', async () => {
    global.supabaseMock.tables.users.push({ user_id: 230, access_level: 2 });
    global.supabaseMock.tables.tasks.push({
      task_id: 95,
      title: 'Unsupported recurrence',
      owner_id: 230,
      assignee_id: 230,
      members_id: [230],
      status: 'ONGOING',
      is_deleted: false,
      is_recurring: true,
      recurrence_type: 'yearly',
      recurrence_interval: 1,
      recurrence_end_date: null,
      due_date: '2025-11-05',
      priority_bucket: 5,
    });

    const response = await request(app)
      .patch('/api/tasks/95/status')
      .query({ acting_user_id: '230' })
      .send({ status: 'COMPLETED' });

    expect(response.status).toBe(200);
    const createdInstance = global.supabaseMock.tables.tasks.find(
      (task) => task.parent_recurring_task_id === 95
    );
    expect(createdInstance).toBeUndefined();
  });
});

describe('GET /api/tasks/by-user/:userId', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  test('returns merged tasks for owner, assignee, and member roles with status mapping', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 10, access_level: 2 },
      { user_id: 20, access_level: 1 }
    );

    global.supabaseMock.tables.tasks.push(
      {
        task_id: 100,
        title: 'Owner Task',
        owner_id: 20,
        assignee_id: null,
        members_id: [],
        status: 'TO_DO',
        is_deleted: false,
      },
      {
        task_id: 101,
        title: 'Assignee Task',
        owner_id: 30,
        assignee_id: 20,
        members_id: [],
        status: 'DONE',
        is_deleted: false,
      },
      {
        task_id: 102,
        title: 'Member Task',
        owner_id: 40,
        assignee_id: null,
        members_id: [20],
        status: 'IN_PROGRESS',
        is_deleted: false,
      }
    );

    const response = await request(app)
      .get('/api/tasks/by-user/20')
      .query({ acting_user_id: '10' });

    expect(response.status).toBe(200);
    const statuses = Object.fromEntries(response.body.data.map((t) => [t.task_id, t.status]));
    expect(statuses[100]).toBe('ONGOING'); // TO_DO -> ONGOING
    expect(statuses[101]).toBe('COMPLETED'); // DONE -> COMPLETED
    expect(statuses[102]).toBe('ONGOING'); // IN_PROGRESS -> ONGOING
    expect(response.body.data).toHaveLength(3);
  });

  test('rejects acting users without sufficient access', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 30, access_level: 1 },
      { user_id: 40, access_level: 1 }
    );

    const response = await request(app)
      .get('/api/tasks/by-user/40')
      .query({ acting_user_id: '30' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "Forbidden: insufficient permissions to view this user's tasks",
    });
  });

  test('validates user id parameter', async () => {
    const response = await request(app)
      .get('/api/tasks/by-user/not-a-number')
      .query({ acting_user_id: '10' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid user id' });
  });
});

describe('GET /api/tasks/by-user/:userId/deadlines', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  test('returns deadline data for the acting user with role annotations', async () => {
    global.supabaseMock.tables.users.push({ user_id: 50, access_level: 0 });

    global.supabaseMock.tables.tasks.push(
      {
        task_id: 301,
        title: 'Owned task',
        owner_id: 50,
        assignee_id: null,
        members_id: [],
        due_date: '2025-11-05',
        priority_bucket: 3,
        status: 'TO_DO',
        is_deleted: false,
      },
      {
        task_id: 302,
        title: 'Assigned task',
        owner_id: 60,
        assignee_id: 50,
        members_id: [],
        due_date: '2025-11-10',
        priority_bucket: 4,
        status: 'DONE',
        is_deleted: false,
      },
      {
        task_id: 303,
        title: 'Member task',
        owner_id: 70,
        assignee_id: null,
        members_id: [50],
        due_date: '2025-12-01',
        priority_bucket: 5,
        status: 'IN_PROGRESS',
        is_deleted: false,
      }
    );

    const response = await request(app)
      .get('/api/tasks/by-user/50/deadlines')
      .query({ acting_user_id: '50' });

    expect(response.status).toBe(200);
    const payload = response.body.data;
    expect(payload).toHaveLength(3);

    const roles = Object.fromEntries(payload.map((item) => [item.task_id, item.roles]));
    expect(roles[301]).toContain('owner');
    expect(roles[302]).toContain('assignee');
    expect(roles[303]).toContain('member');

    const statuses = Object.fromEntries(payload.map((item) => [item.task_id, item.status]));
    expect(statuses[301]).toBe('ONGOING');
    expect(statuses[302]).toBe('COMPLETED');
    expect(statuses[303]).toBe('ONGOING');
  });

  test('allows access via shared project membership even if acting user is a peer', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 80, access_level: 1 },
      { user_id: 90, access_level: 1 }
    );

    global.supabaseMock.tables.projects.push({
      project_id: 500,
      owner_id: 90,
      members: [80, 90],
    });

    global.supabaseMock.tables.tasks.push({
      task_id: 401,
      title: 'Project shared task',
      owner_id: 90,
      assignee_id: 90,
      members_id: [80, 90],
      due_date: '2025-11-15',
      priority_bucket: 2,
      status: 'IN_PROGRESS',
      is_deleted: false,
    });

    const response = await request(app)
      .get('/api/tasks/by-user/90/deadlines')
      .query({ acting_user_id: '80', project_id: '500' });

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  test('denies access when acting user is a peer without shared project', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 110, access_level: 1 },
      { user_id: 120, access_level: 1 }
    );

    const response = await request(app)
      .get('/api/tasks/by-user/120/deadlines')
      .query({ acting_user_id: '110' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "Forbidden: insufficient permissions to view this user's deadlines",
    });
  });

  test('validates user id and acting user id parameters', async () => {
    const invalidTarget = await request(app)
      .get('/api/tasks/by-user/not-a-number/deadlines')
      .query({ acting_user_id: '10' });
    expect(invalidTarget.status).toBe(400);
    expect(invalidTarget.body).toEqual({ error: 'Invalid user id' });

    const missingActing = await request(app)
      .get('/api/tasks/by-user/10/deadlines');
    expect(missingActing.status).toBe(400);
    expect(missingActing.body).toEqual({ error: 'acting_user_id is required' });
  });
});

describe('GET /api/tasks/:id', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  test('returns task details when acting user outranks owner', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 200, access_level: 2 },
      { user_id: 210, access_level: 1 }
    );
    global.supabaseMock.tables.tasks.push({
      task_id: 700,
      title: 'Review contract',
      owner_id: 210,
      assignee_id: null,
      members_id: [],
      status: 'DONE',
      is_deleted: false,
    });

    const response = await request(app)
      .get('/api/tasks/700')
      .query({ acting_user_id: '200' });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        task_id: 700,
        title: 'Review contract',
        status: 'COMPLETED',
      })
    );
  });

  test('denies access when acting user lacks permissions', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 220, access_level: 1 },
      { user_id: 230, access_level: 1 }
    );
    global.supabaseMock.tables.tasks.push({
      task_id: 701,
      title: 'Restricted task',
      owner_id: 230,
      members_id: [],
      status: 'TO_DO',
      is_deleted: false,
    });

    const response = await request(app)
      .get('/api/tasks/701')
      .query({ acting_user_id: '220' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Forbidden' });
  });

  test('validates task id parameter', async () => {
    const response = await request(app)
      .get('/api/tasks/not-a-number')
      .query({ acting_user_id: '200' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid task id' });
  });
});

describe('GET /api/tasks/:id/ancestors', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  test('returns ancestor chain ordered from root to parent', async () => {
    global.supabaseMock.tables.tasks.push(
      { task_id: 900, title: 'Root', parent_task_id: null },
      { task_id: 950, title: 'Mid', parent_task_id: 900 },
      { task_id: 980, title: 'Leaf', parent_task_id: 950 }
    );

    const response = await request(app).get('/api/tasks/980/ancestors');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      { task_id: 900, title: 'Root', parent_task_id: null },
      { task_id: 950, title: 'Mid', parent_task_id: 900 },
    ]);
  });

  test('validates task id parameter', async () => {
    const response = await request(app).get('/api/tasks/not-a-number/ancestors');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid task id' });
  });
});

describe('GET /api/tasks/:id/descendants', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  test('returns breadth-first list of descendants', async () => {
    global.supabaseMock.tables.tasks.push(
      { task_id: 500, title: 'Root', parent_task_id: null, is_deleted: false },
      { task_id: 510, title: 'Child A', parent_task_id: 500, is_deleted: false },
      { task_id: 520, title: 'Child B', parent_task_id: 500, is_deleted: false },
      { task_id: 530, title: 'Grandchild', parent_task_id: 510, is_deleted: false }
    );

    const response = await request(app).get('/api/tasks/500/descendants');

    expect(response.status).toBe(200);
    const ids = response.body.data.map((row) => row.task_id);
    expect(ids).toEqual([510, 520, 530]);
  });

  test('validates task id', async () => {
    const response = await request(app).get('/api/tasks/not-a-number/descendants');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid task id' });
  });
});

describe('GET /api/tasks/deleted', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  test('staff users only see their own deleted tasks', async () => {
    global.supabaseMock.tables.users.push({
      user_id: 300,
      access_level: 0,
      team_id: 1,
      department_id: 1,
    });

    global.supabaseMock.tables.tasks.push(
      {
        task_id: 801,
        title: 'Own deleted task',
        owner_id: 300,
        is_deleted: true,
        deleted_at: '2025-10-01T12:00:00.000Z',
        owner: { user_id: 300, access_level: 0, team_id: 1, department_id: 1 },
      },
      {
        task_id: 802,
        title: 'Someone else deleted task',
        owner_id: 301,
        is_deleted: true,
        deleted_at: '2025-09-01T12:00:00.000Z',
        owner: { user_id: 301, access_level: 0, team_id: 2, department_id: 2 },
      }
    );

    const response = await request(app)
      .get('/api/tasks/deleted')
      .query({ acting_user_id: '300' });

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toEqual(
      expect.objectContaining({ task_id: 801, title: 'Own deleted task' })
    );
  });

  test('directors only see deleted tasks from their department', async () => {
    global.supabaseMock.tables.users.push({
      user_id: 400,
      access_level: 2,
      team_id: 10,
      department_id: 5,
    });

    global.supabaseMock.tables.tasks.push(
      {
        task_id: 901,
        title: 'Same dept task',
        owner_id: 410,
        is_deleted: true,
        deleted_at: '2025-10-15T09:00:00.000Z',
        owner: { user_id: 410, access_level: 1, team_id: 12, department_id: 5 },
      },
      {
        task_id: 902,
        title: 'Different dept task',
        owner_id: 420,
        is_deleted: true,
        deleted_at: '2025-10-12T09:00:00.000Z',
        owner: { user_id: 420, access_level: 1, team_id: 20, department_id: 6 },
      }
    );

    const response = await request(app)
      .get('/api/tasks/deleted')
      .query({ acting_user_id: '400' });

    expect(response.status).toBe(200);
    const ids = response.body.data.map((t) => t.task_id);
    expect(ids).toEqual([901]);
  });

  test('managers see deleted tasks from the same team owned by staff', async () => {
    global.supabaseMock.tables.users.push({
      user_id: 500,
      access_level: 1,
      team_id: 77,
      department_id: 9,
    });

    global.supabaseMock.tables.tasks.push(
      {
        task_id: 911,
        title: 'Teammate staff task',
        owner_id: 520,
        is_deleted: true,
        deleted_at: '2025-08-01T08:30:00.000Z',
        owner: { user_id: 520, access_level: 0, team_id: 77, department_id: 9 },
      },
      {
        task_id: 912,
        title: 'Manager peer task',
        owner_id: 530,
        is_deleted: true,
        deleted_at: '2025-08-02T08:30:00.000Z',
        owner: { user_id: 530, access_level: 1, team_id: 77, department_id: 9 },
      },
      {
        task_id: 913,
        title: 'Different team task',
        owner_id: 540,
        is_deleted: true,
        deleted_at: '2025-08-03T08:30:00.000Z',
        owner: { user_id: 540, access_level: 0, team_id: 88, department_id: 9 },
      }
    );

    const response = await request(app)
      .get('/api/tasks/deleted')
      .query({ acting_user_id: '500' });

    expect(response.status).toBe(200);
    const ids = response.body.data.map((t) => t.task_id);
    expect(ids).toEqual([911]);
  });

  test('HR users see all deleted tasks and can filter by date range', async () => {
    global.supabaseMock.tables.users.push({
      user_id: 600,
      access_level: 3,
      team_id: null,
      department_id: null,
    });

    global.supabaseMock.tables.tasks.push(
      {
        task_id: 921,
        title: 'Old deleted task',
        owner_id: 601,
        is_deleted: true,
        deleted_at: '2025-01-01T00:00:00.000Z',
        owner: { user_id: 601, access_level: 0, team_id: 11, department_id: 11 },
      },
      {
        task_id: 922,
        title: 'Recent deleted task',
        owner_id: 602,
        is_deleted: true,
        deleted_at: '2025-10-20T10:00:00.000Z',
        owner: { user_id: 602, access_level: 1, team_id: 12, department_id: 12 },
      }
    );

    const response = await request(app)
      .get('/api/tasks/deleted')
      .query({
        acting_user_id: '600',
        start_date: '2025-10-01T00:00:00.000Z',
        end_date: '2025-10-31T23:59:59.000Z',
      });

    expect(response.status).toBe(200);
    const ids = response.body.data.map((t) => t.task_id);
    expect(ids).toEqual([922]);
  });

  test('validates acting user id parameter', async () => {
    const response = await request(app).get('/api/tasks/deleted');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'acting_user_id is required' });
  });
});

describe('GET /api/tasks/:id/activity', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  test('returns activity logs with enriched summaries', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 700, access_level: 2, full_name: 'Director Dee' },
      { user_id: 710, access_level: 1, full_name: 'Manager Max' },
      { user_id: 720, access_level: 0, full_name: 'Staff Sue' },
      { user_id: 730, access_level: 0, full_name: 'Member May' }
    );

    global.supabaseMock.tables.tasks.push({
      task_id: 1500,
      title: 'Client call',
      owner_id: 710,
      members_id: [730],
      is_deleted: false,
    });

    global.supabaseMock.tables.task_activity_logs.push(
      {
        log_id: 1,
        task_id: 1500,
        author_id: 700,
        type: 'reassigned',
        summary: '',
        metadata: { from_assignee: 720, to_assignee: 730 },
        created_at: '2025-10-01T10:00:00.000Z',
      },
      {
        log_id: 2,
        task_id: 1500,
        author_id: 700,
        type: 'field_edited',
        summary: '',
        metadata: { field: 'owner_id', from: 720, to: 710 },
        created_at: '2025-10-02T11:00:00.000Z',
      }
    );

    const response = await request(app)
      .get('/api/tasks/1500/activity')
      .query({ acting_user_id: '700', limit: '10', offset: '0' });

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    const summaries = response.body.data.map((item) => item.summary);
    expect(summaries[0]).toEqual(expect.stringContaining('Reassigned'));
    expect(summaries[0]).toEqual(expect.stringContaining('Staff Sue'));
    expect(summaries[0]).toEqual(expect.stringContaining('Member May'));
    expect(summaries[1]).toEqual(expect.stringContaining('Edited owner'));
    expect(response.body.page).toEqual({ limit: 10, offset: 0, total: 2 });
  });

  test('denies access when acting user lacks permission to view task', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 800, access_level: 1 },
      { user_id: 810, access_level: 1 }
    );
    global.supabaseMock.tables.tasks.push({
      task_id: 1600,
      title: 'Private task',
      owner_id: 810,
      members_id: [],
      is_deleted: false,
    });

    const response = await request(app)
      .get('/api/tasks/1600/activity')
      .query({ acting_user_id: '800' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Forbidden' });
  });

  test('validates task id and acting user id', async () => {
    const badId = await request(app)
      .get('/api/tasks/not-a-number/activity')
      .query({ acting_user_id: '700' });
    expect(badId.status).toBe(400);
    expect(badId.body).toEqual({ error: 'Invalid task id' });

    const missingUser = await request(app)
      .get('/api/tasks/1500/activity');
    expect(missingUser.status).toBe(400);
    expect(missingUser.body).toEqual({ error: 'acting_user_id is required' });
  });
});

describe('POST /api/tasks/:id/comments', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    if (!global.supabaseMock.tables.notifications) {
      global.supabaseMock.tables.notifications = [];
    }
    global.supabaseMock.tables.notifications.length = 0;
    recordTaskActivity.mockClear();
    notifyCommentMentioned.mockClear();
  });

  test('creates a comment activity and notifies mentioned users', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 900, access_level: 2, full_name: 'Author Alice' },
      { user_id: 901, access_level: 1, full_name: 'Owner Ollie' },
      { user_id: 902, access_level: 0, full_name: 'Mentioned Mike' },
      { user_id: 903, access_level: 0, full_name: 'Mentioned Mary' }
    );
    global.supabaseMock.tables.tasks.push({
      task_id: 2000,
      title: 'Launch plan',
      owner_id: 901,
      members_id: [903],
      is_deleted: false,
    });

    const response = await request(app)
      .post('/api/tasks/2000/comments')
      .send({
        acting_user_id: 900,
        comment: 'Great job @Mike @Mary!',
        mentions: [902, 903, 999], // 999 should be ignored
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(recordTaskActivity).toHaveBeenCalledWith(
      global.supabaseMock,
      expect.objectContaining({
        taskId: 2000,
        authorId: 900,
        type: ActivityTypes.COMMENT_ADDED,
        metadata: expect.objectContaining({
          mentions: expect.arrayContaining([902, 903]),
        }),
      })
    );
    expect(notifyCommentMentioned).toHaveBeenCalled();
    const notifyArgs = notifyCommentMentioned.mock.calls[0];
    expect(notifyArgs[2].sort()).toEqual([902, 903]);
    expect(notifyArgs[3]).toEqual(
      expect.objectContaining({
        user_id: 900,
        full_name: 'Author Alice',
      })
    );
  });

  test('rejects missing comment body', async () => {
    const response = await request(app)
      .post('/api/tasks/2000/comments')
      .send({ acting_user_id: 900, comment: '' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'comment is required' });
    expect(recordTaskActivity).not.toHaveBeenCalled();
  });

  test('rejects when acting user lacks permission', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 910, access_level: 1 },
      { user_id: 920, access_level: 1 }
    );
    global.supabaseMock.tables.tasks.push({
      task_id: 2100,
      title: 'Private doc',
      owner_id: 920,
      members_id: [],
      is_deleted: false,
    });

    const response = await request(app)
      .post('/api/tasks/2100/comments')
      .send({ acting_user_id: 910, comment: 'hello' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Forbidden' });
    expect(recordTaskActivity).not.toHaveBeenCalled();
  });

  test('validates task id and acting user id', async () => {
    const invalidId = await request(app)
      .post('/api/tasks/not-a-number/comments')
      .send({ acting_user_id: 900, comment: 'test' });
    expect(invalidId.status).toBe(400);
    expect(invalidId.body).toEqual({ error: 'Invalid task id' });

    const missingActor = await request(app)
      .post('/api/tasks/2000/comments')
      .send({ comment: 'test' });
    expect(missingActor.status).toBe(400);
    expect(missingActor.body).toEqual({ error: 'acting_user_id is required' });
  });
});

describe('PUT /api/tasks/:id/priority', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    recordTaskActivity.mockClear();
  });

  test('allows task owner to update priority and records activity', async () => {
    global.supabaseMock.tables.users.push({ user_id: 1000, access_level: 1 });
    global.supabaseMock.tables.tasks.push({
      task_id: 3000,
      title: 'Refine strategy',
      owner_id: 1000,
      priority_bucket: 5,
      is_deleted: false,
    });

    const response = await request(app)
      .put('/api/tasks/3000/priority')
      .send({ acting_user_id: 1000, priority_bucket: 2 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
        message: expect.stringContaining('priority updated to P2'),
        data: expect.objectContaining({ priority_bucket: 2 }),
      })
    );
    const task = global.supabaseMock.tables.tasks.find((t) => t.task_id === 3000);
    expect(task.priority_bucket).toBe(2);
    expect(recordTaskActivity).toHaveBeenCalledWith(
      global.supabaseMock,
      expect.objectContaining({
        taskId: 3000,
        authorId: 1000,
        type: ActivityTypes.FIELD_EDITED,
        metadata: { field: 'priority_bucket', from: 5, to: 2 },
      })
    );
  });

  test('rejects priority updates from non-owners', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 1001, access_level: 1 },
      { user_id: 1002, access_level: 1 }
    );
    global.supabaseMock.tables.tasks.push({
      task_id: 3001,
      title: 'Confidential task',
      owner_id: 1001,
      priority_bucket: 4,
      is_deleted: false,
    });

    const response = await request(app)
      .put('/api/tasks/3001/priority')
      .send({ acting_user_id: 1002, priority_bucket: 3 });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Only the task owner can change the priority' });
    const task = global.supabaseMock.tables.tasks.find((t) => t.task_id === 3001);
    expect(task.priority_bucket).toBe(4);
    expect(recordTaskActivity).not.toHaveBeenCalled();
  });

  test('validates priority bucket input', async () => {
    const response = await request(app)
      .put('/api/tasks/9999/priority')
      .send({ acting_user_id: 1, priority_bucket: 20 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'priority_bucket must be an integer between 1 and 10' });
  });
});

describe('POST /api/tasks/:id/delete', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    recordMultipleTaskActivities.mockClear();
  });

  test('soft deletes task and descendants for the owner', async () => {
    global.supabaseMock.tables.users.push({ user_id: 2000, access_level: 1 });
    global.supabaseMock.tables.tasks.push(
      {
        task_id: 4000,
        title: 'Parent task',
        owner_id: 2000,
        is_deleted: false,
      },
      {
        task_id: 4001,
        title: 'Child task',
        owner_id: 2000,
        parent_task_id: 4000,
        is_deleted: false,
      }
    );

    const response = await request(app)
      .post('/api/tasks/4000/delete')
      .send({ acting_user_id: 2000 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
        deleted_count: 2,
      })
    );
    const parent = global.supabaseMock.tables.tasks.find((t) => t.task_id === 4000);
    const child = global.supabaseMock.tables.tasks.find((t) => t.task_id === 4001);
    expect(parent.is_deleted).toBe(true);
    expect(child.is_deleted).toBe(true);
    expect(parent.deleted_by).toBe(2000);
    expect(child.deleted_by).toBe(2000);
    expect(recordMultipleTaskActivities).toHaveBeenCalledWith(
      global.supabaseMock,
      expect.arrayContaining([
        expect.objectContaining({ taskId: 4000, type: ActivityTypes.TASK_DELETED }),
        expect.objectContaining({ taskId: 4001, type: ActivityTypes.TASK_DELETED }),
      ])
    );
  });

  test('rejects delete when acting user is not owner', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 2100, access_level: 1 },
      { user_id: 2101, access_level: 1 }
    );
    global.supabaseMock.tables.tasks.push({
      task_id: 4010,
      title: 'Not your task',
      owner_id: 2100,
      is_deleted: false,
    });

    const response = await request(app)
      .post('/api/tasks/4010/delete')
      .send({ acting_user_id: 2101 });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Only the task owner can delete this task' });
    expect(recordMultipleTaskActivities).not.toHaveBeenCalled();
  });

  test('returns 400 when task already deleted', async () => {
    global.supabaseMock.tables.users.push({ user_id: 2200, access_level: 1 });
    global.supabaseMock.tables.tasks.push({
      task_id: 4020,
      title: 'Already deleted',
      owner_id: 2200,
      is_deleted: true,
    });

    const response = await request(app)
      .post('/api/tasks/4020/delete')
      .send({ acting_user_id: 2200 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Task is already deleted' });
  });
});

describe('POST /api/tasks/:id/restore', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    recordTaskActivity.mockClear();
  });

  test('restores deleted task for owner', async () => {
    global.supabaseMock.tables.users.push({ user_id: 2300, access_level: 1 });
    global.supabaseMock.tables.tasks.push({
      task_id: 4100,
      title: 'Restorable task',
      owner_id: 2300,
      is_deleted: true,
      deleted_by: 2300,
    });

    const response = await request(app)
      .post('/api/tasks/4100/restore')
      .send({ acting_user_id: 2300 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: 'Task "Restorable task" has been restored',
    });
    const task = global.supabaseMock.tables.tasks.find((t) => t.task_id === 4100);
    expect(task.is_deleted).toBe(false);
    expect(task.deleted_by).toBeNull();
    expect(recordTaskActivity).toHaveBeenCalledWith(
      global.supabaseMock,
      expect.objectContaining({
        taskId: 4100,
        authorId: 2300,
        type: ActivityTypes.TASK_RESTORED,
      })
    );
  });

  test('rejects restore attempt from unauthorized user', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 2310, access_level: 1 },
      { user_id: 2311, access_level: 1 }
    );
    global.supabaseMock.tables.tasks.push({
      task_id: 4110,
      title: 'Locked task',
      owner_id: 2310,
      is_deleted: true,
      deleted_by: 2310,
    });

    const response = await request(app)
      .post('/api/tasks/4110/restore')
      .send({ acting_user_id: 2311 });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Only the task owner or the user who deleted it can restore this task',
    });
    expect(recordTaskActivity).not.toHaveBeenCalled();
  });

  test('returns 400 when task is not deleted', async () => {
    global.supabaseMock.tables.users.push({ user_id: 2320, access_level: 1 });
    global.supabaseMock.tables.tasks.push({
      task_id: 4120,
      title: 'Active task',
      owner_id: 2320,
      is_deleted: false,
    });

    const response = await request(app)
      .post('/api/tasks/4120/restore')
      .send({ acting_user_id: 2320 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Task is not deleted' });
  });
});

describe('PATCH /api/tasks/:id (general edit)', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    recordTaskActivity.mockClear();
    recordMultipleTaskActivities.mockClear();
  });

  test('updates multiple fields for owner and records activities', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 2400, access_level: 1 },
      { user_id: 2401, access_level: 0 }
    );
    global.supabaseMock.tables.tasks.push({
      task_id: 4200,
      title: 'Original title',
      description: 'Old description',
      project: 'Legacy',
      owner_id: 2400,
      members_id: [],
      assignee_id: null,
      status: 'UNASSIGNED',
      priority_bucket: 5,
      is_deleted: false,
    });

    const response = await request(app)
      .patch('/api/tasks/4200')
      .query({ acting_user_id: '2400' })
      .send({
        title: 'Updated title',
        description: 'New description',
        priority_bucket: 3,
        assignee_id: 2401,
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        task_id: 4200,
        title: 'Updated title',
        description: 'New description',
        priority_bucket: 3,
        assignee_id: 2401,
        status: 'ONGOING', // auto-updated because assignee added
      })
    );
    const payload = recordMultipleTaskActivities.mock.calls.flatMap(([, activities]) => activities);
    expect(payload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId: 4200,
          type: ActivityTypes.FIELD_EDITED,
          metadata: expect.objectContaining({ field: 'title', from: 'Original title', to: 'Updated title' }),
        }),
        expect.objectContaining({
          metadata: expect.objectContaining({ field: 'description', from: 'Old description', to: 'New description' }),
        }),
        expect.objectContaining({
          metadata: expect.objectContaining({ field: 'priority_bucket', from: 5, to: 3 }),
        }),
        expect.objectContaining({
          type: ActivityTypes.STATUS_CHANGED,
          metadata: { from_status: 'UNASSIGNED', to_status: 'ONGOING' },
        }),
        expect.objectContaining({
          type: ActivityTypes.REASSIGNED,
          metadata: { from_assignee: null, to_assignee: 2401 },
        }),
      ])
    );
  });

  test('returns 400 when no editable fields provided', async () => {
    const response = await request(app)
      .patch('/api/tasks/1')
      .query({ acting_user_id: '1' })
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'No editable fields provided' });
  });

  test('rejects priority change from non-owner', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 2500, access_level: 1 },
      { user_id: 2501, access_level: 1 }
    );
    global.supabaseMock.tables.tasks.push({
      task_id: 4300,
      title: 'Team task',
      owner_id: 2500,
      members_id: [2501],
      status: 'ONGOING',
      priority_bucket: 4,
      is_deleted: false,
    });

    const response = await request(app)
      .patch('/api/tasks/4300')
      .query({ acting_user_id: '2501' }) // member but not owner
      .send({ priority_bucket: 2 });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Only the task owner can change the priority' });
  });

  test('returns 403 when acting user lacks edit access', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 2600, access_level: 1 },
      { user_id: 2601, access_level: 1 }
    );
    global.supabaseMock.tables.tasks.push({
      task_id: 4400,
      title: 'Private task',
      owner_id: 2600,
      members_id: [],
      status: 'UNASSIGNED',
      is_deleted: false,
    });

    const response = await request(app)
      .patch('/api/tasks/4400')
      .query({ acting_user_id: '2601' })
      .send({ title: 'Updated' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Forbidden' });
  });

  test('enforces assignee/status rule', async () => {
    global.supabaseMock.tables.users.push({ user_id: 2700, access_level: 1 });
    global.supabaseMock.tables.tasks.push({
      task_id: 4500,
      title: 'Rule task',
      owner_id: 2700,
      status: 'UNASSIGNED',
      assignee_id: null,
      is_deleted: false,
    });

    const response = await request(app)
      .patch('/api/tasks/4500')
      .query({ acting_user_id: '2700' })
      .send({ status: 'COMPLETED' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Assign someone before changing status' });
  });
});

describe('Task attachments routes', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    global.supabaseMock.tables.task_attachments.length = 0;
  });

  test('allows owner to upload attachment', async () => {
    global.supabaseMock.tables.users.push({ user_id: 5000, access_level: 1 });
    global.supabaseMock.tables.tasks.push({
      task_id: 5000,
      title: 'Attachment task',
      owner_id: 5000,
      members_id: [],
      is_deleted: false,
    });

    const response = await request(app)
      .post('/api/tasks/5000/attachments')
      .field('acting_user_id', '5000')
      .attach('file', Buffer.from('hello world'), 'notes.txt');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(global.supabaseMock.tables.task_attachments).toHaveLength(1);
    const attachment = global.supabaseMock.tables.task_attachments[0];
    const signed = global.supabaseMock.storage
      .from('task-attachments')
      .createSignedUrl(attachment.file_path, 60);
    expect(signed.error).toBeNull();
    expect(signed.data.signedUrl).toContain('task_');
  });

  test('rejects upload when file missing', async () => {
    global.supabaseMock.tables.users.push({ user_id: 5050, access_level: 1 });
    global.supabaseMock.tables.tasks.push({
      task_id: 5050,
      title: 'No file task',
      owner_id: 5050,
      members_id: [],
      is_deleted: false,
    });

    const res = await request(app)
      .post('/api/tasks/5050/attachments')
      .field('acting_user_id', '5050');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'No file provided' });
  });

  test('rejects upload without access', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 5100, access_level: 1 },
      { user_id: 5101, access_level: 1 }
    );
    global.supabaseMock.tables.tasks.push({
      task_id: 5100,
      title: 'Private task',
      owner_id: 5100,
      members_id: [],
      is_deleted: false,
    });

    const res = await request(app)
      .post('/api/tasks/5100/attachments')
      .field('acting_user_id', '5101')
      .attach('file', Buffer.from('content'), 'doc.txt');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'No access to this task' });
    expect(global.supabaseMock.tables.task_attachments).toHaveLength(0);
  });

  test('lists task attachments for authorized user', async () => {
    global.supabaseMock.tables.users.push({ user_id: 5200, access_level: 1, full_name: 'Owner' });
    global.supabaseMock.tables.tasks.push({
      task_id: 5200,
      title: 'List task',
      owner_id: 5200,
      members_id: [],
      is_deleted: false,
    });
    global.supabaseMock.tables.task_attachments.push({
      attachment_id: 1,
      task_id: 5200,
      file_name: 'file.txt',
      original_name: 'file.txt',
      file_path: 'task_5200/file.txt',
      file_size: 4,
      mime_type: 'text/plain',
      uploaded_by: 5200,
      uploader: { full_name: 'Owner', email: 'owner@example.com' },
    });

    const res = await request(app)
      .get('/api/tasks/5200/attachments')
      .query({ acting_user_id: '5200' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toEqual(
      expect.objectContaining({ original_name: 'file.txt', uploaded_by: 5200 })
    );
  });

  test('denies attachment listing for unauthorized user', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 5300, access_level: 1 },
      { user_id: 5301, access_level: 1 }
    );
    global.supabaseMock.tables.tasks.push({
      task_id: 5300,
      title: 'Private list task',
      owner_id: 5300,
      members_id: [],
      is_deleted: false,
    });

    const res = await request(app)
      .get('/api/tasks/5300/attachments')
      .query({ acting_user_id: '5301' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'No access to this task' });
  });

  test('returns signed download url for attachment', async () => {
    global.supabaseMock.tables.users.push({ user_id: 5400, access_level: 1 });
    global.supabaseMock.tables.tasks.push({
      task_id: 5400,
      title: 'Download task',
      owner_id: 5400,
      members_id: [],
      is_deleted: false,
    });
    global.supabaseMock.tables.task_attachments.push({
      attachment_id: 20,
      task_id: 5400,
      file_path: 'task_5400/file.bin',
      original_name: 'file.bin',
      file_size: 12,
      mime_type: 'application/octet-stream',
      uploaded_by: 5400,
    });
    global.supabaseMock.storage
      .from('task-attachments')
      .upload('task_5400/file.bin', Buffer.from('binary'), { contentType: 'application/octet-stream' });

    const res = await request(app)
      .get('/api/tasks/5400/attachments/20/download')
      .query({ acting_user_id: '5400' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.download_url).toContain('task-attachments');
  });

  test('allows uploader to delete attachment', async () => {
    global.supabaseMock.tables.users.push({ user_id: 5500, access_level: 1 });
    global.supabaseMock.tables.tasks.push({
      task_id: 5500,
      title: 'Delete task',
      owner_id: 5500,
      members_id: [],
      is_deleted: false,
    });
    global.supabaseMock.tables.task_attachments.push({
      attachment_id: 30,
      task_id: 5500,
      file_path: 'task_5500/doc.pdf',
      original_name: 'doc.pdf',
      file_size: 100,
      mime_type: 'application/pdf',
      uploaded_by: 5500,
    });
    global.supabaseMock.storage
      .from('task-attachments')
      .upload('task_5500/doc.pdf', Buffer.from('pdf'), { contentType: 'application/pdf' });

    const res = await request(app)
      .delete('/api/tasks/5500/attachments/30')
      .send({ acting_user_id: 5500 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Attachment deleted successfully' });
    expect(global.supabaseMock.tables.task_attachments).toHaveLength(0);
    const signed = global.supabaseMock.storage
      .from('task-attachments')
      .createSignedUrl('task_5500/doc.pdf', 60);
    expect(signed.error).not.toBeNull();
  });

  test('denies deleting attachment uploaded by someone else', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 5600, access_level: 1 },
      { user_id: 5601, access_level: 1 }
    );
    global.supabaseMock.tables.tasks.push({
      task_id: 5600,
      title: 'Protected task',
      owner_id: 5600,
      members_id: [5601],
      is_deleted: false,
    });
    global.supabaseMock.tables.task_attachments.push({
      attachment_id: 40,
      task_id: 5600,
      file_path: 'task_5600/protected.txt',
      original_name: 'protected.txt',
      file_size: 50,
      mime_type: 'text/plain',
      uploaded_by: 5600,
    });

    const res = await request(app)
      .delete('/api/tasks/5600/attachments/40')
      .send({ acting_user_id: 5601 });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Can only delete your own attachments' });
    expect(global.supabaseMock.tables.task_attachments).toHaveLength(1);
  });
});

describe('GET /api/tasks/recurring', () => {
  const getRecurringHandler = () => {
    const router = require('../../../backend/src/routes');
    const layer = router.stack.find(
      (entry) => entry.route && entry.route.path === '/tasks/recurring' && entry.route.methods.get
    );
    if (!layer) {
      throw new Error('Recurring tasks route not found');
    }
    return layer.route.stack[0].handle;
  };

  const createResponse = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  test('requires acting_user_id', async () => {
    const handler = getRecurringHandler();
    const res = createResponse();

    await handler({ query: {} }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'acting_user_id is required' });
  });

  test('groups recurring task instances for the acting user', async () => {
    const handler = getRecurringHandler();
    const res = createResponse();

    global.supabaseMock.tables.tasks.push(
      {
        task_id: 7000,
        title: 'Weekly report',
        description: 'Prepare weekly summary',
        owner_id: 200,
        is_recurring: true,
        is_deleted: false,
        recurrence_type: 'weekly',
        recurrence_interval: 1,
        next_due_date: '2025-11-10',
        members_id: [],
      },
      {
        task_id: 7001,
        title: 'Weekly report - next',
        description: 'Next instance',
        owner_id: 200,
        is_recurring: true,
        is_deleted: false,
        parent_recurring_task_id: 7000,
        recurrence_type: 'weekly',
        recurrence_interval: 1,
        next_due_date: '2025-11-17',
        members_id: [],
      },
      {
        task_id: 7002,
        title: 'Other recurring',
        owner_id: 999,
        is_recurring: true,
        is_deleted: false,
        recurrence_type: 'monthly',
        members_id: [],
      }
    );

    await handler(
      { query: { acting_user_id: '200' } },
      res,
      jest.fn()
    );

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [
        {
          original_task: expect.objectContaining({ task_id: 7000 }),
          instances: [expect.objectContaining({ task_id: 7001 })],
        },
      ],
    });
  });

  test('returns 500 when recurring task query fails', async () => {
    const handler = getRecurringHandler();
    const res = createResponse();

    global.supabaseMock.__setNextResult({
      table: 'tasks',
      operation: 'select',
      error: { message: 'Recurring lookup failed' },
    });

    await handler(
      { query: { acting_user_id: '201' } },
      res,
      jest.fn()
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Recurring lookup failed' });
  });
});

describe('POST /api/tasks/:id/stop-recurrence', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  test('stops recurrence for the task owner', async () => {
    global.supabaseMock.tables.tasks.push({
      task_id: 7100,
      title: 'Recurring task',
      owner_id: 300,
      is_recurring: true,
      is_deleted: false,
    });

    const response = await request(app)
      .post('/api/tasks/7100/stop-recurrence')
      .send({ acting_user_id: 300 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: 'Recurrence stopped for this task',
    });
    const task = global.supabaseMock.tables.tasks.find((t) => t.task_id === 7100);
    expect(task.is_recurring).toBe(false);
    expect(recordTaskActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        taskId: 7100,
        authorId: 300,
        type: ActivityTypes.FIELD_EDITED,
      })
    );
  });

  test('denies recurrence stop for non-owner', async () => {
    global.supabaseMock.tables.tasks.push({
      task_id: 7101,
      title: 'Foreign recurring',
      owner_id: 301,
      is_recurring: true,
      is_deleted: false,
    });

    const response = await request(app)
      .post('/api/tasks/7101/stop-recurrence')
      .send({ acting_user_id: 302 });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Only the task owner can stop recurrence' });
  });

  test('rejects stop when task is not recurring', async () => {
    global.supabaseMock.tables.tasks.push({
      task_id: 7102,
      title: 'One-off task',
      owner_id: 303,
      is_recurring: false,
      is_deleted: false,
    });

    const response = await request(app)
      .post('/api/tasks/7102/stop-recurrence')
      .send({ acting_user_id: 303 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Task is not recurring' });
  });

  test('propagates update failures from supabase', async () => {
    global.supabaseMock.tables.tasks.push({
      task_id: 7103,
      title: 'Unstable recurring task',
      owner_id: 304,
      is_recurring: true,
      is_deleted: false,
    });
    global.supabaseMock.__setNextResult({
      table: 'tasks',
      operation: 'update',
      error: { message: 'Update failed' },
    });

    const response = await request(app)
      .post('/api/tasks/7103/stop-recurrence')
      .send({ acting_user_id: 304 });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Update failed' });
    const task = global.supabaseMock.tables.tasks.find((t) => t.task_id === 7103);
    expect(task.is_recurring).toBe(true);
  });
});
