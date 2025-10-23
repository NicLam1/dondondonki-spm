const { createClient } = require('@supabase/supabase-js');
const { env } = require('../config/env');

const supabase = createClient(
  env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY
);

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

        // Calculate how many reminders to send today based on frequency
        const remindersToSend = [];
        for (let i = 1; i <= reminder.frequency_per_day; i++) {
          remindersToSend.push(i);
        }

        for (const userId of userIds) {
          for (const reminderNumber of remindersToSend) {
            // Check if we already sent this reminder today
            const { data: existingLog } = await supabase
              .from('reminder_log')
              .select('log_id')
              .eq('task_id', task.task_id)
              .eq('user_id', userId)
              .eq('due_date', task.due_date)
              .eq('reminder_number', reminderNumber)
              .single();

            if (!existingLog) {
              // Send notification
              const message = createReminderMessage(task, daysDiff);
              await sendNotification(userId, task.task_id, message);
              
              // Log that we sent this reminder
              await logReminder(task.task_id, userId, task.due_date, reminderNumber, daysDiff);
              
              results.push({
                task_id: task.task_id,
                user_id: userId,
                reminder_number: reminderNumber,
                days_until_due: daysDiff
              });
            }
          }
        }
      }
    }

    console.log(`✅ Sent ${results.length} reminder notifications`);
    return results;
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
  checkAndSendReminders
};
