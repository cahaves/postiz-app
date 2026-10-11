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
    ...pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/' }),
    '^isomorphic-dompurify$': '<rootDir>/tests/ai-text/dompurify.cjs',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/ai-text/setup.ts'],
};
