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
  // Instant check: any task with due_date < today is overdue right now
  const todayISO = toDateISO(now); // yyyy-mm-dd (local)

  // Fetch tasks currently overdue (due_date before today), not completed/deleted
  const { data: tasks, error: tasksErr } = await supabase
    .from('tasks')
    .select('task_id, title, status, owner_id, assignee_id, members_id, is_deleted, due_date')
    .lt('due_date', todayISO)
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

    const userIdList = Array.from(recipientIds);
    if (userIdList.length === 0) continue;

    // Fetch notification preferences for all recipients
    let prefsByUser = new Map();
    try {
      const { data: prefsData, error: prefsErr } = await supabase
        .from('user_notification_prefs')
        .select('user_id, in_app, email')
        .in('user_id', userIdList);
      if (prefsErr) {
        console.warn('⚠️ Could not fetch notification prefs, defaulting to in-app+email:', prefsErr);
      } else if (Array.isArray(prefsData)) {
        prefsData.forEach((p) => {
          prefsByUser.set(p.user_id, { in_app: !!p.in_app, email: !!p.email });
        });
      }
    } catch (e) {
      console.warn('⚠️ Prefs query failed, defaulting to in-app+email:', e);
    }

    // Fetch user email addresses for those who prefer email
    let usersById = new Map();
    try {
      const { data: users, error: usersErr } = await supabase
        .from('users')
        .select('user_id, email, full_name')
        .in('user_id', userIdList);
      if (usersErr) {
        console.warn('⚠️ Could not fetch user emails for overdue email channel:', usersErr);
      } else if (Array.isArray(users)) {
        users.forEach((u) => usersById.set(u.user_id, u));
      }
    } catch (e) {
      console.warn('⚠️ Users query failed for overdue email channel:', e);
    }

    for (const userId of userIdList) {
      // Ensure recipient exists to avoid FK violations on notifications/reminder_log
      const userRecord = usersById.get(userId);
      if (!userRecord) {
        continue;
      }
      const alreadyLogged = await hasLoggedOverdue(task.task_id, userId, task.due_date);

      const pref = prefsByUser.get(userId) || { in_app: true, email: true };
      const message = `⚠️ Task "${task.title}" is now OVERDUE (due ${task.due_date}).`;

      let sentAny = false;

      // In-app channel: first time and then once every 24h while still overdue
      if (pref.in_app) {
        try {
          const { data: existingNotif } = await supabase
            .from('notifications')
            .select('id, created_at')
            .eq('user_id', userId)
            .eq('task_id', task.task_id)
            .ilike('message', '%OVERDUE%')
            .ilike('message', `%${task.due_date}%`)
            .order('created_at', { ascending: false })
            .limit(1);
          const nowTs = Date.now();
          let shouldSendInApp = false;
          if (!Array.isArray(existingNotif) || existingNotif.length === 0) {
            shouldSendInApp = true;
          } else {
            const lastCreated = new Date(existingNotif[0].created_at).getTime();
            if (nowTs - lastCreated >= 24 * 60 * 60 * 1000) shouldSendInApp = true;
          }
          if (shouldSendInApp) {
            await insertInAppNotification(userId, task.task_id, message);
            sentAny = true;
          }
        } catch (e) {
          console.warn('⚠️ In-app overdue check/insert failed:', e);
        }
      }

      // Email channel: only send if not already logged to avoid resending emails repeatedly
      if (!alreadyLogged && pref.email) {
        try {
          const user = usersById.get(userId);
          if (user && user.email) {
            const { sendMail } = require('./email');
            const subject = `[Overdue]: ${task.title}`;
            const text = `Your task "${task.title}" is now overdue.\n\nTask ID: ${task.task_id}\nDue Date: ${task.due_date}\n\nPlease take action.`;
            const html = `<p>Your task <strong>${escapeHtml(task.title)}</strong> is now <strong>overdue</strong>.</p>` +
                        `<p><strong>Task ID:</strong> ${task.task_id}<br/>` +
                        `<strong>Due Date:</strong> ${task.due_date}</p>` +
                        `<p>Please take action.</p>`;
            await sendMail({ to: user.email, subject, text, html });
            sentAny = true;
          }
        } catch (e) {
          console.warn(`⚠️ Failed to send overdue email to user ${userId}:`, e);
        }
      }

      // Log only if this overdue combo hasn't been logged yet and we sent at least one channel now
      if (!alreadyLogged && sentAny) {
        await logOverdue(task.task_id, userId, task.due_date);
      }

      if (sentAny) {
        results.push({ task_id: task.task_id, user_id: userId, due_date: task.due_date });
      }
    }
  }

  if (results.length) {
    console.log(`🚨 Sent ${results.length} overdue notifications`);
  }
  return results;
}

module.exports = { checkAndSendOverdue };

// Simple HTML escape for email content safety
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
