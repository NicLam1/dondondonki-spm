jest.mock(
  'ioredis',
  () => {
    return jest.fn(() => ({ kind: 'redis-connection' }));
  },
  { virtual: true }
);

const queueInstances = [];
const workerInstances = [];

jest.mock(
  'bullmq',
  () => {
    return {
      Queue: jest.fn((name, options) => {
        const instance = { name, options };
        queueInstances.push(instance);
        return instance;
      }),
      Worker: jest.fn((name, processor, options) => {
        const instance = { name, processor, options };
        workerInstances.push(instance);
        return instance;
      }),
    };
  },
  { virtual: true }
);
jest.unmock('../../../backend/src/services/queue');

let IORedis;
let Queue;
let Worker;

describe('services/queue', () => {
  const redisUrl = 'redis://test-host:6379';

  beforeEach(() => {
    jest.resetModules();
    queueInstances.length = 0;
    workerInstances.length = 0;
    process.env.REDIS_URL = redisUrl;
    IORedis = require('ioredis');
    ({ Queue, Worker } = require('bullmq'));
    Queue.mockClear();
    Worker.mockClear();
    IORedis.mockClear();
  });

  it('initializes queue with shared redis connection', () => {
    let moduleExports;
    jest.isolateModules(() => {
      moduleExports = require('../../../backend/src/services/queue');
    });
    const { inAppNotificationsQueue } = moduleExports;

    expect(IORedis).toHaveBeenCalledWith(redisUrl);
    expect(Queue).toHaveBeenCalledWith('in-app-notifications', {
      connection: { kind: 'redis-connection' },
    });
    expect(queueInstances[0]).toBe(inAppNotificationsQueue);
  });

  it('creates workers using same connection', () => {
    let moduleExports;
    jest.isolateModules(() => {
      moduleExports = require('../../../backend/src/services/queue');
    });
    const { createNotificationWorker } = moduleExports;
    const processor = jest.fn();

    const worker = createNotificationWorker(processor);

    expect(Worker).toHaveBeenCalledWith('in-app-notifications', processor, {
      connection: { kind: 'redis-connection' },
    });
    expect(worker).toBe(workerInstances[0]);
  });
});
