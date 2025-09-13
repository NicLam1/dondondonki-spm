const passport = require('passport');

function requireAuth(req, res, next) {
  return passport.authenticate('jwt', { session: false })(req, res, next);
}

module.exports = { requireAuth };


