process.env.JEST_JUNIT_OUTPUT_DIR = `${__dirname}/coverage/junit`;
export default {
  projects: [
    '<rootDir>/tests/ai-text/jest.backend.config.cjs',
    '<rootDir>/tests/ai-text/jest.frontend.config.cjs',
  ],
};
