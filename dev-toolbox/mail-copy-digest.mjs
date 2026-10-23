#!/usr/bin/env node
/**
 * Régénère le **manifeste des textes des e-mails** (`pnpm mail-copy:digest`) —
 * plan `documentation/contenu-ecommerce/plan-textes-des-e-mails.md`, E1.
 *
 * Un manifeste recopié vieillirait au premier texte changé ; celui-ci se
 * refait depuis le dictionnaire, et `lint:mail-copy-digest` refuse qu'il
 * retarde.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildMailCopyManifest, MANIFEST_PATH } from "./mail-copy/build.mjs";
import { ROOT } from "./shop-copy/load-ts.mjs";

const { manifest, count, json } = await buildMailCopyManifest();
writeFileSync(join(ROOT, MANIFEST_PATH), json);
console.log(
  `✓ ${count} textes de ${Object.keys(manifest.mails).length} e-mails → ${MANIFEST_PATH}`,
);
