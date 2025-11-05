require('dotenv').config();

const app = require('./app');
const logger = require('./utils/logger');
const { env } = require('./config/env');
const { checkAndSendReminders, checkAndSendOverdueNotifications } = require('./services/reminderService');

// Optional background schedulers for non-serverless environments only.
// Enable by setting ENABLE_SCHEDULERS=true
if (process.env.ENABLE_SCHEDULERS === 'true') {
  // Start reminder checker (every 1 hour by default)
  if (!global.__reminderIntervalStarted) {
    const reminderInterval = Number(process.env.REMINDER_CHECK_INTERVAL_MS || 60 * 60 * 1000);
    console.log(`🔔 Starting reminder service (every ${reminderInterval/1000} seconds)`);
    setInterval(async () => {
      try {
        await checkAndSendReminders();
      } catch (error) {
        console.error('❌ Reminder service error:', error);
      }
    }, reminderInterval);
    setTimeout(async () => {
      console.log('🔔 Running initial reminder check...');
      await checkAndSendReminders();
    }, 5000);
    global.__reminderIntervalStarted = true;
  }

  // Overdue checker (default every 30 seconds)
  if (!global.__overdueIntervalStarted) {
    const overdueInterval = Number(process.env.OVERDUE_CHECK_INTERVAL_MS || 30000);
    console.log(`🚨 Starting overdue checker (every ${overdueInterval/1000} seconds)`);
    setInterval(async () => {
      try {
        await checkAndSendOverdueNotifications();
      } catch (error) {
        console.error('❌ Overdue service error:', error);
      }
    }, overdueInterval);
    setTimeout(async () => {
      console.log('🚨 Running initial overdue check...');
      await checkAndSendOverdueNotifications();
    }, 8000);
    global.__overdueIntervalStarted = true;
  }
}

const port = env.PORT || 4000;
app.listen(port, () => {
  logger.info(`API server listening on port ${port}`);
});


