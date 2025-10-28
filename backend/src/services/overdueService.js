const { createClient } = require('@supabase/supabase-js');
const { env } = require('../config/env');

// Supabase client (service role if available, else anon)
const supabase = createClient(
  env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY
);

// Helper: determine if the last minute crossed midnight (local server time)
function crossedMidnightInLastMinute(now = new Date()) {
  const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
  return (
    now.getDate() !== oneMinuteAgo.getDate() ||
    now.getMonth() !== oneMinuteAgo.getMonth() ||
    now.getFullYear() !== oneMinuteAgo.getFullYear()
  );
}

// Returns yyyy-mm-dd for a Date
function toDateISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Compute the calendar date that just became overdue at midnight
function dateThatJustBecameOverdue(now = new Date()) {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  return toDateISO(yesterday);
}

// Create/insert in-app notification
async function insertInAppNotification(userId, taskId, message) {
  const { error } = await supabase
    .from('notifications')
    .insert({ user_id: userId, task_id: taskId, message, read: false });
  if (error) {
    console.error('❌ Error inserting overdue notification:', error);
  }
}

// Check if an overdue notification has already been logged for this task+user+due_date
// We reuse reminder_log with a convention: reminder_number = 0 represents an overdue event.
async function hasLoggedOverdue(taskId, userId, dueDate) {
  const { data, error } = await supabase
    .from('reminder_log')
    .select('log_id')
    .eq('task_id', taskId)
    .eq('user_id', userId)
    .eq('due_date', dueDate)
    .eq('reminder_number', 0)
    .maybeSingle();
  if (error) {
    console.warn('Warning checking overdue log:', error);
    return false;
  }
  return Boolean(data);
}

// Log the overdue event using reminder_log with reminder_number = 0
async function logOverdue(taskId, userId, dueDate) {
  const { error } = await supabase
    .from('reminder_log')
    .insert({
      task_id: taskId,
      user_id: userId,
      due_date: dueDate,
      reminder_number: 0,
      days_before: 0,
    });
  if (error) {
    console.error('❌ Error logging overdue notice:', error);
  }
}

// Main checker: finds tasks that just became overdue and notifies recipients
async function checkAndSendOverdue() {
  const now = new Date();
  // With current schema (due_date is DATE), a task becomes overdue at midnight after its due_date.
  // Run only when we cross midnight to adhere to "within 1 minute" given date-only precision.
  if (!crossedMidnightInLastMinute(now)) {
    return [];
  }

  const justOverdueDate = dateThatJustBecameOverdue(now); // yyyy-mm-dd

  // Fetch tasks that just became overdue (were due yesterday), are not completed/deleted
  const { data: tasks, error: tasksErr } = await supabase
    .from('tasks')
    .select('task_id, title, status, owner_id, assignee_id, members_id, is_deleted, due_date')
    .eq('due_date', justOverdueDate)
    .eq('is_deleted', false)
    .neq('status', 'COMPLETED');

  if (tasksErr) {
    console.error('❌ Error fetching overdue tasks:', tasksErr);
    return [];
  }

  const results = [];

  for (const task of tasks || []) {
    const recipientIds = new Set();
    if (task.owner_id) recipientIds.add(task.owner_id);
    if (task.assignee_id) recipientIds.add(task.assignee_id);
    if (Array.isArray(task.members_id)) task.members_id.forEach((id) => recipientIds.add(id));

    for (const userId of recipientIds) {
      // Prevent duplicate overdue notifications for this task/user
      const alreadyLogged = await hasLoggedOverdue(task.task_id, userId, task.due_date);
      if (alreadyLogged) continue;

      const message = `⚠️ Task "${task.title}" is now OVERDUE.`;
      await insertInAppNotification(userId, task.task_id, message);
      await logOverdue(task.task_id, userId, task.due_date);
      results.push({ task_id: task.task_id, user_id: userId, due_date: task.due_date });
    }
  }

  if (results.length) {
    console.log(`🚨 Sent ${results.length} overdue notifications`);
  }
  return results;
}

module.exports = { checkAndSendOverdue };

