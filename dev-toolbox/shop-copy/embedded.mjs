/**
 * **Ce que l'API embarque** des textes de la boutique, et les renommages de
 * clés (plan `documentation/contenu-ecommerce/plan-textes-de-la-boutique.md`, §10).
 *
 * L'API valide un remplacement contre le manifeste de SON build (B1). Son
 * `tsc` émet depuis `apps/lfd-api/src` (`rootDir`) et `pnpm deploy` n'empaquette
 * que l'API : importer le fichier de la boutique en place ne compilerait pas.
 * Le générateur en dépose donc une COPIE à l'identique sous l'API, et la porte
 * refuse une copie qui diffère de la source.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { COPY_DIR, MANIFEST_PATH } from "./build.mjs";
import { ROOT } from "./load-ts.mjs";

/** Le fichier des renommages, tenu à la main à côté des dictionnaires. */
export const RENAMES_PATH = `${COPY_DIR}/shop-copy-renames.json`;

const API_EMBEDDED_DIR = "apps/lfd-api/src/b2b/shop-copy/infrastructure/embedded";

/** Source → copie embarquée par l'API. */
export const EMBEDDED_COPIES = [
  [MANIFEST_PATH, `${API_EMBEDDED_DIR}/shop-copy-manifest.json`],
  [RENAMES_PATH, `${API_EMBEDDED_DIR}/shop-copy-renames.json`],
];

/** Les renommages `ancienne clé → nouvelle`, relus et vérifiés dans leur forme. */
export function readRenames() {
  const raw = JSON.parse(readFileSync(join(ROOT, RENAMES_PATH), "utf8"));
  const renames = raw.renames;
  if (renames === null || typeof renames !== "object" || Array.isArray(renames)) {
    throw new Error(`${RENAMES_PATH} : la clé « renames » doit être un objet ancienne → nouvelle.`);
  }
  for (const [from, to] of Object.entries(renames)) {
    if (typeof to !== "string" || to.length === 0 || to === from) {
      throw new Error(`${RENAMES_PATH} : « ${from} » doit pointer vers une autre clé, non vide.`);
    }
  }
  return renames;
}

/** Les clés d'un manifeste (sa forme JSON). */
export function keysOf(manifestJson) {
  return new Set(
    JSON.parse(manifestJson).spaces.flatMap((space) => space.entries.map((entry) => entry.key)),
  );
}

/**
 * Le manifeste tel qu'il est COMMITÉ (`HEAD`) — `null` hors d'un dépôt git ou
 * avant son premier commit : il n'y a alors rien à comparer.
 */
export function committedManifest() {
  try {
    return execFileSync("git", ["show", `HEAD:${MANIFEST_PATH}`], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

/**
 * Les clés du manifeste commité qui disparaissent sans renommage vers une clé
 * qui existe. Un remplacement publié sur l'une d'elles deviendrait orphelin en
 * silence : un renommage doit être un geste explicite (§10).
 */
export function vanishedKeys(committedJson, nextJson, renames) {
  if (committedJson === null) return [];
  const next = keysOf(nextJson);
  return [...keysOf(committedJson)]
    .filter((key) => !next.has(key))
    .filter((key) => renames[key] === undefined || !next.has(renames[key]));
}

/** Les copies embarquées qui manquent ou diffèrent de leur source. */
export function staleEmbeddedCopies(sources) {
  return EMBEDDED_COPIES.filter(([source, copy]) => {
    const full = join(ROOT, copy);
    return !existsSync(full) || readFileSync(full, "utf8") !== sources[source];
  }).map(([, copy]) => copy);
}
