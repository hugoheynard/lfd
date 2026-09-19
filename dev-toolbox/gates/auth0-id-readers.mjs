#!/usr/bin/env node
/**
 * Gate : **l'identifiant de connexion stocké en base ne se lit que là où il sert
 * à l'identité — et ne s'écrit jamais dans un message.**
 *
 * `lint:subject-readers` tient le `sub` qui arrive dans le JETON. Celui-ci tient
 * le même identifiant une fois RANGÉ : `staff_users.auth0_id`, `users.auth0_sub`
 * et la table des `sub` de chaque fiche (`staff_subject_aliases`). Relu depuis
 * la base, il peut fuir sans jamais toucher un principal — servi dans une vue,
 * recopié comme auteur, ou écrit dans un log (
 * `documentation/journalisation/architecture-journalisation.md` §12, §8).
 *
 * Deux règles :
 *
 * 1. **Liste admise des lecteurs.** Hors de `platform/auth/` et
 *    `platform/identity/`, seul un fichier inscrit dans `ADMITTED`, avec sa
 *    raison, peut nommer ces colonnes. Un lecteur de plus échoue ; un lecteur
 *    admis qui ne lit plus échoue aussi, pour que la liste se vide au lieu de
 *    mentir.
 * 2. **Jamais dans un message**, même chez un lecteur admis : une interpolation
 *    `${…auth0Id…}` dans un gabarit de chaîne (log, erreur, message) échoue
 *    partout, `platform/` compris. C'est ce qui s'est produit le 2026-09-18 —
 *    « Adresse désynchronisée pour auth0|… » dans le log de production de
 *    `update-staff-user.handler.ts`, dans un fichier qui avait toutes les
 *    raisons de lire la colonne.
 *
 * ## Ce qu'elle voit, et ce qu'elle ne voit pas
 *
 * Une lecture du TEXTE, commentaires retirés : les noms Prisma (`auth0Id`,
 * `auth0Sub`, `staffSubjectAlias`) et SQL (`auth0_id`, `auth0_sub`,
 * `staff_subject_aliases`). Une valeur déjà sortie de la colonne et renommée
 * (`const who = row.auth0Id` puis `${who}`) échappe à la règle 2 — mais le
 * fichier qui fait la première lecture est, lui, dans la liste admise : c'est
 * là qu'on la relit.
 *
 * Les tests ne sont pas lus : un doublé écrit un `sub`, c'est son travail. Le
 * client Prisma généré non plus.
 *
 * Usage : `pnpm lint:auth0-id-readers` (branché dans `lint:gates`).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_ROOT = "apps/lfd-api/src";
const SKIP_DIRS = new Set(["node_modules", "dist", "client", "coverage", ".turbo", "__tests__"]);

/** Les dossiers dont c'est le métier : l'authentification et l'identité. */
const IDENTITY_HOMES = ["apps/lfd-api/src/platform/auth/", "apps/lfd-api/src/platform/identity/"];

const STAFF_DIR = "apps/lfd-api/src/staff/";
const ACCOUNT_DIR = "apps/lfd-api/src/b2b/account/";

/**
 * Les lecteurs admis hors de ces dossiers, **et pourquoi**. Vérifiés le
 * 2026-09-18 en cherchant chaque nom de colonne dans le code (commentaires
 * retirés) de `apps/lfd-api/src`.
 */
const ADMITTED = new Map([
  [
    `${ACCOUNT_DIR}infrastructure/customer-principal.resolver.ts`,
    "rapproche le `sub` prouvé du `User` local — c'est la résolution du principal client",
  ],
  [
    `${ACCOUNT_DIR}infrastructure/prisma-company-member.repository.ts`,
    "rend le `sub` d'un membre pour lui émettre un lien ou propager son adresse chez le fournisseur",
  ],
  [
    `${ACCOUNT_DIR}infrastructure/prisma-pending-access.reader.ts`,
    "le `sub` d'un accès en attente, pour lui fabriquer un lien de mot de passe",
  ],
  [
    `${ACCOUNT_DIR}infrastructure/prisma-impersonation-subjects.ts`,
    "l'impersonation de développement, inerte en production",
  ],
  [
    "apps/lfd-api/src/b2b/orders/infrastructure/prisma-guest-buyer.registrar.ts",
    "`auth0_sub IS NULL` est ce qui FAIT l'invité sans compte",
  ],
  [
    "apps/lfd-api/src/b2b/orders/infrastructure/prisma-guest-order-notice.reader.ts",
    "distingue l'invité (sans `sub`) de la personne qui a un compte",
  ],
  ["apps/lfd-api/src/dev/seeding/client.seed.ts", "le semis de développement crée des comptes"],
  [
    `${STAFF_DIR}directory/domain/staff-user-state.ts`,
    "l'état d'une fiche porte son `sub` pour la seule propagation d'adresse",
  ],
  [
    `${STAFF_DIR}directory/domain/staff-user.repository.ts`,
    "le port de l'annuaire expose le `sub` au même titre",
  ],
  [
    `${STAFF_DIR}directory/infrastructure/prisma-staff-user.repository.ts`,
    "l'annuaire lie une fiche à son identité (`markInvited`) et garde ses `sub` successifs",
  ],
  [`${STAFF_DIR}directory/infrastructure/staff-user.rows.ts`, "la ligne lue par l'annuaire"],
  [
    `${STAFF_DIR}directory/application/update-staff-user.handler.ts`,
    "propage une adresse changée chez le fournisseur, qui ne connaît que le `sub`",
  ],
  [
    `${STAFF_DIR}directory/infrastructure/prisma-staff-author-directory.ts`,
    "nomme un acte écrit sous un `sub` (ancien ou actuel) — la lecture tolérante du plan, D4",
  ],
  [
    `${STAFF_DIR}invitations/open-staff-access.service.ts`,
    "l'invitation relie ou réutilise l'identité de la fiche",
  ],
  [
    `${STAFF_DIR}invitations/prisma-pending-staff-access.reader.ts`,
    "le `sub` d'une invitation en cours, pour relancer son lien",
  ],
  [
    `${STAFF_DIR}permissions/prisma-staff-access.resolver.ts`,
    "la résolution d'accès : du `sub` du jeton à la fiche",
  ],
]);

