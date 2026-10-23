#!/usr/bin/env node
/**
 * Gate : **le manifeste des textes des e-mails suit le dictionnaire**
 * (plan `documentation/contenu-ecommerce/plan-textes-des-e-mails.md`, E1).
 *
 * Il régénère le manifeste en mémoire et échoue si la version commitée en
 * diffère. Changer un texte, une section ou une variable permise oblige donc à
 * régénérer dans le même commit : le manifeste est ce que l'écran des textes
 * (E2, E3) lira pour dire quelles variables un texte peut et doit porter, et
 * un manifeste qui retarde laisserait refuser un texte juste, ou accepter un
 * texte qui part avec « {ref} » en clair.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { buildMailCopyManifest, MANIFEST_PATH, REGENERATE } from "../mail-copy/build.mjs";
import { ROOT } from "../shop-copy/load-ts.mjs";

const { count, json } = await buildMailCopyManifest();
const full = join(ROOT, MANIFEST_PATH);

if (!existsSync(full) || readFileSync(full, "utf8") !== json) {
  console.error("\n✖ Le manifeste des textes des e-mails ne correspond plus au dictionnaire :\n");
  console.error(`  ${MANIFEST_PATH}`);
  console.error(
    `\n  Un texte, une section ou une variable permise a changé dans apps/lfd-api/src/platform/mailer/copy/.\n  Régénérer par \`${REGENERATE}\` et commiter le résultat avec le texte.\n`,
  );
  process.exit(1);
}
console.log(`✓ mail-copy-digest : le manifeste suit le dictionnaire (${count} textes)`);
