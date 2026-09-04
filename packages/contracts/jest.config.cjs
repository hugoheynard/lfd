/**
 * 🔴 **Les tests tournent en UTC, délibérément.**
 *
 * Le conteneur de production tourne en UTC, et c'est ce qui a laissé passer un
 * `orderCutoffInstant` construit dans le fuseau du process : sur un poste réglé
 * sur Paris, il donnait la bonne heure, et seulement là. Aligner le runner sur
 * la production fait échouer ici ce qui échouerait là-bas.
 *
 * Posé avant l'export : Jest lit `process.env.TZ` au démarrage des workers.
 */
process.env.TZ = "UTC";

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  rootDir: "./",
  displayName: "contracts",
  testMatch: ["**/?(*.)+(spec|test).ts"],
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
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
};
