const request = require('supertest');
const { createTestApp } = require('../utils/createTestApp');

describe('GET /api/projects', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  it('requires acting_user_id', async () => {
    const response = await request(app).get('/api/projects');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'acting_user_id is required' });
  });

  it('returns only personal projects for staff', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 1, access_level: 0, team_id: 1, department_id: 1 }
    );
    global.supabaseMock.tables.projects.push(
      {
        project_id: 1,
        title: 'Owned Project',
        owner_id: 1,
        owner: { user_id: 1, access_level: 0, team_id: 1, department_id: 1 },
      },
      {
        project_id: 2,
        title: 'Other Project',
        owner_id: 2,
        owner: { user_id: 2, access_level: 0, team_id: 2, department_id: 2 },
      }
    );

    const response = await request(app)
      .get('/api/projects')
      .query({ acting_user_id: '1' });

    expect(response.status).toBe(200);
    expect(response.body.data.map((p) => p.project_id)).toEqual([1]);
  });

  it('returns team projects for managers', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 5, access_level: 1, team_id: 10, department_id: 1 },
      { user_id: 6, access_level: 0, team_id: 10, department_id: 1 },
      { user_id: 7, access_level: 1, team_id: 20, department_id: 1 }
    );

    global.supabaseMock.tables.projects.push(
      {
        project_id: 10,
        title: 'Manager Owned',
        owner_id: 5,
        owner: { user_id: 5, access_level: 1, team_id: 10, department_id: 1 },
      },
      {
        project_id: 11,
        title: 'Team Staff Project',
        owner_id: 6,
        owner: { user_id: 6, access_level: 0, team_id: 10, department_id: 1 },
      },
      {
        project_id: 12,
        title: 'Other Team Project',
        owner_id: 7,
        owner: { user_id: 7, access_level: 1, team_id: 20, department_id: 1 },
      }
    );

    const response = await request(app)
      .get('/api/projects')
      .query({ acting_user_id: '5' });

    expect(response.status).toBe(200);
    expect(response.body.data.map((p) => p.project_id)).toEqual([10, 11]);
  });

  it('filters projects based on director hierarchy rules', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 10, access_level: 2, team_id: 1, department_id: 1 },
      { user_id: 20, access_level: 1, team_id: 1, department_id: 1 },
      { user_id: 30, access_level: 1, team_id: 2, department_id: 2 }
    );

    global.supabaseMock.tables.projects.push(
      {
        project_id: 1,
        title: 'Acting User Project',
        owner_id: 10,
        owner: { user_id: 10, access_level: 2, team_id: 1, department_id: 1 },
      },
      {
        project_id: 2,
        title: 'Same Department Subordinate',
        owner_id: 20,
        owner: { user_id: 20, access_level: 1, team_id: 1, department_id: 1 },
      },
      {
        project_id: 3,
        title: 'Different Department',
        owner_id: 30,
        owner: { user_id: 30, access_level: 1, team_id: 2, department_id: 2 },
      }
    );

    const response = await request(app)
      .get('/api/projects')
      .query({ acting_user_id: '10' });

    expect(response.status).toBe(200);
    expect(response.body.data.map((p) => p.project_id)).toEqual([1, 2]);
  });

  it('returns 500 when acting user lookup errors', async () => {
    const originalFrom = global.supabaseMock.from;
    try {
      global.supabaseMock.from = jest.fn((tableName) => {
        if (tableName === 'users') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: null, error: { message: 'DB down' } }),
              }),
            }),
          };
        }
        return originalFrom(tableName);
      });

      const response = await request(app)
        .get('/api/projects')
        .query({ acting_user_id: '99' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'DB down' });
    } finally {
      global.supabaseMock.from = originalFrom;
    }
  });

  it('HR users see all projects', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 40, access_level: 3, team_id: null, department_id: null }
    );

    global.supabaseMock.tables.projects.push(
      { project_id: 101, owner_id: 1, owner: { user_id: 1, access_level: 0, team_id: 1, department_id: 1 } },
      { project_id: 102, owner_id: 2, owner: { user_id: 2, access_level: 1, team_id: 2, department_id: 2 } }
    );

    const response = await request(app)
      .get('/api/projects')
      .query({ acting_user_id: '40' });

    expect(response.status).toBe(200);
    expect(response.body.data.map((p) => p.project_id).sort()).toEqual([101, 102]);
  });

  it('returns 500 when project listing fails to load', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 2000, access_level: 3, team_id: null, department_id: null }
    );
    global.supabaseMock.__setNextResult({
      table: 'projects',
      operation: 'select',
      error: { message: 'Projects down' },
    });

    const response = await request(app)
      .get('/api/projects')
      .query({ acting_user_id: '2000' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Projects down' });
  });

  it('returns 500 when the projects handler throws unexpectedly', async () => {
    const originalFrom = global.supabaseMock.from;

    try {
      global.supabaseMock.from = jest.fn(() => {
        throw new Error('boom');
      });

      const response = await request(app)
        .get('/api/projects')
        .query({ acting_user_id: '1' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    } finally {
      global.supabaseMock.from = originalFrom;
    }
  });
});

