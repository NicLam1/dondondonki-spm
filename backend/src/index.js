require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const routes = require('./routes');
const authRouter = require('./routes/auth');
const logger = require('./utils/logger');
const { env } = require('./config/env');
const { checkAndSendReminders, checkAndSendOverdueNotifications } = require('./services/reminderService');

const app = express();

app.use(cors({ origin: env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', routes);
app.use('/api/auth', authRouter);

// Start reminder checker (every 1 hour for testing)
if (!global.__reminderIntervalStarted) {
  const reminderInterval = 60 * 60 * 1000; // 1 hour
  console.log(`🔔 Starting reminder service (checking every ${reminderInterval/1000} seconds)`);

  setInterval(async () => {
    try {
      await checkAndSendReminders();
    } catch (error) {
      console.error('❌ Reminder service error:', error);
    }
  }, reminderInterval);

  // Initial check on startup
  setTimeout(async () => {
    console.log('🔔 Running initial reminder check...');
    await checkAndSendReminders();
  }, 5000); // Wait 5 seconds after startup
  global.__reminderIntervalStarted = true;
}

// Overdue checker: every 30 seconds (configurable via OVERDUE_CHECK_INTERVAL_MS)
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

  // Initial overdue check shortly after startup
  setTimeout(async () => {
    console.log('🚨 Running initial overdue check...');
    await checkAndSendOverdueNotifications();
  }, 8000);
  global.__overdueIntervalStarted = true;
}



const port = env.PORT || 4000;
app.listen(port, () => {
  logger.info(`API server listening on port ${port}`);
});


