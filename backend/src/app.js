const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const routes = require('./routes');
const authRouter = require('./routes/auth');
const logger = require('./utils/logger');
const { env } = require('./config/env');

// Build the express app without binding to a port. This can be used by
// both a long-running server (local/other hosts) and Vercel serverless.
const app = express();

app.use(cors({ origin: env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Mount API routes with a configurable base path.
// In traditional server (local/dev), we keep '/api'. On Vercel, we use '/'
// so that the function deployed at /api forwards subpaths like '/tasks'.
const apiBasePath = process.env.API_BASE_PATH || (process.env.VERCEL ? '/' : '/api');

// Main routes
app.use(apiBasePath, routes);

// Auth routes should live under `${base}/auth`
const authMountPath = apiBasePath === '/' ? '/auth' : `${apiBasePath}/auth`;
app.use(authMountPath, authRouter);

// Export the app for reuse (Node server or Vercel function)
module.exports = app;