describe('POST /api/projects', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  it('creates project when acting user owns it', async () => {
    global.supabaseMock.tables.users.push({ user_id: 200, access_level: 1 });

    const response = await request(app)
      .post('/api/projects')
      .send({
        name: 'New Initiative',
        description: 'Launch plan',
        owner_id: 200,
        acting_user_id: 200,
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        name: 'New Initiative',
        owner_id: 200,
        members: [200],
      })
    );
  });

  it('rejects when acting user lacks permission for owner', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 201, access_level: 1 }, // owner (higher)
      { user_id: 202, access_level: 0 }  // acting (lower)
    );

    const response = await request(app)
      .post('/api/projects')
      .send({
        name: 'Unauthorized',
        owner_id: 201,
        acting_user_id: 202,
      });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Insufficient permissions to create project for this owner' });
  });

  it('validates required fields', async () => {
    const response = await request(app)
      .post('/api/projects')
      .send({ name: '', owner_id: 1 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Missing required fields: name, owner_id, and acting_user_id are required',
    });
  });

  it('returns 500 when project creation fails', async () => {
    global.supabaseMock.tables.users.push({ user_id: 210, access_level: 2 });

    global.supabaseMock.__setNextResult({
      table: 'projects',
      operation: 'insert',
      error: { message: 'Insert failed' },
    });

    const response = await request(app)
      .post('/api/projects')
      .send({
        name: 'Failsafe Project',
        description: 'should not persist',
        owner_id: 210,
        acting_user_id: 210,
      });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Insert failed' });
  });

  it('returns 500 when the create handler throws unexpectedly', async () => {
    const originalFrom = global.supabaseMock.from;
    try {
      global.supabaseMock.from = jest.fn(() => {
        throw new Error('Unexpected create error');
      });

      const response = await request(app)
        .post('/api/projects')
        .send({
          name: 'Breaker',
          description: 'none',
          owner_id: 220,
          acting_user_id: 220,
        });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    } finally {
      global.supabaseMock.from = originalFrom;
    }
  });
});

