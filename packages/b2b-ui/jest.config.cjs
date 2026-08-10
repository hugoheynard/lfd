/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  rootDir: './',
  displayName: 'b2b-ui',
  // Seule la logique **pure** de la lib est testée ici (frise de commande,
  // formats, modèles de formulaire) : les composants Angular sont vérifiés par
  // le build AOT de chaque app consommatrice, qui type-check leurs gabarits.
  testMatch: ['**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: './tsconfig.test.json' }],
  },
};
