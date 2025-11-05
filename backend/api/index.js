// Vercel serverless function entry for the backend API
// We reuse the Express app and export it as the handler.
const app = require('../src/app');

module.exports = app;


