const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const { env } = require('../config/env');

const connection = new IORedis(env.REDIS_URL);

const inAppNotificationsQueue = new Queue('in-app-notifications', {
  connection,
});

function createNotificationWorker(processor) {
  return new Worker('in-app-notifications', processor, { connection });
}

module.exports = { inAppNotificationsQueue, createNotificationWorker };


