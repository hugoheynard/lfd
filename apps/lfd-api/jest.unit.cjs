const base = require("./jest.base.cjs");

/** @type {import('jest').Config} */
// LES UNITAIRES — TOUT ce qui n'est pas une e2e.
//
// Elles ne touchent NI Postgres NI le stockage objet : leurs ports sont
// doublés. C'est ce qui les rend parallélisables, et c'est la seule raison —
// vérifié le 2026-08-29, aucune de ces specs n'ouvre `new PrismaClient`, ne
// passe par `e2e-harness` ni par `setup-test-database`.
//
// Le motif dit « tout sauf e2e » et NON « tout ce qui est sous src/ » : écrit
// à l'envers, il laissait `container/__tests__/` hors des DEUX configurations —
// deux specs qui ne tournaient plus nulle part, et une CI verte pour le dire.
// Une partition se définit par ce qu'elle exclut, jamais par ce qu'elle
// énumère.
//
// ⚠️ Si un jour une de ces specs a besoin d'une vraie base, elle ne reste PAS
// ici : elle devient une e2e, prend le suffixe `.e2e-spec.ts` et descend dans
// `test/`. Lever ce mur en douce
// ramènerait exactement la course que `jest.e2e.cjs` décrit, mais sans le
// commentaire qui l'explique.
//
// Pas de `maxWorkers` : Jest prend les cœurs disponibles.
module.exports = {
  ...base,
  displayName: "lfd-api:unit",
  testMatch: ["<rootDir>/**/?(*.)+(spec|test).ts"],
};