describe('GET /api/projects/:id', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  it('returns project details with tasks for authorized director', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 50, access_level: 2 },
      { user_id: 51, access_level: 1 }
    );

    global.supabaseMock.tables.projects.push({
      project_id: 200,
      name: 'Critical Project',
      owner_id: 51,
      tasks: [],
    });

    global.supabaseMock.tables.tasks.push(
      {
        task_id: 9000,
        title: 'Project Task',
        status: 'ONGOING',
        priority_bucket: 4,
        owner_id: 51,
        project_id: 200,
        is_deleted: false,
      }
    );

    const response = await request(app)
      .get('/api/projects/200')
      .query({ acting_user_id: '50' });

    expect(response.status).toBe(200);
    expect(response.body.data.project_id).toBe(200);
    expect(response.body.data.related_tasks).toHaveLength(1);
  });

  it('returns 403 when acting user lacks access', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 60, access_level: 1 },
      { user_id: 61, access_level: 1 }
    );
    global.supabaseMock.tables.projects.push({
      project_id: 300,
      owner_id: 61,
      tasks: [],
    });

    const response = await request(app)
      .get('/api/projects/300')
      .query({ acting_user_id: '60' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Forbidden: insufficient permissions to view this project' });
  });

  it('returns 500 when project lookup fails', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 610, access_level: 2 }
    );
    global.supabaseMock.__setNextResult({
      table: 'projects',
      operation: 'select',
      error: { message: 'Project query failed' },
    });

    const response = await request(app)
      .get('/api/projects/999')
      .query({ acting_user_id: '610' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Project query failed' });
  });

  it('returns 500 when project owner lookup fails', async () => {
    const project = {
      project_id: 620,
      owner_id: 621,
      name: 'Owner check',
      tasks: [],
    };
    global.supabaseMock.tables.projects.push(project);

    const originalFrom = global.supabaseMock.from;
    try {
      global.supabaseMock.from = jest.fn((tableName) => {
        if (tableName === 'users') {
          return {
            select: () => ({
              eq: (column, value) => {
                if (value === 6000) {
                  return {
                    single: async () => ({ data: { user_id: 6000, access_level: 2 }, error: null }),
                  };
                }
                if (value === project.owner_id) {
                  return {
                    single: async () => ({ data: null, error: { message: 'Owner lookup failed' } }),
                  };
                }
                return {
                  single: async () => ({ data: null, error: { message: 'User not found' } }),
                };
              },
            }),
          };
        }
        return originalFrom(tableName);
      });

      const response = await request(app)
        .get('/api/projects/620')
        .query({ acting_user_id: '6000' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Owner lookup failed' });
    } finally {
      global.supabaseMock.from = originalFrom;
    }
  });

  it('still returns the project when related tasks fail to load', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 630, access_level: 3 }
    );
    global.supabaseMock.tables.projects.push({
      project_id: 631,
      owner_id: 640,
      name: 'Resilient',
    });
    global.supabaseMock.tables.users.push(
      { user_id: 640, access_level: 1 }
    );

    global.supabaseMock.__setNextResult({
      table: 'tasks',
      operation: 'select',
      error: { message: 'Tasks unavailable' },
    });

    const response = await request(app)
      .get('/api/projects/631')
      .query({ acting_user_id: '630' });

    expect(response.status).toBe(200);
    expect(response.body.data.project_id).toBe(631);
    expect(response.body.data.related_tasks).toEqual([]);
  });
});

