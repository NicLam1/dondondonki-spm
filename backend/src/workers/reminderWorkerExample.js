/**
 * REMINDER WORKER EXAMPLE
 * 
 * This is an example implementation of a reminder worker that checks for
 * tasks requiring reminders and sends notifications.
 * 
 * TO USE:
 * 1. Rename this file to reminderWorker.js
 * 2. Implement your preferred notification method (email, push, etc.)
 * 3. Set up a cron job or scheduled task to run this periodically
 * 4. Update the sendNotification function with your actual implementation
 */

const { createClient } = require('@supabase/supabase-js');
const { env } = require('../config/env');

const supabase = createClient(
  env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY
);

/**
 * Calculate if a reminder should be sent today based on settings
 */
function shouldSendReminder(task, reminderSettings) {
  if (!task.due_date || !reminderSettings.enabled) {
    return false;
  }

  const now = new Date();
  const dueDate = new Date(task.due_date);
  
  // Reset time to start of day for accurate day calculation
  now.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);
  
  const timeDiff = dueDate.getTime() - now.getTime();
  const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

  // Check if we're within the reminder window
  if (daysDiff <= reminderSettings.days_before && daysDiff >= 0) {
    return true;
  }

  return false;
}

/**
 * Check if this user has already received a reminder today at this time
 */
async function hasReceivedReminderToday(taskId, userId, reminderType) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('reminder_log')
    .select('log_id')
    .eq('task_id', taskId)
    .eq('user_id', userId)
    .eq('reminder_type', reminderType)
    .gte('sent_at', today.toISOString())
    .limit(1);

  if (error) {
    console.error('Error checking reminder log:', error);
    return false;
  }

  return data && data.length > 0;
}

/**
 * Log a sent reminder to prevent duplicates
 */
async function logSentReminder(taskId, userId, reminderType) {
  const { error } = await supabase
    .from('reminder_log')
    .insert({
      task_id: taskId,
      user_id: userId,
      reminder_type: reminderType,
      sent_at: new Date().toISOString()
    });

  if (error) {
    console.error('Error logging reminder:', error);
  }
}

/**
 * Determine what type of reminder to send based on time of day and frequency
 */
function getReminderType(frequencyPerDay) {
  const hour = new Date().getHours();

  if (frequencyPerDay === 1) {
    // Once per day - send in morning
    if (hour >= 8 && hour < 12) {
      return 'daily_morning';
    }
  } else if (frequencyPerDay === 2) {
    // Twice per day - morning and evening
    if (hour >= 8 && hour < 12) {
      return 'twice_morning';
    } else if (hour >= 17 && hour < 21) {
      return 'twice_evening';
    }
  } else if (frequencyPerDay === 3) {
    // Three times - morning, afternoon, evening
    if (hour >= 8 && hour < 12) {
      return 'thrice_morning';
    } else if (hour >= 13 && hour < 16) {
      return 'thrice_afternoon';
    } else if (hour >= 17 && hour < 21) {
      return 'thrice_evening';
    }
  }

  return null; // Not time to send reminder
}

/**
 * Send notification to user (IMPLEMENT YOUR ACTUAL NOTIFICATION HERE)
 */
async function sendNotification(user, task, reminderDetails) {
  console.log('📧 SENDING REMINDER:');
  console.log('  To:', user.email, `(${user.full_name})`);
  console.log('  Task:', task.title);
  console.log('  Due:', new Date(task.due_date).toLocaleDateString());
  console.log('  Days until due:', reminderDetails.daysUntilDue);
  console.log('  Type:', reminderDetails.reminderType);

  // ==========================================
  // IMPLEMENT YOUR NOTIFICATION METHOD HERE
  // ==========================================
  
  // OPTION 1: Email notification
  // const emailService = require('../services/email');
  // await emailService.sendTaskReminder({
  //   to: user.email,
  //   userName: user.full_name,
  //   taskTitle: task.title,
  //   taskDescription: task.description,
  //   dueDate: task.due_date,
  //   daysUntilDue: reminderDetails.daysUntilDue,
  //   taskUrl: `${process.env.APP_URL}/tasks?task=${task.task_id}`
  // });

  // OPTION 2: In-app notification (ENABLED)
  await supabase.from('notifications').insert({
    user_id: user.user_id,
    task_id: task.task_id,
    message: `📋 Reminder: "${task.title}" is due in ${reminderDetails.daysUntilDue} day${reminderDetails.daysUntilDue !== 1 ? 's' : ''}`,
    read: false
  });

  // OPTION 3: Push notification
  // const webPush = require('web-push');
  // await webPush.sendNotification(subscription, JSON.stringify({
  //   title: 'Task Reminder',
  //   body: `${task.title} is due in ${reminderDetails.daysUntilDue} days`,
  //   icon: '/logo192.png',
  //   data: { taskId: task.task_id }
  // }));

  // For now, just log it
  console.log('  ✅ Notification sent (implement actual sending above)');
}