const COLUMN =
  /\b(?:auth0Id|auth0Sub|auth0_id|auth0_sub|staffSubjectAlias|staff_subject_aliases)\b/u;
/** Une interpolation de gabarit qui nomme une de ces colonnes. */
const IN_MESSAGE = /\$\{[^}]*\b(?:auth0Id|auth0Sub|auth0_id|auth0_sub)\b[^}]*\}/u;

/** Commentaires retirés : une porte qui lit la PROSE ne garde rien. */
function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
}

const readsColumn = (source) => COLUMN.test(withoutComments(source));
const writesInMessage = (source) => IN_MESSAGE.test(withoutComments(source));

/**
 * Le détecteur, éprouvé à chaque exécution. Une porte dont le motif s'est cassé
 * ne refuse plus rien, et le dit en vert.
 */
function selfCheck() {
  const reads = [
    ["x({ where: { auth0Id: s } });", true],
    ["select: { auth0Sub: true }", true],
    ["sql`SELECT auth0_id FROM staff_users`;", true],
    ["prisma.staffSubjectAlias.findMany();", true],
    ["// auth0Id dans un commentaire", false],
    ["/** auth0Sub */ x(user.id);", false],
  ];
  const messages = [
    ["logger.error(`Adresse pour ${before.auth0Id}`);", true],
    ["throw new E(`sub ${row.auth0Sub} inconnu`);", true],
    ["logger.error(`Adresse pour la fiche ${before.id}`);", false],
    ["// `${before.auth0Id}`", false],
  ];
  const broken = [
    ...reads.filter(([source, expected]) => readsColumn(source) !== expected),
    ...messages.filter(([source, expected]) => writesInMessage(source) !== expected),
  ];
  if (broken.length > 0) {
    console.error(
      `✗ auth0-id-readers : le détecteur se trompe sur ${broken.length} cas témoin(s).`,
    );
    process.exit(1);
  }
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return SKIP_DIRS.has(entry.name) ? [] : sourceFiles(path);
    }
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts") ? [path] : [];
  });
}

const unix = (path) => path.split("\\").join("/");
const inIdentityHome = (rel) => IDENTITY_HOMES.some((home) => rel.startsWith(home));

selfCheck();

const root = join(ROOT, SCAN_ROOT);
if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`✗ auth0-id-readers : ${SCAN_ROOT} introuvable.`);
  process.exit(1);
}

const newReaders = [];
const inMessages = [];
const readers = new Set();
for (const file of sourceFiles(root)) {
  const rel = unix(relative(ROOT, file));
  if (rel.includes("/platform/database/client/")) {
    continue;
  }
  const source = readFileSync(file, "utf8");
  if (writesInMessage(source)) {
    inMessages.push(rel);
  }
  if (inIdentityHome(rel) || !readsColumn(source)) {
    continue;
  }
  readers.add(rel);
  if (!ADMITTED.has(rel)) {
    newReaders.push(rel);
  }
}
const stale = [...ADMITTED.keys()].filter((rel) => !readers.has(rel));

if (inMessages.length + newReaders.length + stale.length > 0) {
  for (const rel of inMessages) {
    console.error(
      `✗ ${rel}\n    écrit un identifiant de connexion dans un message (log, erreur) : ` +
        "désignez la fiche ou le compte par SON id.",
    );
  }
  for (const rel of newReaders) {
    console.error(`✗ ${rel}\n    lit un identifiant de connexion hors de la liste admise.`);
  }
  for (const rel of stale) {
    console.error(`✗ ${rel}\n    est admis mais ne lit plus la colonne : retirez-le de ADMITTED.`);
  }
  console.error(
    "\n  Un auteur, un sujet de log, un identifiant servi à un écran est un id de chez nous.\n" +
      "  Si la lecture sert vraiment l'IDENTITÉ (le fournisseur de connexion ne connaît que\n" +
      "  le `sub`), ajoutez le fichier à ADMITTED avec sa raison écrite.\n",
  );
  process.exit(1);
}

console.log(
  `✓ auth0-id-readers : ${readers.size} lecteur(s) admis de l'identifiant de connexion ` +
    "hors de l'authentification ; aucun ne l'écrit dans un message.",
);
