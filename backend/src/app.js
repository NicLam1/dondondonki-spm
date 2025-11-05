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

// Mount API routes at '/api' by default. This ensures that when the app
// is served behind Vercel's /api/* function path, the Express routes match
// the incoming URLs like '/api/health' and '/api/tasks'.
const apiBasePath = process.env.API_BASE_PATH || '/api';

// Main routes
app.use(apiBasePath, routes);

// Auth routes under `${base}/auth`
app.use(`${apiBasePath}/auth`, authRouter);

// Export the app for reuse (Node server or Vercel function)
module.exports = app;


