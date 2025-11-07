process.env.NODE_ENV = 'test';
process.env.MOCK_API = 'true';

const { createSupabaseMock } = require('./mocks/supabaseClient');

const supabaseMock = createSupabaseMock();

global.supabaseMock = supabaseMock;

jest.mock(
  '@supabase/supabase-js',
  () => ({
    createClient: () => global.supabaseMock,
  }),
  { virtual: true }
);

jest.mock('../../backend/src/services/email', () => ({
  sendMail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../backend/src/services/activityLog.js', () => {
  const actual = jest.requireActual('../../backend/src/services/activityLog.js');
  return {
    ...actual,
    recordTaskActivity: jest.fn(),
    recordMultipleTaskActivities: jest.fn(),
  };
});

jest.mock('../../backend/src/services/emailNotifications.js', () => {
  const actual = jest.requireActual('../../backend/src/services/emailNotifications.js');
  return {
    ...actual,
    notifyTaskAssigned: jest.fn().mockResolvedValue(undefined),
    notifyTaskUnassigned: jest.fn().mockResolvedValue(undefined),
    notifyTaskStatusChange: jest.fn().mockResolvedValue(undefined),
    notifyCommentMentioned: jest.fn().mockResolvedValue(undefined),
  };
});

beforeEach(() => {
  const tables = global.supabaseMock.tables;
  Object.keys(tables).forEach((table) => {
    tables[table].length = 0;
  });
  const sequences = global.supabaseMock.sequences;
  Object.keys(sequences).forEach((key) => {
    sequences[key] = 0;
  });
  if (typeof global.supabaseMock.__clearHooks === 'function') {
    global.supabaseMock.__clearHooks();
  }
  if (global.supabaseMock.storage && typeof global.supabaseMock.storage.__reset === 'function') {
    global.supabaseMock.storage.__reset();
  }
});

afterEach(() => {
  jest.clearAllMocks();
});
