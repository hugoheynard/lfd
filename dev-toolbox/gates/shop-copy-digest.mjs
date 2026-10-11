#!/usr/bin/env node
/**
 * Gate : **le recueil des textes de la boutique suit le code**
 * (plan `documentation/contenu-ecommerce/plan-textes-de-la-boutique.md`, §7 bis).
 *
 * Il régénère en mémoire le recueil et le manifeste, et échoue si les versions
 * commitées en diffèrent. Changer un texte d'un dictionnaire oblige donc à
 * régénérer dans le même commit : le recueil est la base de la reformulation,
 * et un recueil qui retarde ferait reformuler un texte qui n'est plus servi.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildShopCopyDigest,
  DIGEST_PATH,
  MANIFEST_PATH,
  REGENERATE,
} from "../shop-copy/build.mjs";
import { ROOT } from "../shop-copy/load-ts.mjs";

const { markdown, json } = await buildShopCopyDigest();
const stale = [
  [DIGEST_PATH, markdown],
  [MANIFEST_PATH, json],
].filter(([path, expected]) => {
  const full = join(ROOT, path);
  return !existsSync(full) || readFileSync(full, "utf8") !== expected;
});

if (stale.length > 0) {
  console.error(
    "\n✖ Le recueil des textes de la boutique ne correspond plus aux dictionnaires :\n",
  );
  for (const [path] of stale) console.error(`  ${path}`);
  console.error(
    `\n  Un texte a changé dans apps/lfc-ecommerce-frontend/src/app/client/copy/.\n  Régénérer par \`${REGENERATE}\` et commiter le résultat avec le texte.\n`,
  );
  process.exit(1);
}
console.log("✓ shop-copy-digest : le recueil et le manifeste suivent les dictionnaires");
