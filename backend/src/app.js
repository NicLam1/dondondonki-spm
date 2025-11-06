const express = require('express');
const morgan = require('morgan');

const routes = require('./routes');
const authRouter = require('./routes/auth');
const logger = require('./utils/logger');
const { env } = require('./config/env');

// Build the express app without binding to a port. This can be used by
// both a long-running server (local/other hosts) and Vercel serverless.
const app = express();

// Explicit CORS handling (safer for serverless)
const allowedOrigins = (env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.length === 0 || allowedOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  const reqAllowedHeaders = req.headers['access-control-request-headers'];
  if (reqAllowedHeaders) {
    // Reflect requested headers for preflight
    res.setHeader('Access-Control-Allow-Headers', reqAllowedHeaders);
    res.setHeader('Vary', 'Origin, Access-Control-Request-Headers');
  } else {
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, Pragma, Accept, Origin');
  }
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});
// Also expose under /api/health for Vercel deployments
app.get('/api/health', (req, res) => {
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


