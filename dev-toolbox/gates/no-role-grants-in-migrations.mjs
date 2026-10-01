#!/usr/bin/env node
/**
 * Gate : **une migration ajoute une ressource, jamais un droit à un rôle.**
 *
 * Plan `documentation/livraisons/plan-droits-par-geste.md`, DG-D2 et 5.5. Seize
 * migrations ont écrit dans `staff_role_definitions` entre le 2026-09-01 et le
 * 2026-10-01 : chaque ressource neuve arrivait avec « son attribution à des
 * rôles », si bien que qui avait quel droit se décidait dans le code, contre
 * l'écran `/admin/staff-roles` censé le régler. La règle, écrite dans le
 * `CLAUDE.md`, serait restée de la prose contre seize précédents.
 *
 * ## Ce qu'elle refuse
 *
 * Toute mention de `staff_role_definitions` ou de `staff_permission_overrides`
 * dans le SQL (commentaires `--` ôtés) d'un `migration.sql` POSTÉRIEUR à la
 * bascule des droits par geste.
 *
 * ## Ce qu'elle laisse
 *
 * - les migrations d'avant la bascule — elles sont l'histoire, et un
 *   `migration.sql` appliqué ne se touche pas ;
 * - **la bascule elle-même** (`20261001130200_la_bascule_des_droits_par_geste`),
 *   seule exception, datée : une ressource qui reprend des routes existantes ne
 *   devait faire perdre l'accès à personne le jour du déploiement.
 *
 * Si la bascule disparaît du dossier, la porte échoue : sans son repère, elle
 * ne saurait plus où commence l'interdit, et se tairait.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const MIGRATIONS = join(ROOT, "apps/lfd-api/prisma/migrations");

/** La seule migration admise à écrire des droits — et le repère de l'interdit. */
const SWITCHOVER = "20261001130200_la_bascule_des_droits_par_geste";

/** Les tables où vivent les droits d'un rôle et les écarts d'une personne. */
const GRANT_TABLES = /\b(staff_role_definitions|staff_permission_overrides)\b/g;

/** Le SQL sans ses commentaires de ligne : expliquer la règle n'est pas l'enfreindre. */
function withoutComments(sql) {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/u, ""))
    .join("\n");
}

if (!existsSync(join(MIGRATIONS, SWITCHOVER, "migration.sql"))) {
  console.error(
    `\n✗ no-role-grants-in-migrations\n\n  Repère introuvable : ${SWITCHOVER}.\n` +
      "  La porte compte à partir de la bascule des droits par geste ; sans elle, elle ne\n" +
      "  sait plus où commence l'interdit. Rétablir le dossier, ou mettre à jour le repère.\n",
  );
  process.exit(1);
}

const later = readdirSync(MIGRATIONS)
  .filter((entry) => statSync(join(MIGRATIONS, entry)).isDirectory())
  .filter((entry) => entry > SWITCHOVER)
  .sort();

const failures = [];
for (const migration of later) {
  const file = join(MIGRATIONS, migration, "migration.sql");
  if (!existsSync(file)) {
    continue;
  }
  const hits = withoutComments(readFileSync(file, "utf8")).match(GRANT_TABLES) ?? [];
  if (hits.length > 0) {
    failures.push(`${migration}  écrit des droits : ${[...new Set(hits)].join(", ")}`);
  }
}

if (failures.length > 0) {
  console.error("\n✗ no-role-grants-in-migrations\n");
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  console.error(
    '\n  Une migration ajoute une ressource (`ALTER TYPE "StaffResource" ADD VALUE`), jamais\n' +
      "  un droit à un rôle : qui a quel droit se règle à l'écran (/admin/staff-roles). Une\n" +
      "  ressource neuve s'accorde à l'admin à l'écran tant que l'admin n'est pas calculé\n" +
      "  (documentation/livraisons/plan-droits-par-geste.md, DG-D2 et 5.4).\n",
  );
  process.exit(1);
}

console.log(
  `✓ no-role-grants-in-migrations : ${String(later.length)} migration(s) après la bascule,\n` +
    `  aucune n'écrit de droit ; ${SWITCHOVER} reste la seule exception.`,
);
