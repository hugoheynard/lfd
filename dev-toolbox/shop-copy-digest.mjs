#!/usr/bin/env node
/**
 * Régénère le **recueil des textes de la boutique** et son manifeste
 * (`pnpm copy:digest`) — plan `documentation/contenu-ecommerce/plan-textes-de-la-boutique.md`, §7 bis.
 *
 * Un recueil recopié vieillirait au premier texte changé ; celui-ci se refait
 * depuis les dictionnaires, et `lint:shop-copy-digest` refuse qu'il retarde.
 * Il dépose aussi les copies que l'API embarque (manifeste, renommages — §10).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildShopCopyDigest, DIGEST_PATH, MANIFEST_PATH } from "./shop-copy/build.mjs";
import { EMBEDDED_COPIES, RENAMES_PATH, readRenames } from "./shop-copy/embedded.mjs";
import { ROOT } from "./shop-copy/load-ts.mjs";

const { spaces, markdown, json } = await buildShopCopyDigest();
readRenames();
writeFileSync(join(ROOT, DIGEST_PATH), markdown);
writeFileSync(join(ROOT, MANIFEST_PATH), json);
const sources = {
  [MANIFEST_PATH]: json,
  [RENAMES_PATH]: readFileSync(join(ROOT, RENAMES_PATH), "utf8"),
};
for (const [source, copy] of EMBEDDED_COPIES) writeFileSync(join(ROOT, copy), sources[source]);
const total = spaces.reduce((n, s) => n + s.entries.length, 0);
const unrecorded = spaces.reduce((n, s) => n + s.unrecorded.length, 0);
console.log(
  `✓ ${total} textes dans ${spaces.length} espaces, ${unrecorded} non recensés → ${DIGEST_PATH}, ${MANIFEST_PATH}, copies de l'API`,
);
