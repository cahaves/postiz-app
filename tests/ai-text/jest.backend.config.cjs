module.exports = {
  ...require('../../jest.preset'),
  displayName: 'backend',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/ai-text/backend*.spec.ts'],
};