describe('PATCH /api/projects/:id', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  it('updates project when owner submits change', async () => {
    global.supabaseMock.tables.projects.push({
      project_id: 700,
      name: 'Working title',
      description: 'Original',
      end_date: null,
      owner_id: 300,
    });
    global.supabaseMock.tables.users.push({ user_id: 300, access_level: 1 });

    const response = await request(app)
      .patch('/api/projects/700')
      .send({
        name: 'Updated title',
        description: 'New description',
        acting_user_id: 300,
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        project_id: 700,
        name: 'Updated title',
        description: 'New description',
      })
    );
  });

  it('rejects updates from non-owner', async () => {
    global.supabaseMock.tables.projects.push({
      project_id: 701,
      name: 'Protected',
      owner_id: 301,
    });
    global.supabaseMock.tables.users.push(
      { user_id: 301, access_level: 1 },
      { user_id: 302, access_level: 2 }
    );

    const response = await request(app)
      .patch('/api/projects/701')
      .send({ name: 'Hack attempt', acting_user_id: 302 });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Only the project owner can update this project' });
  });

  it('returns 404 for missing project', async () => {
    global.supabaseMock.tables.users.push({ user_id: 303, access_level: 1 });

    const originalFrom = global.supabaseMock.from;
    global.supabaseMock.from = (tableName) => {
      if (tableName === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: null, error: null }),
            }),
          }),
        };
      }
      return originalFrom(tableName);
    };

    const response = await request(app)
      .patch('/api/projects/999')
      .send({ name: 'Ghost', acting_user_id: 303 });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Project not found' });

    global.supabaseMock.from = originalFrom;
  });

  it('leaves project unchanged when no fields are provided', async () => {
    global.supabaseMock.tables.projects.push({
      project_id: 750,
      name: 'Static',
      description: 'Original copy',
      owner_id: 310,
    });

    const response = await request(app)
      .patch('/api/projects/750')
      .send({ acting_user_id: 310 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: expect.objectContaining({
        project_id: 750,
        name: 'Static',
        description: 'Original copy',
      }),
    });
  });

  it('returns 500 when project update fails', async () => {
    global.supabaseMock.tables.projects.push({
      project_id: 751,
      name: 'Update me',
      owner_id: 311,
    });

    global.supabaseMock.__setNextResult({
      table: 'projects',
      operation: 'update',
      error: { message: 'Update failed' },
    });

    const response = await request(app)
      .patch('/api/projects/751')
      .send({ acting_user_id: 311, name: 'New name' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Update failed' });
  });
});

describe('POST /api/projects/:id/add-task', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  it('adds task to project when acting user is owner', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 70, access_level: 1 },
      { user_id: 71, access_level: 0 }
    );
    global.supabaseMock.tables.projects.push({
      project_id: 400,
      name: 'Expansion',
      owner_id: 70,
      tasks: [],
      members: [],
    });
    global.supabaseMock.tables.tasks.push({
      task_id: 9100,
      title: 'Unlinked Task',
      owner_id: 71,
      assignee_id: null,
      project_id: null,
      members_id: [71],
      is_deleted: false,
    });

    const response = await request(app)
      .post('/api/projects/400/add-task')
      .send({ task_id: 9100, acting_user_id: 70 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
        message: expect.stringContaining('Task "Unlinked Task" added to project'),
      })
    );
    const task = global.supabaseMock.tables.tasks.find((t) => t.task_id === 9100);
    expect(task.project_id).toBe(400);
    const project = global.supabaseMock.tables.projects.find((p) => p.project_id === 400);
    expect(project.tasks).toContain(9100);
    expect(project.members).toEqual(expect.arrayContaining([70, 71]));
  });

  it('rejects add task when acting user lacks permission', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 80, access_level: 0 },
      { user_id: 81, access_level: 1 }
    );
    global.supabaseMock.tables.projects.push({
      project_id: 401,
      owner_id: 81,
      tasks: [],
      members: [],
    });
    global.supabaseMock.tables.tasks.push({
      task_id: 9200,
      title: 'Restricted task',
      owner_id: 81,
      project_id: null,
      members_id: [],
      is_deleted: false,
    });

    const response = await request(app)
      .post('/api/projects/401/add-task')
      .send({ task_id: 9200, acting_user_id: 80 });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Forbidden: insufficient permissions to add tasks to this project' });
  });

  it('returns 404 when task is missing', async () => {
    global.supabaseMock.tables.users.push({ user_id: 82, access_level: 1 });
    global.supabaseMock.tables.projects.push({
      project_id: 402,
      owner_id: 82,
      tasks: [],
      members: [],
      name: 'Empty',
    });

    global.supabaseMock.__setNextResult({
      table: 'tasks',
      operation: 'select',
      data: null,
      error: null,
    });

    const response = await request(app)
      .post('/api/projects/402/add-task')
      .send({ task_id: 9999, acting_user_id: 82 });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Task not found' });
  });

  it('returns 500 when task cannot be linked to project', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 83, access_level: 1 },
      { user_id: 84, access_level: 3 }
    );
    global.supabaseMock.tables.projects.push({
      project_id: 403,
      owner_id: 84,
      name: 'Failing Link',
      tasks: [],
      members: [],
    });
    global.supabaseMock.tables.tasks.push({
      task_id: 9220,
      title: 'Problematic task',
      owner_id: 83,
      project_id: null,
      members_id: [],
      is_deleted: false,
    });

    global.supabaseMock.__setNextResult({
      table: 'tasks',
      operation: 'update',
      error: { message: 'Task update failed' },
    });

    const response = await request(app)
      .post('/api/projects/403/add-task')
      .send({ task_id: 9220, acting_user_id: 84 });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Task update failed' });
  });

  it('still succeeds when project task list update fails', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 85, access_level: 2 },
      { user_id: 86, access_level: 1 }
    );
    global.supabaseMock.tables.projects.push({
      project_id: 404,
      owner_id: 85,
      name: 'Members sync',
      tasks: [],
      members: [85],
    });
    global.supabaseMock.tables.tasks.push({
      task_id: 9230,
      title: 'Link attempt',
      owner_id: 86,
      project_id: null,
      members_id: [86],
      is_deleted: false,
    });

    global.supabaseMock.__setNextResult({
      table: 'projects',
      operation: 'update',
      error: { message: 'Project tasks array update failed' },
    });

    const response = await request(app)
      .post('/api/projects/404/add-task')
      .send({ task_id: 9230, acting_user_id: 85 });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toContain('Task "Link attempt" added to project "Members sync"');
  });
});

