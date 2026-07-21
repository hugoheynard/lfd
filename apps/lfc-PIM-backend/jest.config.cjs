/** @type {import('jest').Config} */
// Le backend est ESM (ADR-10) et le client Prisma généré l'est aussi (il utilise
// `import.meta`). Les tests tournent donc en **ESM** : ts-jest en `useESM`,
// `.ts` traités comme modules ES, et `--experimental-vm-modules` côté Node
// (voir le script `test`). Le moduleNameMapper retire l'extension `.js` que
// portent les imports relatifs NodeNext pour que Jest résolve la source TS.
module.exports = {
  testEnvironment: 'node',
  rootDir: './',
  displayName: 'lfc-pim-backend',
  // Suppress console noise during tests. Failures still surface.
  silent: true,
  testMatch: ['**/?(*.)+(spec|test|e2e-spec).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: './tsconfig.test.json',
      },
    ],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testTimeout: 30_000,
};
