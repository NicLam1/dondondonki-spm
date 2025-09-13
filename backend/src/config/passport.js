const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const passport = require('passport');
const { env } = require('./env');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

module.exports = function configurePassport() {
  const opts = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: env.JWT_SECRET,
  };

  passport.use(
    new JwtStrategy(opts, async (jwtPayload, done) => {
      try {
        // Example: fetch user by id from Supabase
        const { data, error } = await supabase
          .from('users')
          .select('id, email, role')
          .eq('id', jwtPayload.sub)
          .single();
        if (error) return done(null, false);
        if (!data) return done(null, false);
        return done(null, data);
      } catch (err) {
        return done(err, false);
      }
    })
  );
};


