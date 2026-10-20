const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig.base.json');
module.exports = {
  rootDir: __dirname,
  transform: {
    '^.+\\.[tj]sx?$': [
      'ts-jest',
      {
        tsconfig: {
          ...compilerOptions,
          module: 'commonjs',
          jsx: 'react-jsx',
          allowJs: true,
          incremental: false,
          isolatedModules: true,
        },
        diagnostics: false,
      },
    ],
  },
  moduleNameMapper: {
    '^@gitroom/nestjs-libraries/redis/redis\\.service$':
      '<rootDir>/tests/ai-text/redis.module.ts',
    ...pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/' }),
    '^isomorphic-dompurify$': '<rootDir>/tests/ai-text/dompurify.cjs',
  },
  setupFiles: ['<rootDir>/tests/ai-text/network.preload.cjs'],
  setupFilesAfterEnv: ['<rootDir>/tests/ai-text/setup.ts'],
};
