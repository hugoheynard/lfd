/** @type {import('jest').Config} */
// Config **isolée** des e2e Shopify live. Elle ne matche QUE les fichiers
// `*.shopify-live.ts` — jamais capturés par le `testMatch` unitaire
// (`spec|test|e2e-spec`), donc jamais joués par `pnpm test` ni la CI. Lancée à la
// main via `test:shopify:live`, gated sur `SHOPIFY_LIVE_E2E=1` + identifiants (le
// harnais `describe.skip` sinon). Tape le vrai réseau : timeout large.
module.exports = {
  testEnvironment: 'node',
  rootDir: './',
  displayName: 'lfc-pim-backend:shopify-live',
  testMatch: ['**/*.shopify-live.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
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
