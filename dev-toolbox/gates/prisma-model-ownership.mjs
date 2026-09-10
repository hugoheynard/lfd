#!/usr/bin/env node
/**
 * Gate : **un modèle a UN propriétaire, et lui seul le lit.**
 *
 * ## Le trou que cette porte ferme
 *
 * `lint:context-boundaries` lit le **graphe d'imports**. `lint:cross-schema-join`
 * lit le **SQL écrit à la main**. Aucune des deux ne voit une classe qui
 * interroge en Prisma direct les tables d'un bloc qui n'est pas le sien —
 * `PrismaService` est une brique technique, donc l'importer ne trahit rien, et
 * `prisma.user.findUnique()` n'est pas du SQL.
 *
 * `CLAUDE.md` le dit deux fois, en toutes lettres : « une frontière qu'on ne
 * franchit qu'en SQL est franchie quand même », et « c'est arrivé deux fois ».
 * Cette porte est la troisième, celle qui manquait.
 *
 * ## Comment la propriété est établie — dérivée, jamais écrite à la main
 *
 * **Le propriétaire d'un modèle est le bloc qui l'ÉCRIT.** Une table peut être
 * lue de plusieurs endroits sans dommage ; elle ne peut avoir qu'un auteur, et
 * cet auteur est celui qui en porte les invariants.
 *
 * C'est ce qui rend cette porte tenable : rien à maintenir. Un modèle ajouté au
 * schéma est classé le jour où quelqu'un l'écrit, sans qu'aucune liste ne bouge.
 * `lint:cross-schema-join` a fait le chemin inverse — il recopiait la liste des
 * schémas, elle est devenue fausse, et il la LIT désormais dans le `datasource`.
 *
 * Un modèle qu'aucun bloc n'écrit — une table alimentée par migration, ou lue
 * seule — n'a pas de propriétaire : la porte se tait plutôt que d'en inventer un.
 *
 * ## Ce que cette porte NE tient pas
 *
 * Elle ne rend pas la frontière **impossible** : une seule base, une seule URL,
 * un seul client Prisma. Une jointure `b2b → pim` marcherait toujours. Elle la
 * rend **visible**, ce qui est le cran au-dessus de la relecture et le cran en
 * dessous de l'interdiction — cf. la hiérarchie des garde-fous.
 *
 * Usage : `pnpm lint:prisma-model-ownership` (branché dans `lint:gates`).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_ROOT = "apps/lfd-api/src";
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".turbo",
  // Le client Prisma GÉNÉRÉ. Ses JSDoc sont pleins d'exemples
  // `prisma.user.findMany()` qui ne sont l'accès de personne.
  "client",
  // Les tests montent ce qu'ils éprouvent : un e2e qui sème une commande écrit
  // dans les tables de tous les blocs, et c'est son travail.
  "__tests__",
]);

/**
 * **Les blocs**, tels que `src/` les dessine. La matrice de `CLAUDE.md` porte
 * sur eux, et cette porte aussi : deux contextes d'un même bloc qui partagent
 * une table sont un sujet de découpe interne, pas de frontière.
 */
const BLOCKS = new Set(["staff", "pim", "b2b", "production", "handover", "platform"]);

/**
 * **Ce qui n'est pas un bloc**, et pourquoi chacun est hors sujet.
 *
 * - `dev/` — le semis. Il écrit dans toutes les tables par définition ; le
 *   compter en ferait le propriétaire de tout le dépôt.
 * - `appBootstrap/` — la racine de composition, seule autorisée à connaître
 *   tout le monde.
 * - `ops/` — les sondes d'exploitation, qui lisent pour surveiller et n'ont
 *   d'invariant sur rien.
 */
const NOT_A_BLOCK = new Set(["dev", "appBootstrap", "ops"]);

const WRITE =
  /\bprisma\s*\.\s*([a-z][A-Za-z0-9]*)\s*\.\s*(?:create|createMany|update|updateMany|upsert|delete|deleteMany|createManyAndReturn)\b/gu;
const READ = /\bprisma\s*\.\s*([a-z][A-Za-z0-9]*)\s*\.\s*(?:find\w*|count|aggregate|groupBy)\b/gu;

/**
 * **Les accès hors bloc encore tolérés**, chacun avec sa raison et sa date.
 *
 * La liste ne peut que **décroître** : un accès qui n'y figure pas échoue, et
 * une entrée qui a cessé d'exister échoue aussi. C'est le même contrat que
 * `lint:code-language` et `lint:no-type-escapes`.
 */