describe('POST /api/projects/:id/remove-task', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  it('removes task from project for authorized manager', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 90, access_level: 2 },
      { user_id: 91, access_level: 1 }
    );
    global.supabaseMock.tables.projects.push({
      project_id: 500,
      owner_id: 90,
      tasks: [9300],
      members: [90, 91],
    });
    global.supabaseMock.tables.tasks.push({
      task_id: 9300,
      title: 'Project Task',
      owner_id: 91,
      project_id: 500,
      members_id: [91],
      is_deleted: false,
    });

    const response = await request(app)
      .post('/api/projects/500/remove-task')
      .send({ task_id: 9300, acting_user_id: 90 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
        message: expect.stringContaining('Task "Project Task" removed from project'),
      })
    );
    const project = global.supabaseMock.tables.projects.find((p) => p.project_id === 500);
    expect(project.tasks).not.toContain(9300);
    const task = global.supabaseMock.tables.tasks.find((t) => t.task_id === 9300);
    expect(task.project_id).toBeNull();
  });

  it('rejects removal when acting user cannot modify task', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 100, access_level: 0 },
      { user_id: 101, access_level: 1 }
    );
    global.supabaseMock.tables.projects.push({
      project_id: 501,
      owner_id: 101,
      tasks: [9400],
      members: [101],
    });
    global.supabaseMock.tables.tasks.push({
      task_id: 9400,
      title: 'Protected Task',
      owner_id: 101,
      project_id: 501,
      members_id: [],
      is_deleted: false,
    });

    const response = await request(app)
      .post('/api/projects/501/remove-task')
      .send({ task_id: 9400, acting_user_id: 100 });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Forbidden: insufficient permissions to modify this task' });
  });

  it('returns 404 when task is not part of project', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 102, access_level: 2 },
      { user_id: 103, access_level: 1 }
    );
    global.supabaseMock.tables.projects.push({
      project_id: 502,
      owner_id: 102,
      tasks: [],
      members: [102],
    });
    global.supabaseMock.tables.tasks.push({
      task_id: 9410,
      title: 'Outside',
      owner_id: 103,
      project_id: null,
      is_deleted: false,
    });

    global.supabaseMock.__setNextResult({
      table: 'tasks',
      operation: 'select',
      data: null,
      error: null,
    });

    const response = await request(app)
      .post('/api/projects/502/remove-task')
      .send({ task_id: 9410, acting_user_id: 102 });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Task not found in this project' });
  });

  it('returns 500 when task removal update fails', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 104, access_level: 3 },
      { user_id: 105, access_level: 1 }
    );
    global.supabaseMock.tables.projects.push({
      project_id: 503,
      owner_id: 104,
      tasks: [9420],
      members: [104, 105],
    });
    global.supabaseMock.tables.tasks.push({
      task_id: 9420,
      title: 'Sticky task',
      owner_id: 105,
      project_id: 503,
      members_id: [105],
      is_deleted: false,
    });

    global.supabaseMock.__setNextResult({
      table: 'tasks',
      operation: 'update',
      error: { message: 'Task unlink failed' },
    });

    const response = await request(app)
      .post('/api/projects/503/remove-task')
      .send({ task_id: 9420, acting_user_id: 104 });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Task unlink failed' });
  });

  it('still succeeds when project task list cleanup fails', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 106, access_level: 3 },
      { user_id: 107, access_level: 1 }
    );
    global.supabaseMock.tables.projects.push({
      project_id: 504,
      owner_id: 106,
      tasks: [9430],
      members: [106, 107],
    });
    global.supabaseMock.tables.tasks.push({
      task_id: 9430,
      title: 'Cleanup task',
      owner_id: 107,
      project_id: 504,
      members_id: [107],
      is_deleted: false,
    });

    global.supabaseMock.__setNextResult({
      table: 'projects',
      operation: 'update',
      error: { message: 'Project tasks cleanup failed' },
    });

    const response = await request(app)
      .post('/api/projects/504/remove-task')
      .send({ task_id: 9430, acting_user_id: 106 });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toContain('Task "Cleanup task" removed from project');
  });
});

