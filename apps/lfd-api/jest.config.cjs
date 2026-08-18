/** @type {import('jest').Config} */
// Backend ESM + client Prisma généré ESM (`import.meta`) → tests en ESM :
// ts-jest `useESM`, `.ts` traités en modules ES, `--experimental-vm-modules`
// côté Node (voir le script `test`). `moduleNameMapper` retire l'extension `.js`
// des imports relatifs NodeNext pour que Jest résolve la source TS.
module.exports = {
  testEnvironment: 'node',
  rootDir: './',
  displayName: 'lfd-api',
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
