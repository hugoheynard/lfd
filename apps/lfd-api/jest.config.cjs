const base = require("./jest.base.cjs");
const e2e = require("./jest.e2e.cjs");

/** @type {import('jest').Config} */
// LA CONFIGURATION PAR DÉFAUT — tout, en série.
//
// C'est celle qu'un « Run » depuis l'IDE prend quand on clique sur n'importe
// quel fichier de test, et elle reste donc la plus PRUDENTE des trois : elle
// ramasse les unitaires ET les e2e, avec le worker unique des e2e.
//
// La CI, elle, ne passe plus par ici : elle lance `test:unit` et `test:e2e`
// séparément, dans deux jobs, pour que 205 specs qui ne touchent aucune base
// cessent d'attendre leur tour derrière 51 qui en partagent une. Voir
// `jest.unit.cjs` pour le mur qui rend cette séparation vraie.
module.exports = {
  ...base,
  displayName: "lfd-api",
  testMatch: ["**/?(*.)+(spec|test|e2e-spec).ts"],
  maxWorkers: e2e.maxWorkers,
};