describe('Project members endpoints', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  it('allows project owner to add member', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 110, access_level: 1, full_name: 'Owner O' },
      { user_id: 111, access_level: 1, full_name: 'Member M' }
    );
    global.supabaseMock.tables.projects.push({
      project_id: 600,
      owner_id: 110,
      members: [110],
    });

    const response = await request(app)
      .post('/api/projects/600/members')
      .send({ user_id: 111, acting_user_id: 110 });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toContain('Member M added to project');
    expect(response.body.data.members).toEqual([110, 111]);
  });

  it('rejects member addition by non-owner', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 120, access_level: 1 },
      { user_id: 121, access_level: 1 }
    );
    global.supabaseMock.tables.projects.push({
      project_id: 601,
      owner_id: 120,
      members: [120],
    });

    const response = await request(app)
      .post('/api/projects/601/members')
      .send({ user_id: 121, acting_user_id: 121 });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Only project owner can manually add members' });
  });

  it('returns 404 when the member does not exist', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 125, access_level: 1, full_name: 'Owner' }
    );
    global.supabaseMock.tables.projects.push({
      project_id: 610,
      owner_id: 125,
      members: [125],
    });

    const response = await request(app)
      .post('/api/projects/610/members')
      .send({ user_id: 9999, acting_user_id: 125 });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'User not found' });
  });

  it('returns 500 when project lookup fails during member add', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 126, access_level: 1, full_name: 'Owner 500' },
      { user_id: 127, access_level: 1, full_name: 'Target' }
    );

    global.supabaseMock.__setNextResult({
      table: 'projects',
      operation: 'select',
      error: { message: 'Project lookup failed' },
    });

    const response = await request(app)
      .post('/api/projects/611/members')
      .send({ user_id: 127, acting_user_id: 126 });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Project lookup failed' });
  });

  it('allows owner to remove member', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 130, access_level: 1, full_name: 'Owner Two' },
      { user_id: 131, access_level: 1, full_name: 'Member Two' }
    );
    global.supabaseMock.tables.projects.push({
      project_id: 602,
      owner_id: 130,
      members: [130, 131],
    });

    const response = await request(app)
      .delete('/api/projects/602/members/131')
      .send({ acting_user_id: 130 });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toContain('Member Two removed from project');
  });

  it('rejects member removal by non-owner', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 140, access_level: 1 },
      { user_id: 141, access_level: 1 }
    );
    global.supabaseMock.tables.projects.push({
      project_id: 603,
      owner_id: 140,
      members: [140, 141],
    });

    const response = await request(app)
      .delete('/api/projects/603/members/141')
      .send({ acting_user_id: 141 });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Only project owner can remove members' });
  });

  it('rejects removing owner from members', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 150, access_level: 1 },
      { user_id: 151, access_level: 1 }
    );
    global.supabaseMock.tables.projects.push({
      project_id: 604,
      owner_id: 150,
      members: [150, 151],
    });

    const response = await request(app)
      .delete('/api/projects/604/members/150')
      .send({ acting_user_id: 150 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Cannot remove project owner from members' });
  });

  it('prevents removal when user participates in tasks', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 160, access_level: 1 },
      { user_id: 161, access_level: 1, full_name: 'Busy Bee' }
    );
    global.supabaseMock.tables.projects.push({
      project_id: 605,
      owner_id: 160,
      members: [160, 161],
    });
    global.supabaseMock.tables.tasks.push({
      task_id: 9600,
      title: 'Critical task',
      owner_id: 161,
      project_id: 605,
      members_id: [161],
      is_deleted: false,
    });

    const response = await request(app)
      .delete('/api/projects/605/members/161')
      .send({ acting_user_id: 160 });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('cannot be removed because they are involved');
  });

  it('rejects adding duplicate member', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 170, access_level: 1, full_name: 'Owner' },
      { user_id: 171, access_level: 1, full_name: 'Already There' }
    );
    global.supabaseMock.tables.projects.push({
      project_id: 606,
      owner_id: 170,
      members: [170, 171],
    });

    const response = await request(app)
      .post('/api/projects/606/members')
      .send({ user_id: 171, acting_user_id: 170 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'User is already a member of this project' });
  });

  it('returns 500 when adding a member fails to persist', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 180, access_level: 1, full_name: 'Owner' },
      { user_id: 181, access_level: 1, full_name: 'Incoming' }
    );
    global.supabaseMock.tables.projects.push({
      project_id: 607,
      owner_id: 180,
      members: [180],
    });

    global.supabaseMock.__setNextResult({
      table: 'projects',
      operation: 'update',
      error: { message: 'Member update failed' },
    });

    const response = await request(app)
      .post('/api/projects/607/members')
      .send({ user_id: 181, acting_user_id: 180 });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Member update failed' });
  });

  it('returns 500 when removing a member fails to persist', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 190, access_level: 1, full_name: 'Owner' },
      { user_id: 191, access_level: 1, full_name: 'Departing' }
    );
    global.supabaseMock.tables.projects.push({
      project_id: 608,
      owner_id: 190,
      members: [190, 191],
    });

    global.supabaseMock.__setNextResult({
      table: 'projects',
      operation: 'update',
      error: { message: 'Member removal failed' },
    });

    const response = await request(app)
      .delete('/api/projects/608/members/191')
      .send({ acting_user_id: 190 });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Member removal failed' });
  });

  it('returns 500 when project lookup fails during member removal', async () => {
    global.supabaseMock.tables.users.push(
      { user_id: 195, access_level: 1, full_name: 'Owner' }
    );

    global.supabaseMock.__setNextResult({
      table: 'projects',
      operation: 'select',
      error: { message: 'Project lookup failed' },
    });

    const response = await request(app)
      .delete('/api/projects/612/members/195')
      .send({ acting_user_id: 195 });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Project lookup failed' });
  });
});
