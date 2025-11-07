const { createClient } = require('@supabase/supabase-js');
const { env } = require('../config/env');

const supabase = createClient(
  env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY
);

const { sendMail } = require('./email');
async function emailUsers(userIds, subject, text, html) {
  if (!Array.isArray(userIds) || !userIds.length) return;
  // Fetch email opt-in preferences first
  const { data: prefs } = await supabase
    .from('user_notification_prefs')
    .select('user_id')
    .in('user_id', userIds)
    .eq('email', true);
  const allowed = new Set((prefs || []).map((r) => r.user_id));
  if (!allowed.size) return;
  const { data: users } = await supabase
    .from('users')
    .select('user_id,email')
    .in('user_id', Array.from(allowed));
  const sends = [];
  for (const u of users || []) {
    if (u.email) sends.push(sendMail({ to: u.email, subject, text, html }));
  }
  if (sends.length) await Promise.allSettled(sends);
}

// Check if we should send a reminder now (9 AM time window only)
function shouldSendReminderNow() {
  const hour = new Date().getHours();
  // Send reminders between 9 AM and 10 AM
  return hour >= 9 && hour < 10;
}

// Check and send reminders
async function checkAndSendReminders() {
  console.log('🔔 Starting reminder check at', new Date().toISOString());
  
  try {
    // Get all enabled reminders with their tasks
    const { data: reminders, error } = await supabase
      .from('task_reminders')
      .select(`
        *,
        task:tasks!inner(
          task_id, 
          title, 
          due_date, 
          status,
          owner_id, 
          assignee_id, 
          members_id
        )
      `)
      .eq('enabled', true)
      .not('task.due_date', 'is', null)
      .eq('task.is_deleted', false);

    if (error) {
      console.error('❌ Error fetching reminders:', error);
      return;
    }

    console.log(`📋 Found ${reminders?.length || 0} enabled reminders`);

    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    const nowUtcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const results = [];

    for (const reminder of reminders || []) {
      const task = reminder.task;
      
      // Skip completed tasks
      if (task.status === 'COMPLETED') continue;

      const dueDate = new Date(task.due_date);
      const timeDiff = dueDate.getTime() - now.getTime();
      const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

      // Check if we should send reminders (within the specified days_before range)
      if (daysDiff <= reminder.days_before && daysDiff >= 0) {
        console.log(`⏰ Task "${task.title}" due in ${daysDiff} days - checking reminders`);
        
        // Get all users who should receive reminders
        const userIds = new Set();
        if (task.owner_id) userIds.add(task.owner_id);
        if (task.assignee_id) userIds.add(task.assignee_id);
        if (Array.isArray(task.members_id)) {
          task.members_id.forEach(id => userIds.add(id));
        }

        // Check if this reminder should be sent at the current time (9 AM only)
        if (!shouldSendReminderNow()) {
          console.log(`⏰ Skipping reminder for task "${task.title}" - not the right time window (need 9-10 AM)`);
          continue;
        }

        // Resolve in-app opt-in once per task's recipients
        const recipientIds = Array.from(userIds);
        const { data: inAppPrefs } = await supabase
          .from('user_notification_prefs')
          .select('user_id')
          .in('user_id', recipientIds)
          .eq('in_app', true);
        const inAppAllowed = new Set((inAppPrefs || []).map((r) => r.user_id));
        
        for (const userId of userIds) {
          // Check if we already sent a reminder today for this task/user/due_date
          const { data: existingLog } = await supabase
            .from('reminder_log')
            .select('log_id')
            .eq('task_id', task.task_id)
            .eq('user_id', userId)
            .eq('due_date', task.due_date)
            .eq('reminder_number', 1) // Always use reminder_number 1 for single daily reminder
            .single();

          if (!existingLog) {
            // Send notifications
            const message = createReminderMessage(task, daysDiff);
            if (inAppAllowed.has(userId)) {
              await sendNotification(userId, task.task_id, message);
            }
            // Also send email
            const subject = `[Task Reminder] ${task.title}`;
            const text = message;
            const html = `<p>${escapeHtml(message)}</p>`;
            await emailUsers([userId], subject, text, html);
            
            // Log that we sent this reminder (always use reminder_number 1)
            await logReminder(task.task_id, userId, task.due_date, 1, daysDiff);
            
            results.push({
              task_id: task.task_id,
              user_id: userId,
              reminder_number: 1,
              days_until_due: daysDiff
            });
          }
        }
      }
    }

    console.log(`✅ Sent ${results.length} reminder notifications`);
    // Also run policy-based due notifications (2 days, today, overdue)
    const special = await checkSpecialDueNotifications(reminders || []);
    return { reminders: results, special };
  } catch (error) {
    console.error('❌ Error in checkAndSendReminders:', error);
    return [];
  }
}

