const { Router } = require('express');
const passport = require('passport');

const router = Router();

router.get('/me', passport.authenticate('jwt', { session: false }), (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;


