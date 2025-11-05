const express = require('express');
const routes = require('../../../backend/src/routes');
const authRouter = require('../../../backend/src/routes/auth');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api', routes);
  app.use('/api/auth', authRouter);
  return app;
}

module.exports = { createTestApp };
