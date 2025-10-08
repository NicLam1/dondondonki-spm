'use strict';

const { ActivityTypes, isValidActivityType, formatActivitySummary } = require('../models/activityLog');

async function recordTaskActivity(supabase, entry) {
  try {
    if (!supabase) return;
    const taskId = entry.taskId ?? entry.task_id;
    const authorId = entry.authorId ?? entry.author_id ?? null;
    const type = entry.type;
    const metadata = (entry.metadata && typeof entry.metadata === 'object') ? entry.metadata : {};
    if (!taskId || !isValidActivityType(type)) return;
    const summary = (typeof entry.summary === 'string' && entry.summary.trim())
      ? entry.summary.trim()
      : formatActivitySummary(type, metadata);
    await supabase
      .from('task_activity_logs')
      .insert({
        task_id: taskId,
        author_id: authorId,
        type,
        summary,
        metadata,
        created_at: new Date().toISOString(),
      });
  } catch (_) {
    // Intentionally ignore logging failures to avoid breaking main flows
  }
}

async function recordMultipleTaskActivities(supabase, entries) {
  if (!Array.isArray(entries) || !entries.length) return;
  await Promise.all(entries.map((e) => recordTaskActivity(supabase, e)));
}

module.exports = {
  ActivityTypes,
  recordTaskActivity,
  recordMultipleTaskActivities,
};


