const { createNotificationWorker } = require('../services/queue');
const logger = require('../utils/logger');

createNotificationWorker(async (job) => {
  const { userId, message } = job.data;
  logger.info(`Notify user ${userId}: ${message}`);
  // TODO: persist notification to Supabase or push via websockets
});


