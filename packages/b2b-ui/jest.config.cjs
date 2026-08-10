// Fuseau ÉPINGLÉ, avant tout chargement de test.
//
// La lib formate les instants en heure LOCALE (`toLocaleTimeString('fr-FR')`),
// et c'est le bon comportement produit : une boulangerie parisienne lit
// « 14:32 ». Mais une assertion sur cette chaîne dépend alors de la machine —
// verte ici, rouge sur un runner CI en UTC où le même instant s'écrit « 12:32 ».
//
// On épingle le fuseau plutôt que d'assouplir les assertions : un test qui n'a
// plus le droit de nommer l'heure attendue ne vérifie plus grand-chose. Posé
// ici et pas dans le script npm, pour valoir aussi depuis l'IDE.
process.env.TZ = 'Europe/Paris';

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