/**
 * Main function to check and send reminders
 */
async function checkAndSendReminders() {
  console.log('🔔 Starting reminder check at', new Date().toISOString());

  try {
    // Get all enabled reminders with task details
    const { data: reminders, error: remindersErr } = await supabase
      .from('task_reminders')
      .select(`
        *,
        task:tasks(
          task_id,
          title,
          description,
          due_date,
          owner_id,
          assignee_id,
          members_id,
          status,
          is_deleted
        )
      `)
      .eq('enabled', true);

    if (remindersErr) {
      console.error('❌ Error fetching reminders:', remindersErr);
      return;
    }

    console.log(`📋 Found ${reminders?.length || 0} tasks with reminders enabled`);

    let remindersSent = 0;

    for (const reminder of (reminders || [])) {
      const task = reminder.task;

      // Skip if task is deleted or completed
      if (!task || task.is_deleted || task.status === 'COMPLETED') {
        continue;
      }

      // Check if reminder should be sent today
      if (!shouldSendReminder(task, reminder)) {
        continue;
      }

      // Determine reminder type based on time and frequency
      const reminderType = getReminderType(reminder.frequency_per_day);
      if (!reminderType) {
        continue; // Not the right time for this frequency
      }

      // Get all users who should receive this reminder
      const recipientIds = new Set();
      if (task.owner_id) recipientIds.add(task.owner_id);
      if (task.assignee_id) recipientIds.add(task.assignee_id);
      if (Array.isArray(task.members_id)) {
        task.members_id.forEach(id => recipientIds.add(id));
      }

      // Send reminder to each recipient
      for (const userId of recipientIds) {
        // Check if already sent today
        if (await hasReceivedReminderToday(task.task_id, userId, reminderType)) {
          continue;
        }

        // Get user details
        const { data: user, error: userErr } = await supabase
          .from('users')
          .select('user_id, email, full_name')
          .eq('user_id', userId)
          .single();

        if (userErr || !user) {
          console.error(`❌ Error fetching user ${userId}:`, userErr);
          continue;
        }

        // Calculate days until due
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const dueDate = new Date(task.due_date);
        dueDate.setHours(0, 0, 0, 0);
        const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        // Send the notification
        try {
          await sendNotification(user, task, {
            daysUntilDue,
            reminderType,
            frequencyPerDay: reminder.frequency_per_day,
            daysBefore: reminder.days_before
          });

          // Log the sent reminder
          await logSentReminder(task.task_id, userId, reminderType);
          
          remindersSent++;
        } catch (notifyErr) {
          console.error(`❌ Error sending notification to ${user.email}:`, notifyErr);
        }
      }
    }

    console.log(`✅ Reminder check complete. Sent ${remindersSent} reminders.`);
  } catch (error) {
    console.error('❌ Unexpected error in reminder worker:', error);
  }
}

/**
 * Export for use in cron job or manual invocation
 */
module.exports = { checkAndSendReminders };

/**
 * If run directly (e.g., node reminderWorker.js)
 */
if (require.main === module) {
  checkAndSendReminders()
    .then(() => {
      console.log('✅ Done');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Fatal error:', err);
      process.exit(1);
    });
}

/**
 * DEPLOYMENT OPTIONS:
 * 
 * 1. NODE-CRON (in your main app)
 * 
 *    const cron = require('node-cron');
 *    const { checkAndSendReminders } = require('./workers/reminderWorker');
 * 
 *    // Run every hour
 *    cron.schedule('0 * * * *', () => {
 *      console.log('Running reminder check');
 *      checkAndSendReminders();
 *    });
 * 
 *    // Or run at specific times
 *    cron.schedule('0 9,14,18 * * *', () => {
 *      // 9 AM, 2 PM, 6 PM daily
 *      checkAndSendReminders();
 *    });
 * 
 * 2. HEROKU SCHEDULER
 * 
 *    Add this to your Heroku app:
 *    $ heroku addons:create scheduler:standard
 *    $ heroku addons:open scheduler
 *    
 *    Then add command:
 *    node backend/src/workers/reminderWorker.js
 * 
 * 3. AWS LAMBDA / CLOUD FUNCTIONS
 * 
 *    Deploy as serverless function triggered by CloudWatch Events
 * 
 * 4. SYSTEM CRON (Linux/Unix)
 * 
 *    Add to crontab:
 *    0 9,14,18 * * * cd /path/to/app && node backend/src/workers/reminderWorker.js
 */

