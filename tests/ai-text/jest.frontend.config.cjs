module.exports = {
  ...require('../../jest.preset'),
  displayName: 'frontend',
  testEnvironment: '<rootDir>/tests/ai-text/jsdom.environment.cjs',
  testMatch: [
    '<rootDir>/tests/ai-text/*.spec.ts',
    '<rootDir>/tests/ai-text/*.spec.tsx',
  ],
  testPathIgnorePatterns: ['/backend[^/]*\\.spec\\.ts$'],
};
