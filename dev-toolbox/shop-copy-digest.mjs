#!/usr/bin/env node
/**
 * Régénère le **recueil des textes de la boutique** et son manifeste
 * (`pnpm copy:digest`) — plan `documentation/contenu-ecommerce/plan-textes-de-la-boutique.md`, §7 bis.
 *
 * Un recueil recopié vieillirait au premier texte changé ; celui-ci se refait
 * depuis les dictionnaires, et `lint:shop-copy-digest` refuse qu'il retarde.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildShopCopyDigest, DIGEST_PATH, MANIFEST_PATH } from "./shop-copy/build.mjs";
import { ROOT } from "./shop-copy/load-ts.mjs";

const { spaces, markdown, json } = await buildShopCopyDigest();
writeFileSync(join(ROOT, DIGEST_PATH), markdown);
writeFileSync(join(ROOT, MANIFEST_PATH), json);
const total = spaces.reduce((n, s) => n + s.entries.length, 0);
const unrecorded = spaces.reduce((n, s) => n + s.unrecorded.length, 0);
console.log(
  `✓ ${total} textes dans ${spaces.length} espaces, ${unrecorded} non recensés → ${DIGEST_PATH}, ${MANIFEST_PATH}`,
);
