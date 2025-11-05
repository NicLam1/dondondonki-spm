jest.mock('passport', () => ({
  authenticate: jest.fn(),
}), { virtual: true });

const passport = require('passport');
const { requireAuth } = require('../../../backend/src/middleware/auth');

describe('middleware/requireAuth', () => {
  it('delegates to passport jwt strategy without sessions', () => {
    const handler = jest.fn();
    passport.authenticate.mockReturnValue(handler);

    const req = { headers: { authorization: 'Bearer token' } };
    const res = {};
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(passport.authenticate).toHaveBeenCalledWith('jwt', { session: false });
    expect(handler).toHaveBeenCalledWith(req, res, next);
  });
});
