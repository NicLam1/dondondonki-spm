'use strict';

const {
  recordTaskActivity,
  recordMultipleTaskActivities,
} = jest.requireActual('../../../backend/src/services/activityLog');
const {
  ActivityTypes,
  formatActivitySummary,
} = jest.requireActual('../../../backend/src/models/activityLog');

function createSupabaseStub() {
  const insert = jest.fn().mockResolvedValue({ data: null, error: null });
  const supabase = {
    from: jest.fn(() => ({
      insert,
    })),
  };
  return { supabase, insert };
}

describe('services/activityLog', () => {
  test('recordTaskActivity inserts log with formatted summary when summary missing', async () => {
    const { supabase, insert } = createSupabaseStub();
    const metadata = { from_status: 'OPEN', to_status: 'CLOSED' };
    await recordTaskActivity(supabase, {
      taskId: 123,
      authorId: 42,
      type: ActivityTypes.STATUS_CHANGED,
      metadata,
    });

    expect(supabase.from).toHaveBeenCalledWith('task_activity_logs');
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        task_id: 123,
        author_id: 42,
        type: ActivityTypes.STATUS_CHANGED,
        summary: formatActivitySummary(ActivityTypes.STATUS_CHANGED, metadata),
        metadata,
      })
    );
  });

  test('recordTaskActivity skips insert when task id missing or type invalid', async () => {
    const { supabase } = createSupabaseStub();
    await recordTaskActivity(supabase, { taskId: null, type: ActivityTypes.STATUS_CHANGED });
    await recordTaskActivity(supabase, { taskId: 2, type: 'UNKNOWN' });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('recordMultipleTaskActivities inserts once per entry', async () => {
    const { supabase, insert } = createSupabaseStub();
    const entries = [
      { taskId: 1, type: ActivityTypes.TASK_CREATED },
      { taskId: 2, type: ActivityTypes.TASK_DELETED },
    ];
    await recordMultipleTaskActivities(supabase, entries);
    expect(insert).toHaveBeenCalledTimes(entries.length);
  });
});
