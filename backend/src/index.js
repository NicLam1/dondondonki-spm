require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const routes = require('./routes');
const logger = require('./utils/logger');
const { env } = require('./config/env');

const app = express();

app.use(cors({ origin: env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', routes);

const port = env.PORT || 4000;
app.listen(port, () => {
  logger.info(`API server listening on port ${port}`);
});


