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

// Robust CORS setup with preflight support and credentials
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
const corsOptions = {
  origin: function(origin, callback) {
    // Allow same-origin or non-browser requests
    if (!origin) return callback(null, true);
    // If no explicit allowlist, allow any origin (useful for dev)
    if (!allowedOrigins.length) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET','HEAD','PUT','PATCH','POST','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  exposedHeaders: ['Content-Length'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
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


