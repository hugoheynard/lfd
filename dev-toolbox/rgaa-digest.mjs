#!/usr/bin/env node
/**
 * Régénère le **suivi d'accessibilité** que l'API embarque (`pnpm rgaa:digest`)
 * depuis la grille d'audit — `documentation/accessibilite/grille-audit-rgaa.md`.
 *
 * L'API part de `src/` et le déploiement n'empaquette qu'elle : elle ne peut
 * pas lire la grille de `documentation/` en place. Le script en dépose donc la
 * part publique sous l'API, et `lint:rgaa-digest` refuse une copie qui retarde.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { EMBEDDED_PATH, followUpJson, ROOT } from "./accessibilite/rgaa-follow-up.mjs";

const json = followUpJson();
writeFileSync(join(ROOT, EMBEDDED_PATH), json);
const { corrections } = JSON.parse(json);
console.log(`✓ ${corrections.length} corrections → ${EMBEDDED_PATH}`);
