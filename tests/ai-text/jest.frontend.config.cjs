module.exports = {
  ...require('../../jest.preset'),
  displayName: 'frontend',
  testEnvironment: 'jsdom',
  testMatch: [
    '<rootDir>/tests/ai-text/*.spec.ts',
    '<rootDir>/tests/ai-text/*.spec.tsx',
  ],
  testPathIgnorePatterns: ['/backend[^/]*\\.spec\\.ts$'],
};
