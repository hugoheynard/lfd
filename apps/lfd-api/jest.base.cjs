/** @type {import('jest').Config} */
// LE SOCLE COMMUN aux trois configurations — il ne choisit AUCUN test.
//
// Backend ESM + client Prisma généré ESM (`import.meta`) → tests en ESM :
// `@swc/jest` en sortie ES, `.ts` traités en modules ES, `--experimental-vm-modules`
// côté Node (voir les scripts `test*`). `moduleNameMapper` retire l'extension
// `.js` des imports relatifs NodeNext pour que Jest résolve la source TS.
//
// Ce fichier existe pour qu'un réglage de transpilation ne se recopie pas en
// trois exemplaires : trois copies dérivent, et la dérive se découvre sur un
// test qui échoue dans une configuration et passe dans l'autre.
module.exports = {
  testEnvironment: "node",
  // Le rapporteur par défaut, PLUS le chronomètre par suite : sans lui, une CI
  // qui passe de 7 à 17 minutes ne dit pas LAQUELLE a explosé. Voir
  // `test/slow-suites.reporter.cjs`.
  reporters: ["default", "<rootDir>/test/slow-suites.reporter.cjs"],
  rootDir: "./",
  silent: true,
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  setupFiles: ["<rootDir>/test/setup-env.ts"],
  extensionsToTreatAsEsm: [".ts"],
  // 🔴 `@swc/jest` et non plus ts-jest, depuis le 2026-10-13. ts-jest passait
  // chaque fichier par le compilateur TypeScript, à froid dans chaque worker :
  // en CI, les e2e prenaient ~3× la somme de leurs durées mesurées. swc ne fait
  // que retirer les types — il ne VÉRIFIE rien, et c'est voulu : le typecheck
  // des specs est un job à part (`tsc -p tsconfig.test.json`), qui ne doit
  // jamais disparaître sous prétexte que les tests passent.
  //
  // Les trois réglages qui comptent pour Nest :
  //   · `legacyDecorator` + `decoratorMetadata` — les décorateurs
  //     `experimentalDecorators` et le `design:paramtypes` dont l'injection
  //     par constructeur a besoin. Sans le second, Nest injecte `undefined`
  //     sans erreur de compilation ;
  //   · `keepClassNames` — Nest, le bus CQRS et les messages d'erreur lisent
  //     `constructor.name` ;
  //   · `target: es2022` — celui de `tsconfig.test.json`, d'où la même
  //     sémantique des champs de classe (`useDefineForClassFields`).
  transform: {
    "^.+\\.ts$": [
      "@swc/jest",
      {
        jsc: {
          parser: { syntax: "typescript", decorators: true },
          target: "es2022",
          keepClassNames: true,
          transform: {
            legacyDecorator: true,
            decoratorMetadata: true,
          },
        },
        module: { type: "es6" },
        sourceMaps: "inline",
      },
    ],
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  testTimeout: 30_000,
  // Un chemin FIXE dans le dépôt (ignoré par git) plutôt que le `/tmp` haché
  // par défaut : la CI le restaure d'un run à l'autre (`actions/cache`), et
  // un fichier non modifié n'est plus retranspilé. La clé du cache de swc
  // porte le contenu du fichier et la config : une entrée périmée ne sert
  // jamais, elle occupe seulement de la place.
  cacheDirectory: "<rootDir>/node_modules/.cache/jest",
};
