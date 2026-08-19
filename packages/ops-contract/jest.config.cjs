/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  rootDir: "./",
  displayName: "ops-contract",
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
