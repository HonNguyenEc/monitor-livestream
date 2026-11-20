const TS_FILES = '^.+\\.ts$';

module.exports = {
  projects: [
    {
      displayName: 'openapi',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/openapi.e2e-spec.ts'],
      // Same Swagger plugin as nest-cli.json, so the document matches the published artifact.
      // The plugin needs a full TypeScript program, so only this project pays for one.
      transform: {
        [TS_FILES]: [
          'ts-jest',
          { astTransformers: { before: ['<rootDir>/test/swagger-plugin.transformer.js'] } },
        ],
      },
    },
    {
      displayName: 'app',
      testEnvironment: 'node',
      roots: ['<rootDir>/src', '<rootDir>/test'],
      testRegex: '\\.(spec|e2e-spec)\\.ts$',
      testPathIgnorePatterns: ['/node_modules/', '<rootDir>/test/openapi.e2e-spec.ts'],
      // Type checking is tsc's job (npm run build / lint); transpile-only keeps the suite fast.
      transform: { [TS_FILES]: ['ts-jest', { tsconfig: { isolatedModules: true } }] },
    },
  ],
};
