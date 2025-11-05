const request = require('supertest');
const { createTestApp } = require('../utils/createTestApp');

describe('GET /api/users', () => {
  const app = createTestApp();

  test('returns ordered list of users', async () => {
    global.supabaseMock.tables.users.push(
      {
        user_id: 2,
        email: 'second@example.com',
        full_name: 'Second User',
        role: 'member',
        access_level: 'Team',
        team_id: 5,
        department_id: 3,
        created_at: '2025-10-01T12:00:00.000Z',
      },
      {
        user_id: 1,
        email: 'first@example.com',
        full_name: 'First User',
        role: 'admin',
        access_level: 'Org',
        team_id: 2,
        department_id: 1,
        created_at: '2025-09-01T09:00:00.000Z',
      }
    );

    const response = await request(app).get('/api/users');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: [
        expect.objectContaining({ user_id: 1, email: 'first@example.com' }),
        expect.objectContaining({ user_id: 2, email: 'second@example.com' }),
      ],
    });
  });

  test('handles Supabase errors', async () => {
    const originalFrom = global.supabaseMock.from;
    global.supabaseMock.from = jest.fn(() => ({
      select: () => ({
        order: async () => ({ data: null, error: { message: 'boom' } }),
      }),
    }));

    const response = await request(app).get('/api/users');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'boom' });

    global.supabaseMock.from = originalFrom;
  });

  test('returns empty array when no users exist', async () => {
    const response = await request(app).get('/api/users');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [] });
  });

  test('queries Supabase with expected column selection and ordering', async () => {
    const orderMock = jest.fn(async () => ({ data: [], error: null }));
    const selectSpy = jest.fn(() => ({
      order: orderMock,
    }));
    const fromSpy = jest.fn(() => ({ select: selectSpy }));

    const originalFrom = global.supabaseMock.from;
    global.supabaseMock.from = fromSpy;

    await request(app).get('/api/users');

    expect(fromSpy).toHaveBeenCalledWith('users');
    expect(selectSpy).toHaveBeenCalledWith('user_id, email, full_name, role, access_level, team_id, department_id, created_at');
    expect(orderMock).toHaveBeenCalledWith('user_id');

    global.supabaseMock.from = originalFrom;
  });
});
