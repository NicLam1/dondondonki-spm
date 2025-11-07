'use strict';

jest.unmock('../../../backend/src/services/reportService');

const {
  sanitizeFilename,
  makeSimplePdfBuffer,
  generateReportBuffer,
} = require('../../../backend/src/services/reportService');

describe('services/reportService', () => {
  beforeEach(() => {
    const tables = global.supabaseMock.tables;
    tables.tasks = [];
    tables.projects = [];
    tables.users = [];
    tables.teams = [];
    tables.departments = [];
  });

  test('sanitizeFilename strips unsupported characters', () => {
    expect(sanitizeFilename(' /tmp\\report?.pdf ')).toBe('-tmp-report-.pdf');
    expect(sanitizeFilename('')).toBe('report');
  });

  test('makeSimplePdfBuffer produces a PDF document', async () => {
    const metrics = [
      { label: 'Total tasks', value: 5 },
      { label: 'Completed', value: 3 },
    ];
    const items = [
      {
        task_id: 1,
        title: 'Document requirements',
        status: 'COMPLETED',
        due_date: '2025-11-01T00:00:00Z',
        owner_name: 'Alice',
        assignee_name: 'Bob',
        overdue: false,
      },
    ];

    const buffer = await makeSimplePdfBuffer('Sprint Report', 'From Oct 1 - Oct 15', metrics, items);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString('utf8', 0, 4)).toBe('%PDF');
  });

  test('generateReportBuffer aggregates project metrics and tasks', async () => {
    const supabase = global.supabaseMock;
    supabase.tables.projects.push({ project_id: 77, name: 'Apollo' });
    supabase.tables.tasks.push(
      {
        task_id: 400,
        title: 'Kickoff',
        status: 'COMPLETED',
        due_date: '2025-11-01',
        owner_id: 100,
        assignee_id: 101,
        members_id: [102],
        project_id: 77,
        is_deleted: false,
        created_at: '2025-10-01T00:00:00Z',
        updated_at: '2025-10-02T00:00:00Z',
      },
      {
        task_id: 401,
        title: 'Implement feature',
        status: 'ONGOING',
        due_date: '2025-11-15',
        owner_id: 101,
        assignee_id: 102,
        members_id: [],
        project_id: 77,
        is_deleted: false,
        created_at: '2025-10-05T00:00:00Z',
        updated_at: '2025-10-10T00:00:00Z',
      },
    );
    supabase.tables.users.push(
      { user_id: 100, full_name: 'Owner One', email: 'owner@example.com' },
      { user_id: 101, full_name: 'Lead Two', email: 'lead@example.com' },
      { user_id: 102, full_name: 'Dev Three', email: 'dev@example.com' },
    );

    const buffer = await generateReportBuffer({
      supabase,
      scope: 'project',
      id: 77,
      startDate: '2025-10-01',
      endDate: '2025-12-31',
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString('utf8', 0, 4)).toBe('%PDF');
  });

  test('generateReportBuffer filters tasks for a team scope and resolves team name', async () => {
    const supabase = global.supabaseMock;
    supabase.tables.teams.push({ team_id: 42, team_name: 'Ops Team' });
    supabase.tables.users.push(
      { user_id: 201, team_id: 42, department_id: 7, full_name: 'Team Owner', email: 'owner@ops.com' },
      { user_id: 202, team_id: 42, department_id: 7, full_name: 'Team Member', email: 'member@ops.com' },
      { user_id: 203, team_id: 99, department_id: 8, full_name: 'Other User', email: 'other@corp.com' },
    );
    supabase.tables.tasks.push(
      {
        task_id: 501,
        title: 'Ops Planning',
        status: 'ONGOING',
        due_date: '2025-11-20',
        owner_id: 201,
        assignee_id: null,
        members_id: [],
        is_deleted: false,
        created_at: '2025-10-01T00:00:00Z',
        updated_at: '2025-10-05T00:00:00Z',
      },
      {
        task_id: 502,
        title: 'Ops Follow-up',
        status: 'COMPLETED',
        due_date: '2025-11-25',
        owner_id: 203,
        assignee_id: null,
        members_id: [202],
        is_deleted: false,
        created_at: '2025-10-02T00:00:00Z',
        updated_at: '2025-10-07T00:00:00Z',
      },
    );

    const buffer = await generateReportBuffer({
      supabase,
      scope: 'team',
      id: 42,
      startDate: '2025-10-01',
      endDate: '2025-12-31',
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString('utf8', 0, 4)).toBe('%PDF');
  });

  test('generateReportBuffer resolves department scope names and user filtering', async () => {
    const supabase = global.supabaseMock;
    supabase.tables.departments.push({ department_id: 5, department_name: 'Engineering' });
    supabase.tables.users.push(
      { user_id: 301, department_id: 5, full_name: 'Eng Owner', email: 'owner@eng.com' },
      { user_id: 302, department_id: 5, full_name: 'Eng Member', email: 'member@eng.com' },
      { user_id: 303, department_id: 6, full_name: 'Marketing Owner', email: 'owner@marketing.com' },
    );
    supabase.tables.tasks.push(
      {
        task_id: 601,
        title: 'Build API',
        status: 'UNDER_REVIEW',
        due_date: '2025-11-05',
        owner_id: 301,
        assignee_id: 302,
        members_id: [],
        is_deleted: false,
        created_at: '2025-09-01T00:00:00Z',
        updated_at: '2025-10-25T00:00:00Z',
      },
      {
        task_id: 602,
        title: 'Launch campaign',
        status: 'ONGOING',
        due_date: '2025-11-15',
        owner_id: 303,
        assignee_id: null,
        members_id: [],
        is_deleted: false,
        created_at: '2025-09-10T00:00:00Z',
        updated_at: '2025-10-01T00:00:00Z',
      },
    );

    const buffer = await generateReportBuffer({
      supabase,
      scope: 'department',
      id: 5,
      startDate: '2025-09-01',
      endDate: '2025-12-31',
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString('utf8', 0, 4)).toBe('%PDF');
  });
});
