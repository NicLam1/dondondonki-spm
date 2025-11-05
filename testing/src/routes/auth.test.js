const request = require('supertest');
const { createTestApp } = require('../utils/createTestApp');

describe('Auth routes', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    global.supabaseMock.auth.signOut.mockResolvedValue({ data: {}, error: null });
    global.supabaseMock.auth.signUp.mockResolvedValue({
      data: { user: { id: 'mock-user-id', email: 'new@example.com' } },
      error: null,
    });
    global.supabaseMock.auth.signInWithPassword.mockResolvedValue({
      data: {
        session: { access_token: 'token-123' },
        user: { id: 'mock-user-id', email: 'existing@example.com' },
      },
      error: null,
    });
    global.supabaseMock.auth.updateUser.mockResolvedValue({
      data: { user: { id: 'mock-user-id' } },
      error: null,
    });
  });

  it('POST /api/auth/signout succeeds', async () => {
    const response = await request(app).post('/api/auth/signout');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Signed out successfully' });
    expect(global.supabaseMock.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('POST /api/auth/signout handles errors', async () => {
    global.supabaseMock.auth.signOut.mockResolvedValueOnce({
      data: null,
      error: { message: 'Cannot sign out' },
    });

    const response = await request(app).post('/api/auth/signout');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Cannot sign out' });
  });

  it('POST /api/auth/signup creates auth user and profile', async () => {
    const payload = {
      email: 'fresh@example.com',
      password: 'Secret123!',
      full_name: 'Fresh Person',
      role: 'member',
      access_level: 0,
    };

    const response = await request(app).post('/api/auth/signup').send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      user: { id: 'mock-user-id', email: 'new@example.com' },
    });
    expect(global.supabaseMock.auth.signUp).toHaveBeenCalledWith({
      email: payload.email,
      password: payload.password,
    });
    expect(global.supabaseMock.tables.users).toContainEqual(
      expect.objectContaining({
        email: payload.email,
        full_name: payload.full_name,
        role: payload.role,
        access_level: payload.access_level,
      })
    );
  });

  it('POST /api/auth/signup surfaces auth errors', async () => {
    global.supabaseMock.auth.signUp.mockResolvedValueOnce({
      data: null,
      error: { message: 'Email already taken' },
    });

    const response = await request(app)
      .post('/api/auth/signup')
      .send({
        email: 'fresh@example.com',
        password: 'Secret123!',
        full_name: 'Fresh Person',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Email already taken' });
    expect(global.supabaseMock.tables.users).toHaveLength(0);
  });

  it('POST /api/auth/signup uses default message when auth error lacks details', async () => {
    global.supabaseMock.auth.signUp.mockResolvedValueOnce({
      data: null,
      error: {},
    });

    const response = await request(app)
      .post('/api/auth/signup')
      .send({
        email: 'fresh@example.com',
        password: 'Secret123!',
        full_name: 'Fresh Person',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Failed to create user in Supabase Auth.' });
  });

  it('POST /api/auth/signup handles RLS profile insert failures gracefully', async () => {
    const payload = {
      email: 'blocked@example.com',
      password: 'Secret123!',
      full_name: 'Blocked User',
      role: 'member',
      access_level: 0,
    };

    const originalFrom = global.supabaseMock.from;
    const insertMock = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'Row-level security violation detected' },
    });
    global.supabaseMock.from = jest.fn(() => ({ insert: insertMock }));

    const response = await request(app).post('/api/auth/signup').send(payload);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Signup failed due to database permissions. Please contact support.',
    });
    expect(insertMock).toHaveBeenCalledTimes(1);

    global.supabaseMock.from = originalFrom;
  });

  it('POST /api/auth/signup reports duplicate profile rows', async () => {
    const payload = {
      email: 'duplicate@example.com',
      password: 'Secret123!',
      full_name: 'Duplicate User',
      role: 'member',
      access_level: 0,
    };

    const originalFrom = global.supabaseMock.from;
    const insertMock = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "users_email_key"' },
    });
    global.supabaseMock.from = jest.fn(() => ({ insert: insertMock }));

    const response = await request(app).post('/api/auth/signup').send(payload);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'This email is already registered in the users table.',
    });

    global.supabaseMock.from = originalFrom;
  });

  it('POST /api/auth/signup propagates generic profile insertion errors', async () => {
    const payload = {
      email: 'generic@example.com',
      password: 'Secret123!',
      full_name: 'Generic Failure',
      role: 'member',
      access_level: 0,
    };

    const originalFrom = global.supabaseMock.from;
    const insertMock = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'Unexpected failure' },
    });
    global.supabaseMock.from = jest.fn(() => ({ insert: insertMock }));

    const response = await request(app).post('/api/auth/signup').send(payload);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Unexpected failure' });

    global.supabaseMock.from = originalFrom;
  });

  it('POST /api/auth/signup skips profile insert when Supabase returns no user id', async () => {
    const payload = {
      email: 'nouserid@example.com',
      password: 'Secret123!',
      full_name: 'No Id User',
      role: 'member',
      access_level: 0,
    };

    const fromSpy = jest.spyOn(global.supabaseMock, 'from');
    global.supabaseMock.auth.signUp.mockResolvedValueOnce({
      data: {},
      error: null,
    });

    const response = await request(app).post('/api/auth/signup').send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user: {} });
    expect(fromSpy).not.toHaveBeenCalled();

    fromSpy.mockRestore();
  });

  it('POST /api/auth/signup falls back to default profile error message', async () => {
    const payload = {
      email: 'fallback@example.com',
      password: 'Secret123!',
      full_name: 'Fallback User',
      role: 'member',
      access_level: 0,
    };

    const originalFrom = global.supabaseMock.from;
    const insertMock = jest.fn().mockResolvedValue({
      data: null,
      error: {},
    });
    global.supabaseMock.from = jest.fn(() => ({ insert: insertMock }));

    const response = await request(app).post('/api/auth/signup').send(payload);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Failed to create user profile.' });

    global.supabaseMock.from = originalFrom;
  });

  it('POST /api/auth/signin returns session and profile', async () => {
    const profileRow = {
      user_id: 42,
      email: 'existing@example.com',
      full_name: 'Existing User',
      role: 'manager',
    };
    global.supabaseMock.tables.users.push(profileRow);

    const response = await request(app)
      .post('/api/auth/signin')
      .send({ email: 'existing@example.com', password: 'Secret123!' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      session: { access_token: 'token-123' },
      user: { id: 'mock-user-id', email: 'existing@example.com' },
      profile: profileRow,
    });
    expect(global.supabaseMock.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'existing@example.com',
      password: 'Secret123!',
    });
  });

  it('POST /api/auth/signin handles auth failures', async () => {
    global.supabaseMock.auth.signInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { message: 'Invalid credentials' },
    });

    const response = await request(app)
      .post('/api/auth/signin')
      .send({ email: 'missing@example.com', password: 'Bad' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid credentials' });
  });

  it('POST /api/auth/signin handles missing profile', async () => {
    const originalFrom = global.supabaseMock.from;
    global.supabaseMock.from = jest.fn((table) => {
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: null, error: { message: 'No profile' } }),
            }),
          }),
        };
      }
      return originalFrom(table);
    });

    const response = await request(app)
      .post('/api/auth/signin')
      .send({ email: 'existing@example.com', password: 'Secret123!' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'No profile' });

    global.supabaseMock.from = originalFrom;
  });

  it('POST /api/auth/change-password succeeds with valid credentials', async () => {
    const response = await request(app)
      .post('/api/auth/change-password')
      .send({
        email: 'existing@example.com',
        old_password: 'OldPass123!',
        new_password: 'NewPass123!',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Password changed successfully.' });
    expect(global.supabaseMock.auth.updateUser).toHaveBeenCalledWith(
      { password: 'NewPass123!' },
      { access_token: 'token-123' }
    );
  });

  it('POST /api/auth/change-password rejects invalid old password', async () => {
    global.supabaseMock.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });

    const response = await request(app)
      .post('/api/auth/change-password')
      .send({
        email: 'existing@example.com',
        old_password: 'wrong',
        new_password: 'NewPass123!',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Old password is incorrect.' });
    expect(global.supabaseMock.auth.updateUser).not.toHaveBeenCalled();
  });

  it('POST /api/auth/change-password validates required fields', async () => {
    const response = await request(app)
      .post('/api/auth/change-password')
      .send({ email: 'existing@example.com', old_password: 'Old', new_password: '' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Email, old password, and new password are required.' });
    expect(global.supabaseMock.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('POST /api/auth/change-password enforces minimum length', async () => {
    const response = await request(app)
      .post('/api/auth/change-password')
      .send({
        email: 'existing@example.com',
        old_password: 'OldPass123!',
        new_password: 'short',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'New password must be at least 8 characters.' });
    expect(global.supabaseMock.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('POST /api/auth/change-password rejects unchanged passwords', async () => {
    const response = await request(app)
      .post('/api/auth/change-password')
      .send({
        email: 'existing@example.com',
        old_password: 'SamePass123!',
        new_password: 'SamePass123!',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'New password must be different from old password.' });
    expect(global.supabaseMock.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(global.supabaseMock.auth.updateUser).not.toHaveBeenCalled();
  });

  it('POST /api/auth/change-password surfaces update errors', async () => {
    global.supabaseMock.auth.updateUser.mockResolvedValueOnce({
      data: null,
      error: { message: 'Update failed' },
    });

    const response = await request(app)
      .post('/api/auth/change-password')
      .send({
        email: 'existing@example.com',
        old_password: 'OldPass123!',
        new_password: 'NewPass123!',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Update failed' });
    expect(global.supabaseMock.auth.updateUser).toHaveBeenCalledWith(
      { password: 'NewPass123!' },
      { access_token: 'token-123' }
    );
  });

  it('POST /api/auth/change-password falls back to default message when update error lacks details', async () => {
    global.supabaseMock.auth.updateUser.mockResolvedValueOnce({
      data: null,
      error: {},
    });

    const response = await request(app)
      .post('/api/auth/change-password')
      .send({
        email: 'existing@example.com',
        old_password: 'OldPass123!',
        new_password: 'NewPass123!',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Failed to change password.' });
  });
});