const DEROGATIONS = [
  {
    model: "staffUser",
    block: "b2b",
    // 2026-09-09 — La matrice AUTORISE `b2b → staff` (autorisation). Ce qui est
    // en cause n'est donc pas la direction mais le MOYEN : deux fichiers lisent
    // la table au lieu de passer par un port du bloc staff.
    //   b2b/growth/infrastructure/prisma-actor-namer.ts   — nommer l'acte
    //   b2b/account/infrastructure/prisma-staff-directory.ts — la fiche staff
    // Les deux ne lisent qu'un nom et un rôle : un port de lecture d'annuaire
    // les couvrirait tous les deux. À faire quand `staff/directory` en exposera
    // un ; pas avant, sous peine d'un port taillé pour un seul appelant.
    raison:
      "b2b lit l'annuaire staff en direct — direction autorisée, moyen à corriger (2026-09-09)",
  },
];

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return SKIP_DIRS.has(entry.name) ? [] : sourceFiles(path);
    }
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

/** Commentaires et imports retirés : ni l'un ni l'autre n'accède à une table. */
function withoutNoise(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^\s*\/\/.*$/gmu, "")
    .replace(/^import[\s\S]*?;$/gmu, "");
}

const root = join(ROOT, SCAN_ROOT);
if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`✗ prisma-model-ownership : ${SCAN_ROOT} introuvable.`);
  process.exit(1);
}

/** modèle → bloc → { writes, reads, exemples de fichiers } */
const usage = new Map();
for (const file of sourceFiles(root)) {
  const rel = relative(ROOT, file).split("\\").join("/");
  const inSrc = rel.slice(`${SCAN_ROOT}/`.length);
  const top = inSrc.split("/")[0];
  if (NOT_A_BLOCK.has(top) || !BLOCKS.has(top)) {
    continue;
  }
  const source = withoutNoise(readFileSync(file, "utf8"));
  const note = (model, kind) => {
    if (!usage.has(model)) {
      usage.set(model, new Map());
    }
    const blocks = usage.get(model);
    const seen = blocks.get(top) ?? { writes: 0, reads: 0, files: new Set() };
    seen[kind] += 1;
    seen.files.add(rel);
    blocks.set(top, seen);
  };
  for (const match of source.matchAll(WRITE)) {
    note(match[1], "writes");
  }
  for (const match of source.matchAll(READ)) {
    note(match[1], "reads");
  }
}

const declared = new Set(DEROGATIONS.map((entry) => `${entry.model}@${entry.block}`));
const used = new Set();
const disowned = [];
const trespassing = [];

for (const [model, blocks] of [...usage].sort(([a], [b]) => a.localeCompare(b))) {
  const writers = [...blocks].filter(([, seen]) => seen.writes > 0).map(([block]) => block);
  if (writers.length > 1) {
    disowned.push({ model, writers, blocks });
    continue;
  }
  const owner = writers[0];
  if (owner === undefined) {
    // Personne ne l'écrit : aucune propriété à faire respecter.
    continue;
  }
  for (const [block, seen] of blocks) {
    if (block === owner) {
      continue;
    }
    const key = `${model}@${block}`;
    if (declared.has(key)) {
      used.add(key);
      continue;
    }
    trespassing.push({ model, owner, block, files: [...seen.files] });
  }
}

const stale = [...declared].filter((key) => !used.has(key));

if (disowned.length > 0 || trespassing.length > 0 || stale.length > 0) {
  console.error("\n✗ prisma-model-ownership\n");
  for (const { model, writers } of disowned) {
    console.error(
      `  ${model} — ÉCRIT par ${writers.join(" ET ")} : deux auteurs, aucun propriétaire`,
    );
  }
  for (const { model, owner, block, files } of trespassing) {
    console.error(`  ${model} appartient à « ${owner} » — lu par « ${block} »`);
    for (const file of files) {
      console.error(`      ${file}`);
    }
  }
  for (const key of stale) {
    console.error(`  ${key} — dérogation déclarée qui n'existe plus : la retirer`);
  }
  console.error(
    "\n  Un bloc qui lit la table d'un autre a franchi une frontière que ni le\n" +
      "  graphe d'imports ni la porte des schémas ne voient. Le remède est un\n" +
      "  PORT : le bloc qui a besoin déclare, celui qui possède fournit,\n" +
      "  `appBootstrap` relie. Cf. `ImpersonationSubjects`, posé le 2026-09-09\n" +
      "  pour exactement ce motif.\n",
  );
  process.exit(1);
}

console.log(
  `✓ prisma-model-ownership : ${String(usage.size)} modèle(s), chacun lu par son seul propriétaire.`,
);
if (DEROGATIONS.length > 0) {
  console.log(`  Dérogations déclarées : ${String(DEROGATIONS.length)} — en baisse seulement.`);
}
