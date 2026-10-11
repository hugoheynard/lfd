#!/usr/bin/env node
/**
 * Gate : **le recueil des textes de la boutique suit le code**
 * (plan `documentation/contenu-ecommerce/plan-textes-de-la-boutique.md`, §7 bis, §10).
 *
 * Trois vérifications :
 *
 * 1. Il régénère en mémoire le recueil et le manifeste, et échoue si les
 *    versions commitées en diffèrent. Changer un texte d'un dictionnaire oblige
 *    donc à régénérer dans le même commit : le recueil est la base de la
 *    reformulation, et un recueil qui retarde ferait reformuler un texte qui
 *    n'est plus servi.
 * 2. Les copies que l'API embarque (manifeste, renommages) sont celles de la
 *    boutique, à l'octet : l'API valide contre ce qu'elle a compilé (B1).
 * 3. Une clé du manifeste COMMITÉ (`HEAD`) qui disparaît du manifeste
 *    régénéré doit avoir son entrée dans `shop-copy-renames.json`, vers une clé
 *    qui existe — ou `null`, un retrait voulu. Sans elle, un remplacement publié deviendrait orphelin sans
 *    que personne l'ait décidé.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildShopCopyDigest,
  DIGEST_PATH,
  MANIFEST_PATH,
  REGENERATE,
} from "../shop-copy/build.mjs";
import {
  committedManifest,
  RENAMES_PATH,
  readRenames,
  staleEmbeddedCopies,
  vanishedKeys,
} from "../shop-copy/embedded.mjs";
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

const renames = readRenames();
const embedded = staleEmbeddedCopies({
  [MANIFEST_PATH]: json,
  [RENAMES_PATH]: readFileSync(join(ROOT, RENAMES_PATH), "utf8"),
});
if (embedded.length > 0) {
  console.error("\n✖ Les copies que l'API embarque ne sont plus celles de la boutique :\n");
  for (const path of embedded) console.error(`  ${path}`);
  console.error(`\n  Régénérer par \`${REGENERATE}\` et commiter les copies avec leur source.\n`);
  process.exit(1);
}

const vanished = vanishedKeys(committedManifest(), json, renames);
if (vanished.length > 0) {
  console.error("\n✖ Des clés du manifeste commité disparaissent sans renommage :\n");
  for (const key of vanished) console.error(`  ${key}`);
  console.error(
    `\n  Un remplacement publié sur l'une d'elles deviendrait orphelin. Déclarer\n  « ancienne → nouvelle » dans ${RENAMES_PATH} — ou « ancienne : null » si le\n  texte est retiré —, puis \`${REGENERATE}\`.\n`,
  );
  process.exit(1);
}
console.log(
  "✓ shop-copy-digest : le recueil, le manifeste et les copies de l'API suivent les dictionnaires ; aucune clé ne disparaît sans renommage",
);
