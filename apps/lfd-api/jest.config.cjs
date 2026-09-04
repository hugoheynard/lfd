const base = require("./jest.base.cjs");
const e2e = require("./jest.e2e.cjs");

/** @type {import('jest').Config} */
// LA CONFIGURATION DE L'IDE — et plus rien d'autre.
//
// C'est celle qu'un « Run » par clic droit prend quand on vise un fichier de
// test : elle ramasse les unitaires ET les e2e, pour qu'aucun fichier ne soit
// hors de portée d'un clic.
//
// 🔴 **Elle ne convient qu'à un fichier à la fois.** Lancée sur TOUT, elle fait
// tenir les ~316 suites dans un seul processus — un boot Nest par e2e — et Node
// meurt d'un `heap out of memory` (constaté le 2026-09-04 : exit 137 après
// 8 min, 315 suites vertes et zéro échec, tué en fin de parcours).
//
// Ni la CI ni `pnpm test` ne passent donc par ici : les deux lancent `test:unit`
// puis `test:e2e`, où chaque worker e2e a SA base et SON tas. C'est aussi ce qui
// permet aux 255 specs qui ne touchent aucune base de cesser d'attendre leur
// tour derrière 61 qui en partagent une. Voir `jest.unit.cjs` pour le mur qui
// rend cette séparation vraie, et `jest.e2e.cjs` pour l'isolation par worker.
module.exports = {
  ...base,
  displayName: "lfd-api",
  testMatch: ["**/?(*.)+(spec|test|e2e-spec).ts"],
  maxWorkers: e2e.maxWorkers,
};
