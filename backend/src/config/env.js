const required = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY'
];

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 4000,
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  JWT_SECRET: process.env.JWT_SECRET,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM || 'no-reply@example.com',
};

function validateEnv() {
  const missing = required.filter((k) => !env[k]);
  if (missing.length > 0) {
    // Do not throw in test environment
    // Also allow mock mode without Supabase
    if (env.NODE_ENV !== 'test' && process.env.MOCK_API !== 'true') {
      throw new Error(`Missing environment variables: ${missing.join(', ')}`);
    }
  }
}

validateEnv();

module.exports = { env };


