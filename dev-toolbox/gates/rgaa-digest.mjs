#!/usr/bin/env node
/**
 * Gate : **le suivi d'accessibilité que l'API sert suit la grille d'audit**
 * (`documentation/accessibilite/grille-audit-rgaa.md`).
 *
 * Il régénère en mémoire le fichier embarqué et échoue s'il diffère de celui
 * commité. Une correction ajoutée à la grille sans `pnpm rgaa:digest` ne
 * serait jamais publiée — et une ligne retirée resterait affichée.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  EMBEDDED_PATH,
  followUpJson,
  GRID_PATH,
  REGENERATE,
  ROOT,
} from "../accessibilite/rgaa-follow-up.mjs";

const expected = followUpJson();
const full = join(ROOT, EMBEDDED_PATH);
if (!existsSync(full) || readFileSync(full, "utf8") !== expected) {
  console.error(`\n✖ Le suivi d'accessibilité embarqué ne correspond plus à la grille :\n`);
  console.error(`  ${EMBEDDED_PATH}`);
  console.error(
    `\n  ${GRID_PATH} a changé. Régénérer par \`${REGENERATE}\` et commiter le résultat avec la grille.\n`,
  );
  process.exit(1);
}
console.log("✓ rgaa-digest : le suivi d'accessibilité de l'API suit la grille d'audit");
