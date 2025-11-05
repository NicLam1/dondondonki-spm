const path = require('path');

module.exports = {
  rootDir: path.resolve(__dirname, '..'),
  testEnvironment: 'node',
  roots: ['<rootDir>/testing/src', '<rootDir>/backend/src'],
  testMatch: ['<rootDir>/testing/src/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/testing/src/testSetup.js'],
  moduleNameMapper: {
    '^@backend/(.*)$': '<rootDir>/backend/src/$1',
  },
  collectCoverageFrom: [
    '<rootDir>/backend/src/routes/**/*.js',
    '<rootDir>/backend/src/services/**/*.js',
    '<rootDir>/backend/src/middleware/**/*.js',
  ],
  coveragePathIgnorePatterns: ['/node_modules/', '<rootDir>/testing/src/'],
  coverageProvider: 'v8',
  transform: {
    '^.+\\.jsx?$': 'babel-jest',
  },
};
