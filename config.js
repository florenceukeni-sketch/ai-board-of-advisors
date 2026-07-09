'use strict';

const path = require('path');

module.exports = {
  MODEL: 'claude-sonnet-4-20250514',
  MAX_TOKENS_IND: 1000,
  MAX_TOKENS_BRD: 800,
  PORT: process.env.PORT || 3000,
  DATA_DIR: path.join(__dirname, 'data')
};