// Create reminder message
function createReminderMessage(task, daysDiff) {
  if (daysDiff === 0) {
    return `⚠️ Task "${task.title}" is due TODAY!`;
  } else if (daysDiff === 1) {
    return `⚠️ Task "${task.title}" is due TOMORROW!`;
  } else {
    return `⚠️ Task "${task.title}" is due in ${daysDiff} days!`;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Send notification to user
async function sendNotification(userId, taskId, message) {
  try {
    const { error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        task_id: taskId,
        message: message,
        read: false
      });

    if (error) {
      console.error('❌ Error sending notification:', error);
    } else {
      console.log(`📧 Sent notification to user ${userId}: ${message}`);
    }
  } catch (error) {
    console.error('❌ Error in sendNotification:', error);
  }
}

// Log reminder
async function logReminder(taskId, userId, dueDate, reminderNumber, daysBefore) {
  try {
    const { error } = await supabase
      .from('reminder_log')
      .insert({
        task_id: taskId,
        user_id: userId,
        due_date: dueDate,
        reminder_number: reminderNumber,
        days_before: daysBefore
      });

    if (error) {
      console.error('❌ Error logging reminder:', error);
    }
  } catch (error) {
    console.error('❌ Error in logReminder:', error);
  }
}

module.exports = {
  checkAndSendReminders,
  checkAndSendOverdueNotifications,
  shouldSendReminderNow,
  createReminderMessage,
  escapeHtml,
  logReminder,
};

// Additional policy-based notifications independent of task_reminders rows
async function checkSpecialDueNotifications(remindersWithTasks) {
  try {
    // Build a set of task_ids that already have reminder configs to avoid duplicate emails for TODAY/OVERDUE
    const configuredTaskIds = new Set((remindersWithTasks || []).map((r) => r.task?.task_id).filter(Boolean));

    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('task_id, title, due_date, status, owner_id, assignee_id, members_id')
      .not('due_date', 'is', null)
      .eq('is_deleted', false);
    if (error) return [];

    const now = new Date();
    const sent = [];
    for (const task of tasks || []) {
      if (task.status === 'COMPLETED') continue;
      const dueDate = new Date(task.due_date);
      const timeDiff = dueDate.getTime() - now.getTime();
      const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

      const recipients = new Set();
      if (task.owner_id) recipients.add(task.owner_id);
      if (task.assignee_id) recipients.add(task.assignee_id);
      if (Array.isArray(task.members_id)) task.members_id.forEach((id) => recipients.add(id));
      if (!recipients.size) continue;

      // Resolve eligible recipients (exist in users); derive channel prefs
      const recipientIds = Array.from(recipients);
      const [{ data: prefs }, { data: existingUsers }] = await Promise.all([
        supabase
          .from('user_notification_prefs')
          .select('user_id, in_app, email')
          .in('user_id', recipientIds),
        supabase
          .from('users')
          .select('user_id')
          .in('user_id', recipientIds),
      ]);
      const existingSet = new Set((existingUsers || []).map((u) => u.user_id));
      const emailAllowed = new Set((prefs || []).filter((p) => p.email).map((p) => p.user_id));
      const inAppAllowed = new Set((prefs || []).filter((p) => p.in_app).map((p) => p.user_id));
      const eligibleEmail = recipientIds.filter((id) => existingSet.has(id) && emailAllowed.has(id));
      const eligibleInApp = recipientIds.filter((id) => existingSet.has(id) && inAppAllowed.has(id));
      if (!eligibleEmail.length && !eligibleInApp.length) continue;

      // Two days before
      if (daysDiff === 2) {
        const reminderNumber = 102; // sentinel for two-days-before
        const eligibleIds = Array.from(new Set([...eligibleEmail, ...eligibleInApp]));
        for (const uid of eligibleIds) {
          // Reserve via upsert to avoid duplicates
          const { data: reserved, error: reserveError } = await supabase
            .from('reminder_log')
            .upsert({
              task_id: task.task_id,
              user_id: uid,
              due_date: task.due_date,
              reminder_number,
              days_before: 2,
            }, { onConflict: 'task_id,user_id,due_date,reminder_number', ignoreDuplicates: true })
            .select('log_id')
            .maybeSingle();
          if (reserveError || !reserved) continue;
          const subject = `[Task Due Soon] ${task.title} is due in 2 days`;
          const text = `Task "${task.title}" is due in 2 days (${task.due_date}).`;
          const html = `<p>Task <strong>${escapeHtml(task.title)}</strong> is due in <strong>2 days</strong> (${task.due_date}).</p>`;
          if (emailAllowed.has(uid)) {
            await emailUsers([uid], subject, text, html);
          }
          if (inAppAllowed.has(uid)) {
            await sendNotification(uid, task.task_id, `⚠️ ${task.title} is due in 2 days (${task.due_date}).`);
          }
          sent.push({ task_id: task.task_id, user_id: uid, kind: 'two_days' });
        }
      }

      // Today due - only if not already configured to avoid double-emails
      if (daysDiff === 0 && !configuredTaskIds.has(task.task_id)) {
        const reminderNumber = 100; // sentinel for due today
        const eligibleIds = Array.from(new Set([...eligibleEmail, ...eligibleInApp]));
        for (const uid of eligibleIds) {
          // Reserve via upsert to avoid duplicates (and FK-safe)
          const { data: reserved, error: reserveError } = await supabase
            .from('reminder_log')
            .upsert({
              task_id: task.task_id,
              user_id: uid,
              due_date: task.due_date,
              reminder_number,
              days_before: 0,
            }, { onConflict: 'task_id,user_id,due_date,reminder_number', ignoreDuplicates: true })
            .select('log_id')
            .maybeSingle();
          if (reserveError || !reserved) continue;
          const subject = `[Task Due Today] ${task.title}`;
          const text = `Task "${task.title}" is due TODAY (${task.due_date}).`;
          const html = `<p>Task <strong>${escapeHtml(task.title)}</strong> is due <strong>TODAY</strong> (${task.due_date}).</p>`;
          if (emailAllowed.has(uid)) {
            await emailUsers([uid], subject, text, html);
          }
          if (inAppAllowed.has(uid)) {
            await sendNotification(uid, task.task_id, `⚠️ ${task.title} is due TODAY (${task.due_date}).`);
          }
          sent.push({ task_id: task.task_id, user_id: uid, kind: 'today' });
        }
      }

  // Overdue emails removed; handled elsewhere previously
    }
    return sent;
  } catch (_) {
    return [];
  }
}

// Overdue checker: send once per overdue day per involved user
async function checkAndSendOverdueNotifications() {
  try {
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('task_id, title, due_date, status, owner_id, assignee_id, members_id')
      .not('due_date', 'is', null)
      .eq('is_deleted', false);
    if (error) return [];

    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    const nowUtcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const results = [];

    for (const task of tasks || []) {
      if (task.status === 'COMPLETED') continue;
      const dueDateUtcMidnight = new Date(`${task.due_date}T00:00:00Z`);
      const msDiff = nowUtcMidnight.getTime() - dueDateUtcMidnight.getTime();
      const daysOverdue = Math.floor(msDiff / dayMs);
      if (daysOverdue < 1) continue; // not overdue until the day after

      const recipients = new Set();
      if (task.owner_id) recipients.add(task.owner_id);
      if (task.assignee_id) recipients.add(task.assignee_id);
      if (Array.isArray(task.members_id)) task.members_id.forEach((id) => recipients.add(id));
      if (!recipients.size) continue;

      // Resolve recipients: existing users with any channel enabled (in_app or email)
      const recipientIds = Array.from(recipients);
      const [{ data: prefs }, { data: existingUsers }] = await Promise.all([
        supabase
          .from('user_notification_prefs')
          .select('user_id, in_app, email')
          .in('user_id', recipientIds),
        supabase
          .from('users')
          .select('user_id')
          .in('user_id', recipientIds),
      ]);
      const existingSet = new Set((existingUsers || []).map((u) => u.user_id));
      const inAppAllowed = new Set((prefs || []).filter((p) => p.in_app).map((p) => p.user_id));
      const emailAllowed = new Set((prefs || []).filter((p) => p.email).map((p) => p.user_id));
      const canNotify = new Set();
      for (const id of recipientIds) {
        if (!existingSet.has(id)) continue;
        if (inAppAllowed.has(id) || emailAllowed.has(id)) canNotify.add(id);
      }
      if (!canNotify.size) continue;

      // Compose message
      const message = daysOverdue === 1
        ? `⛔ Task "${task.title}" is OVERDUE by 1 day!`
        : `⛔ Task "${task.title}" is OVERDUE by ${daysOverdue} days!`;

      // Use sentinel range 200+daysOverdue to tag overdue-day logs
      const reminderNumber = 200 + daysOverdue;

      for (const uid of Array.from(canNotify)) {
        // 1) Enforce 24h cooldown across overdue notifications (ignore due_date to be extra safe)
        const sinceIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        const { data: recentOverdue } = await supabase
          .from('reminder_log')
          .select('log_id, sent_at')
          .eq('task_id', task.task_id)
          .eq('user_id', uid)
          .gte('reminder_number', 200)
          .gte('sent_at', sinceIso)
          .limit(1)
          .maybeSingle();
        if (recentOverdue) continue;

        // 2) Reserve this send by inserting a log first (idempotent, safe for races)
        const { data: reserved, error: reserveError } = await supabase
          .from('reminder_log')
          .upsert({
            task_id: task.task_id,
            user_id: uid,
            due_date: task.due_date,
            reminder_number: reminderNumber,
            days_before: -daysOverdue,
          }, {
            onConflict: 'task_id,user_id,due_date,reminder_number',
            ignoreDuplicates: true,
          })
          .select('log_id')
          .maybeSingle();
        if (reserveError) {
          console.error('❌ Overdue reserve failed:', reserveError);
          continue;
        }
        if (!reserved) {
          // Duplicate reservation exists, skip sending
          continue;
        }

        // In-app notification
        if (inAppAllowed.has(uid)) {
          await sendNotification(uid, task.task_id, message);
        }

        // Email (respect email prefs via helper)
        const subject = `[Task Overdue] ${task.title}`;
        const text = `${message} (Due: ${task.due_date})`;
        const html = `<p>${escapeHtml(message)} (Due: ${escapeHtml(String(task.due_date))})</p>`;
        if (emailAllowed.has(uid)) {
          await emailUsers([uid], subject, text, html);
        }

        // Reservation row already inserted; treat as send log

        results.push({ task_id: task.task_id, user_id: uid, daysOverdue });
      }
    }
    if (results.length) {
      console.log(`🚨 Sent ${results.length} overdue notifications`);
    }
    return results;
  } catch (e) {
    console.error('❌ Error in checkAndSendOverdueNotifications:', e);
    return [];
  }
}
