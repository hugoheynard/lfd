/** @type {import('jest').Config} */
// Mirrors the proven SH3PHERD backend jest setup: NodeNext source, tests
// transpiled to CommonJS via tsconfig.test.json. The `.js` moduleNameMapper
// strips the extension NodeNext relative imports carry, so ESM-style imports
// resolve under the CJS test runtime. No MongoMemoryServer globalSetup here —
// added if/when the backend grows an E2E DB harness.
module.exports = {
  testEnvironment: 'node',
  rootDir: './',
  displayName: 'chevallot-pim-backend',
  // Suppress console noise during tests. Failures still surface.
  silent: true,
  testMatch: ['**/?(*.)+(spec|test|e2e-spec).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: './tsconfig.test.json',
      },
    ],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testTimeout: 30_000,
};
