jest.unmock('../../../backend/src/services/activityLog');

const activityLogService = jest.requireActual('../../../backend/src/services/activityLog');
const {
  ActivityTypes,
  recordTaskActivity,
  recordMultipleTaskActivities,
} = activityLogService;
const { formatActivitySummary } = require('../../../backend/src/models/activityLog');
const { createSupabaseMock } = require('../mocks/supabaseClient');

describe('services/activityLog', () => {
  let supabase;

  beforeEach(() => {
    supabase = createSupabaseMock();
  });

  it('supabase mock writes to task_activity_logs table', async () => {
    await supabase
      .from('task_activity_logs')
      .insert({ task_id: 1, type: 'test', summary: 'summary', metadata: {} });

    expect(supabase.tables.task_activity_logs).toHaveLength(1);
  });

  it('persists an activity with formatted summary when none supplied', async () => {
    const { isValidActivityType } = require('../../../backend/src/models/activityLog');
    expect(isValidActivityType(ActivityTypes.STATUS_CHANGED)).toBe(true);
    const fromSpy = jest.spyOn(supabase, 'from');

    await recordTaskActivity(supabase, {
      taskId: 10,
      authorId: 20,
      type: ActivityTypes.STATUS_CHANGED,
      metadata: { from_status: 'TO_DO', to_status: 'ONGOING' },
    });

    expect(fromSpy).toHaveBeenCalled();
    expect(supabase.tables.task_activity_logs).toHaveLength(1);
    const payload = supabase.tables.task_activity_logs[0];
    expect(payload).toMatchObject({
      task_id: 10,
      author_id: 20,
      type: ActivityTypes.STATUS_CHANGED,
      metadata: { from_status: 'TO_DO', to_status: 'ONGOING' },
      summary: formatActivitySummary(ActivityTypes.STATUS_CHANGED, {
        from_status: 'TO_DO',
        to_status: 'ONGOING',
      }),
    });
    expect(typeof payload.created_at).toBe('string');
    expect(fromSpy).toHaveBeenCalledWith('task_activity_logs');
  });

  it('skips inserting when task id is missing', async () => {
    await recordTaskActivity(supabase, {
      authorId: 20,
      type: ActivityTypes.STATUS_CHANGED,
    });

    expect(supabase.tables.task_activity_logs).toHaveLength(0);
  });

  it('skips inserting when activity type is invalid', async () => {
    await recordTaskActivity(supabase, {
      taskId: 1,
      authorId: 2,
      type: 'unknown',
    });

    expect(supabase.tables.task_activity_logs).toHaveLength(0);
  });

  it('records multiple activities in parallel', async () => {
    await recordMultipleTaskActivities(supabase, [
      { taskId: 1, type: ActivityTypes.TASK_CREATED },
      { taskId: 2, type: ActivityTypes.TASK_DELETED },
    ]);

    expect(supabase.tables.task_activity_logs).toHaveLength(2);
  });

  it('uses provided summary when available', async () => {
    await recordTaskActivity(supabase, {
      taskId: 22,
      authorId: 33,
      type: ActivityTypes.TASK_CREATED,
      summary: 'Custom summary',
    });

    expect(supabase.tables.task_activity_logs[0]).toMatchObject({
      summary: 'Custom summary',
    });
  });

  it('trims provided summary string', async () => {
    await recordTaskActivity(supabase, {
      taskId: 23,
      authorId: 44,
      type: ActivityTypes.TASK_CREATED,
      summary: '  Needs trimming  ',
    });

    expect(supabase.tables.task_activity_logs[0].summary).toBe('Needs trimming');
  });

  it('ignores empty batch in recordMultipleTaskActivities', async () => {
    await recordMultipleTaskActivities(supabase, []);
    await recordMultipleTaskActivities(supabase, null);

    expect(supabase.tables.task_activity_logs).toHaveLength(0);
  });

  it('returns early when supabase client missing', async () => {
    await recordTaskActivity(null, { taskId: 1, type: ActivityTypes.TASK_CREATED });
    expect(supabase.tables.task_activity_logs).toHaveLength(0);
  });
});
