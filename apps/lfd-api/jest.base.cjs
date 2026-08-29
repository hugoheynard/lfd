/** @type {import('jest').Config} */
// LE SOCLE COMMUN aux trois configurations — il ne choisit AUCUN test.
//
// Backend ESM + client Prisma généré ESM (`import.meta`) → tests en ESM :
// ts-jest `useESM`, `.ts` traités en modules ES, `--experimental-vm-modules`
// côté Node (voir les scripts `test*`). `moduleNameMapper` retire l'extension
// `.js` des imports relatifs NodeNext pour que Jest résolve la source TS.
//
// Ce fichier existe pour qu'un réglage de transpilation ne se recopie pas en
// trois exemplaires : trois copies dérivent, et la dérive se découvre sur un
// test qui échoue dans une configuration et passe dans l'autre.
module.exports = {
  testEnvironment: "node",
  rootDir: "./",
  silent: true,
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  setupFiles: ["<rootDir>/test/setup-env.ts"],
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "./tsconfig.test.json",
      },
    ],
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  testTimeout: 30_000,
};
