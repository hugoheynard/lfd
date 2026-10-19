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
module.exports = {
  ...base,
  displayName: "lfd-api:unit",
  // Un worker Jest garde en mémoire chaque module qu'il a chargé, et grossit
  // fichier après fichier : sur la CI (ubuntu-latest), les tests unitaires
  // ont été coupés deux fois par GitHub vers la 12e minute, sans test rouge
  // (2026-10-07). Au-delà de ce seuil, le worker est remplacé entre deux fichiers.
  workerIdleMemoryLimit: "1536MB",
  // 75 % des cœurs, écrit plutôt que laissé au défaut (cœurs − 1), mesuré le
  // 2026-10-19 sur la suite entière (10 749 tests, M1 Pro 10 cœurs) :
  // défaut (9 workers) 76 s, 75 % (7) 69 s, 3 workers 100 s. Sur un runner
  // GitHub `ubuntu-latest` d'un dépôt public (4 vCPU, 16 Go), 75 % donne
  // 3 workers — ce que la CI prenait déjà. Plafond mémoire : 3 × ~1,5 Go
  // avant recyclage, loin des 16 Go. Ce qui gonfle un worker : une spec
  // d'application laisse ~47 Mo de tas par fichier, une spec de domaine ~15 Mo
  // (mesure en série avec `--expose-gc`, le tas net, lui, ne monte que de 274 Mo :
  // pas de fuite). Hypothèse NON prouvée : les handlers importent
  // `@nestjs/cqrs` (627 modules CommonJS), que chaque fichier réévalue.
  maxWorkers: "75%",
  testMatch: ["<rootDir>/**/?(*.)+(spec|test).ts"],
};
