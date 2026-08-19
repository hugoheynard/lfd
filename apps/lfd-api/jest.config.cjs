/** @type {import('jest').Config} */
// Backend ESM + client Prisma généré ESM (`import.meta`) → tests en ESM :
// ts-jest `useESM`, `.ts` traités en modules ES, `--experimental-vm-modules`
// côté Node (voir le script `test`). `moduleNameMapper` retire l'extension `.js`
// des imports relatifs NodeNext pour que Jest résolve la source TS.
module.exports = {
  testEnvironment: 'node',
  // 🔴 UN SEUL worker, et ce n'est pas une préférence de vitesse.
  //
  // Toutes les suites e2e partagent LA MÊME base jetable (`lfc_b2b_test`) et la
  // tronquent entre les cas. Deux suites en parallèle s'effacent donc leurs
  // fixtures l'une l'autre : un staff semé par l'une n'existe plus quand l'autre
  // l'interroge, et le mur d'accès refuse — un 403 parfaitement légitime, sur un
  // utilisateur qui aurait dû exister. Le symptôme est spectaculaire (des
  // dizaines d'échecs, quelques rescapés) et ne ressemble pas à sa cause.
  //
  // Posé ICI et pas seulement en `--runInBand` dans le script npm : un clic
  // droit « Run » depuis l'IDE ne passe pas par le script, et retombait donc
  // dans le piège.
  maxWorkers: 1,
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
